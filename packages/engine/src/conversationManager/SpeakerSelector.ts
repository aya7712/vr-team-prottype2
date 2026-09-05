import type { CharacterState } from '../types/character.js';
import type { RelationshipManager } from '../relationship/RelationshipManager.js';

export interface SpeakerSelectionContext {
  participantIds: string[];
  previousSpeakerId?: string;
  // T29: 直前ターンの発話が誰に向けられていたか（SessionState.previousTargetIds）。
  // ここに含まれる候補は「名指し/呼びかけ」として最優先候補になる（features.md F6.2）。
  previousTargetIds?: string[];
  // 直近ターンの話者履歴（古い→新しい順）。発話頻度バランスの算出に使う。
  recentSpeakerIds: string[];
  // 各キャラクターの直近状態。「積極性」の代理指標として使う（後述）。
  characterStates: Map<string, CharacterState>;
}

const NAMED_BONUS = 2.0;
// T44 (Issue #16 plan-a): ウィンドウ拡大(4→12)に伴い、頻度ペナルティの最大振れ幅
// (FREQUENCY_WEIGHT * RECENT_WINDOW_SIZE)がNAMED_BONUSを上回らないよう、
// 0.3から0.15に下げた（独立レビューでの指摘: 0.3のままだと直近ウィンドウの
// ほとんどを占める「名指しされた候補」が、直近0回発話の「名指しされていない候補」に
// スコアで逆転され、features.md F6.2が定める「名指しされた候補は最優先」という
// 既存の不変条件が崩れるケースが存在した）。0.15なら最大振れ幅は1.8
// (<NAMED_BONUS=2.0)に収まり、この逆転は起きない
// （実測: occurrences=11・名指しなしの対抗候補がoccurrences=0という最悪ケースでも
// 名指しされた候補のスコアが上回ることをスクリプトで確認済み）。
const FREQUENCY_WEIGHT = 0.15;
// T44 (Issue #16 plan-a): 発話バランス補正の参照ウィンドウ。旧実装は直近4ターンのみを
// 見ており、「二人だけで10ターン以上話し続ける」ような長時間の偏りに対して補正が
// 効かなかった（4ターンより前の偏りは可視化されないため）。直近10〜12ターン程度に
// 広げることで、短い自然な往復（2〜3ターンのやり取り）は許容しつつ、長時間の独占には
// 補正が効くようにする。この定数はConversationManagerの短期履歴保持件数
// （SessionState.recentUtterances）と対応させる必要があるため、exportして共有する。
export const RECENT_WINDOW_SIZE = 12;
// features.md F6.2の「積極性（Personality）」はtalkative等の性格特性を想定しているが、
// CharacterDefRecord.personalityは自由記述テキストであり、CharacterState（F1）にも
// 構造化された「積極性」フィールドが存在しない。そのため、既にCharacterBrainが
// 状態として保持しているenergy（F1で会話イベントに応じて上下する値）を積極性の
// 代理指標として使う（実装者判断、implementation-rules.md 9章）。
const PERSONALITY_WEIGHT = 0.5;
// 「関係性」（現在の話題が特定ペアの共有記憶に強く関連する場合、そのペア内の
// もう一方の選出確率を上げる）は、話者選択が話題分類・記憶検索より前に実行される
// （ConversationManager.runTurnの処理順）ため、選択時点では「現在の話題」が
// まだ存在しない。そのため、直前の話者との関係性（intimacy）を代理指標として使い、
// 「直前の話者と親密な相手が会話に加わりやすい」という簡略化したモデルとする
// （実装者判断、implementation-rules.md 9章）。
const RELATIONSHIP_WEIGHT = 0.5;

/**
 * 次の発話者を選択する（F6.2本実装）。名指し優先・発話頻度バランス・積極性・関係性を
 * 考慮してスコア化し、Softmaxで確率的に選択する。参加者が2名のみの場合は
 * 直前の話者以外に候補が1名しかいないため、結果として常に交互発話になる
 * （T12時点の「常に相手を返す」実装と同じ挙動に自然に帰着する）。
 */
export class SpeakerSelector {
  constructor(
    private readonly relationshipManager?: RelationshipManager,
    private readonly random: () => number = Math.random,
  ) {}

