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
  // Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisor（llm層、追加のLLM呼び出し1回）に
  // よる、発話の偏りが内容的に正当化されるかの判定結果。justified:trueの場合は
  // 頻度バランス補正を緩め（自分語り・二人の思い出話等、偏りが自然な区間の継続を
  // 妨げないため）、recommendedSpeakerIdが指定されていればそのキャラクターの
  // スコアを引き上げる。呼び出し失敗時/判定材料が無い場合はConversationManager側で
  // justified:false・recommendedSpeakerId:nullとして渡され、実質的に既存挙動のまま
  // （補正なし）になる。省略時（テスト等）も同様に既存挙動のまま。
  speakerBalanceAdvice?: { justified: boolean; recommendedSpeakerId: string | null };
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
// Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorが提案したrecommendedSpeakerIdへの
// ボーナス。NAMED_BONUS（名指し）と同程度の強さにし、名指しほど絶対ではないが
// 積極性・関係性より優先されやすい水準にする（実装者判断）。
const SPEAKER_BALANCE_RECOMMENDATION_BONUS = 2.0;
// justified:true（偏りが内容的に正当）の場合、頻度バランス補正の強さをこの係数で弱める。
// 0にはせず、正当化された偏りが続く区間でも他キャラが完全に発言機会を失わない程度には
// 残す（実装者判断）。
const SPEAKER_BALANCE_JUSTIFIED_FREQUENCY_SCALE = 0.3;

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
    const {
      previousSpeakerId,
      previousTargetIds,
      recentSpeakerIds,
      characterStates,
      speakerBalanceAdvice,
    } = context;

    let score = 1.0;

    if (previousTargetIds?.includes(candidateId)) {
      score += NAMED_BONUS;
    }

    const window = recentSpeakerIds.slice(-RECENT_WINDOW_SIZE);
    const occurrences = window.filter((id) => id === candidateId).length;
    // Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorが「現在の偏りは内容的に正当」と
    // 判定した場合（自分語り・二人の思い出話の継続等）、通常の頻度バランス補正が
    // その自然な継続を妨げてしまうため、補正の強さを弱める。
    const frequencyWeight = speakerBalanceAdvice?.justified
      ? FREQUENCY_WEIGHT * SPEAKER_BALANCE_JUSTIFIED_FREQUENCY_SCALE
      : FREQUENCY_WEIGHT;
    score += (RECENT_WINDOW_SIZE - occurrences) * frequencyWeight;

    const energy = characterStates.get(candidateId)?.energy;
    if (energy !== undefined) {
      score += energy * PERSONALITY_WEIGHT;
    }

    if (this.relationshipManager && previousSpeakerId) {
      const { edge } = this.relationshipManager.resolve(previousSpeakerId, candidateId);
      score += edge.intimacy * RELATIONSHIP_WEIGHT;
    }

    // Issue #16対応（plan-c、T44）: 理由のない偏りがあると判定された場合、
    // SpeakerBalanceAdvisorが提案した次話者候補のスコアを底上げする。
    if (speakerBalanceAdvice?.recommendedSpeakerId === candidateId) {
      score += SPEAKER_BALANCE_RECOMMENDATION_BONUS;
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
