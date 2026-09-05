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
  // Issue #16 (plan-b): 直前ターン（previousSpeakerId → previousTargetIds）の発話内容
  // （DialogueAct/Topic/Memory）から見て、そのペアへの発話集中が正当化されるかどうか
  // （SessionState.pairFocusJustified、ConversationManagerが算出）。
  // true: 自分語り・二人だけの思い出等で正当化される→発話頻度バランス補正を緩める。
  // false: 正当化する裏付けが無い→発話頻度バランス補正をより強く効かせる。
  // undefined（会話開始直後等）: 補正は基準値のまま変更しない。
  pairFocusJustified?: boolean;
}

const NAMED_BONUS = 2.0;
const FREQUENCY_WEIGHT = 0.3;
const RECENT_WINDOW_SIZE = 4;
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
// Issue #16 (plan-b): 発話頻度バランス補正（FREQUENCY_WEIGHT）自体の基本パラメータは
// plan-a（別案、既存の頻度・関係性スコアのチューニング担当）の変更対象であり、
// ここでは変更しない。代わりに、pairFocusJustifiedの値に応じて補正の「効き具合」を
// 乗数で緩める/強めるだけにとどめる。具体的な倍率はfeatures.mdに明記が無いため
// 実装者判断で設定した（doc/changelog/20260905-003720-content-justified-speaker-balance.md）。1.0を挟んで対称にせず「強める」側を
// やや大きくしたのは、Issueが問題視しているのは「正当な理由なく偏る」ケースであり、
// 是正側の効果を確実に出したいため。
const FREQUENCY_WEIGHT_JUSTIFIED_MULTIPLIER = 0.4;
const FREQUENCY_WEIGHT_UNJUSTIFIED_MULTIPLIER = 1.6;

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

    const window = recentSpeakerIds.slice(-RECENT_WINDOW_SIZE);
    const occurrences = window.filter((id) => id === candidateId).length;
    const frequencyMultiplier = this.resolveFrequencyMultiplier(context.pairFocusJustified);
    score += (RECENT_WINDOW_SIZE - occurrences) * FREQUENCY_WEIGHT * frequencyMultiplier;

    const energy = characterStates.get(candidateId)?.energy;
    if (energy !== undefined) {
      score += energy * PERSONALITY_WEIGHT;
    }

    if (this.relationshipManager && previousSpeakerId) {
      const { edge } = this.relationshipManager.resolve(previousSpeakerId, candidateId);
      score += edge.intimacy * RELATIONSHIP_WEIGHT;
    }

    return score;
  }

  // Issue #16 (plan-b): pairFocusJustifiedがundefined（会話開始直後など、まだ内容面の
  // 正当化判定が行われていない状態）の場合は基準値（1.0倍）のまま変更しない。
  private resolveFrequencyMultiplier(pairFocusJustified: boolean | undefined): number {
    if (pairFocusJustified === undefined) return 1.0;
    return pairFocusJustified
      ? FREQUENCY_WEIGHT_JUSTIFIED_MULTIPLIER
      : FREQUENCY_WEIGHT_UNJUSTIFIED_MULTIPLIER;
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