  selectNext(context: SpeakerSelectionContext): string {
    const { participantIds, previousSpeakerId } = context;
    if (participantIds.length === 0) {
      throw new Error('SpeakerSelector: participantIdsが空です');
    }

    if (!previousSpeakerId) {
      return participantIds[0];
    }

    const candidates = participantIds.filter((id) => id !== previousSpeakerId);
    if (candidates.length === 0) {
      // 参加者が1名のみの場合（通常発生しない）は直前の話者を返すしかない。
      return previousSpeakerId;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }

    const scores = candidates.map((id) => this.scoreCandidate(id, context));
    return this.sample(candidates, scores);
  }

  private scoreCandidate(candidateId: string, context: SpeakerSelectionContext): number {
    const { previousSpeakerId, previousTargetIds, recentSpeakerIds, characterStates } = context;

    let score = 1.0;

    if (previousTargetIds?.includes(candidateId)) {
      score += NAMED_BONUS;
    }

    // T44 (Issue #16 plan-a): 直近RECENT_WINDOW_SIZEターンにおける発話頻度を見て、
    // 発話が少ないほど加点する。ペナルティ（満額からの減点）を発話回数(occurrences)の
    // 二乗に比例させることで、旧実装の線形補正（発話回数の増分にそのまま比例して減点）
    // より非線形（凸関数）なカーブになる。2〜3回程度の短い発話（自然な短い往復）への
    // 減点は小さく抑えつつ、直近ウィンドウの大半を占めるような長時間の独占には
    // 急激に（加速度的に）減点が効くようにするのが狙い。分母は実際の履歴件数ではなく
    // 定数RECENT_WINDOW_SIZEを使うことで、会話開始直後（履歴が短い）でも0除算を避けつつ
    // 全候補が同一の満額から始まる（旧実装と同じ考え方）。
    const window = recentSpeakerIds.slice(-RECENT_WINDOW_SIZE);
    const occurrences = window.filter((id) => id === candidateId).length;
    score +=
      FREQUENCY_WEIGHT * (RECENT_WINDOW_SIZE - (occurrences * occurrences) / RECENT_WINDOW_SIZE);

    const energy = characterStates.get(candidateId)?.energy;
    if (energy !== undefined) {
      score += energy * PERSONALITY_WEIGHT;
    }

    if (this.relationshipManager && previousSpeakerId) {
      const { edge } = this.relationshipManager.resolve(previousSpeakerId, candidateId);
      // T44 (Issue #16 plan-a): RelationshipUpdaterは同じペアが会話するたびにintimacyを
      // 上げるため、intimacyをそのまま加点し続けると「話すほど選ばれやすくなり、選ばれる
      // ほど話す」正のフィードバック（richer-get-richer）が生じ、Issue #16の偏りの主因に
      // なっていた。直近ウィンドウ内で(直前の話者, candidate)のペアがどれだけの割合を
      // 占めているか(pairShare)を見て、そのペアが直近を支配しているほど関係性ボーナスを
      // 減衰させる（pairShare=1＝ウィンドウ全てがこのペア→ボーナス0、
      // pairShare=0＝このペアは直近に登場していない→ボーナスは従来通り）。
      const pairOccurrences = window.filter(
        (id) => id === previousSpeakerId || id === candidateId,
      ).length;
      const pairShare = pairOccurrences / RECENT_WINDOW_SIZE;
      const relationshipDecay = Math.max(0, 1 - pairShare);
      score += relationshipDecay * edge.intimacy * RELATIONSHIP_WEIGHT;
    }

    return score;
  }

  // DialoguePlanner.SoftmaxSelectorと同じ考え方（Softmax化→累積確率でのサンプリング）。
  private sample(candidates: string[], scores: number[]): string {
    const exponents = scores.map((s) => Math.exp(s));
    const total = exponents.reduce((sum, v) => sum + v, 0);
    const probabilities = exponents.map((v) => (total === 0 ? 1 / scores.length : v / total));

    const roll = this.random();
    let cumulative = 0;
    for (let i = 0; i < candidates.length; i++) {
      cumulative += probabilities[i];
      if (roll < cumulative) {
        return candidates[i];
      }
    }
    return candidates[candidates.length - 1];
  }
}
