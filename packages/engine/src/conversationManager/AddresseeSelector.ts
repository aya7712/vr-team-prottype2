import type { RelationshipManager } from '../relationship/RelationshipManager.js';

export interface AddresseeSelectionContext {
  speakerId: string;
  participantIds: string[];
  // SpeakerSelector.recentSpeakerIdsと対になる指標。直近ターンで実際に呼びかけの対象に
  // なったキャラクターIDを平坦化した配列（古い→新しい順）。全員向け発話のターンは
  // 対象全員分（話者以外の参加者IDすべて）がまとめて含まれる。特定の1〜2人にばかり
  // 呼びかけが偏るのを防ぐための発話頻度バランス算出に使う（Issue #15、plan-c）。
  recentTargetIds: string[];
  // 自己レビュー（code-reviewスキル）対応: 直前ターンの話者と、その話者が誰に呼びかけたか。
  // 直前ターンでspeakerId（今回の話者）自身が名指しされていた場合、その話者（＝自分に
  // 話しかけてきた相手）に返す方向へスコアを補正する（「話者が誰かに呼びかけられたのに
  // 全く別の相手に話しかけて質問が宙に浮く」ケースを減らすため）。
  previousSpeakerId?: string;
  previousTargetIds?: string[];
}

export interface AddresseeSelection {
  // relationshipManager.resolve・TopicClassifier.classify・MemoryRetriever.retrieve等、
  // 既存処理は常に1名のtargetIdを要求するため、isEveryoneがtrueの場合も「関係性・発話頻度
  // バランス上もっとも話しかけられそうな相手」を代表値としてここに入れる
  // （ConversationManager側の既存インターフェースを変えずに済ませるための実装判断）。
  targetId: string;
  // true: 今回の発話は特定の1人にではなく参加者全員に向けたもの（名指しの呼びかけをしない）。
  // false: targetIdの相手に名指しで話しかける。
  isEveryone: boolean;
}

const RELATIONSHIP_WEIGHT = 0.5;
const FREQUENCY_WEIGHT = 0.3;
const RECENT_WINDOW_SIZE = 4;
// 自己レビュー対応: 直前ターンで自分（話者）を名指しした相手に返答が返りやすくする補正
// （SpeakerSelector.NAMED_BONUS=2.0と同系統の「名指しの往復」を担保するための値。
// 値自体はfeatures.md/class-design.mdに仕様が無いため実装者判断で設定した）。
const RECIPROCITY_BONUS = 1.5;
// 3人以上の会話でも一定確率で「全員向け」を残す（class-design.md/features.mdに数値仕様が
// 無いため実装者判断で設定。毎ターン必ず1人を名指しし続けると不自然になる懸念（Issue #15
// 案plan-cのrisks）に対応するための確率制御）。
const EVERYONE_PROBABILITY = 0.3;

/**
 * 発話生成前に「誰に話すか（呼びかけ相手）」を能動的に決定する（F6.2、Issue #15 plan-c）。
 *
 * SpeakerSelector（「誰が話すか」）と対になるコンポーネント。class-design.md/features.mdの
 * F6.2は「誰が話すか」のみを対象範囲としており「誰に話すか」の決定ロジックは存在しなかった
 * （ConversationManager.runTurnが直前の話者を機械的にtargetIdとするだけだった）。
 * 生成後のtargetIdsはここで決定したaddresseeをそのまま採用し、発話テキストの事後解析はしない。
 */
export class AddresseeSelector {
  constructor(
    private readonly relationshipManager?: RelationshipManager,
    private readonly random: () => number = Math.random,
  ) {}

  select(context: AddresseeSelectionContext): AddresseeSelection {
    const { speakerId, participantIds } = context;
    const candidates = participantIds.filter((id) => id !== speakerId);
    if (candidates.length === 0) {
      throw new Error('AddresseeSelector: 話者以外の参加者が必要です');
    }
    if (candidates.length === 1) {
      // 2人会話では「全員向け」が「特定の相手向け」と区別する意味を持たないため、
      // 常に唯一の相手を返す（T12までの「常に相手を返す」挙動をそのまま維持する）。
      return { targetId: candidates[0], isEveryone: false };
    }

    const scores = candidates.map((id) => this.scoreCandidate(id, context));
    const targetId = this.sample(candidates, scores);
    const isEveryone = this.random() < EVERYONE_PROBABILITY;
    return { targetId, isEveryone };
  }

  private scoreCandidate(candidateId: string, context: AddresseeSelectionContext): number {
    const { speakerId, recentTargetIds, previousSpeakerId, previousTargetIds } = context;

    let score = 1.0;

    const window = recentTargetIds.slice(-RECENT_WINDOW_SIZE);
    const occurrences = window.filter((id) => id === candidateId).length;
    score += (RECENT_WINDOW_SIZE - occurrences) * FREQUENCY_WEIGHT;

    if (this.relationshipManager) {
      const { edge } = this.relationshipManager.resolve(speakerId, candidateId);
      score += edge.intimacy * RELATIONSHIP_WEIGHT;
    }

    if (candidateId === previousSpeakerId && previousTargetIds?.includes(speakerId)) {
      score += RECIPROCITY_BONUS;
    }

    return score;
  }

  // SpeakerSelector.sampleと同じ考え方（Softmax化→累積確率でのサンプリング）。
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
