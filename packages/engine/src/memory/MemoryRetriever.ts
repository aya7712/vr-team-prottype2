import type { MemoryItem } from '../types/memory.js';
import type { MemoryRepository } from './MemoryRepository.js';
import type { MemoryQuery } from './types.js';

const RECALL_DEDUP_WINDOW_TURNS = 5;
const MAX_RESULTS = 3;

function keywordScore(item: MemoryItem, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const haystack = [item.summary, item.tags.join(' '), item.body ?? ''].join(' ').toLowerCase();
  return keywords.reduce(
    (score, keyword) => (haystack.includes(keyword.toLowerCase()) ? score + 1 : score),
    0,
  );
}

/**
 * F3.4のキーワードマッチのみの簡易版（T07）。
 * data-design.md 6.2の①〜④のうち、①FTS5候補抽出と②意味的再ランキング（Embedding）は
 * T15で追加する。本実装は全候補（③フィルタリング相当）に対して単純なキーワード
 * 一致件数でスコアリングし、④の上位選出とrecordRecallのみを行う。
 *
 * class-design.md旧版ではEmbeddingService（F7、T10/T15で実装予定）にも依存する設計
 * だったが、意味検索を後回しにする本TODOのスコープに合わせて依存から外している。
 */
export class MemoryRetriever {
  constructor(private readonly repo: MemoryRepository) {}

  async retrieve(query: MemoryQuery): Promise<MemoryItem[]> {
    // 6.3: participantsに話者が含まれる記憶のみが自己記憶/共有記憶の候補になる。
    const speakerCandidates = await this.repo.getAllCandidates({
      participants: [query.speakerId],
    });

    // 6.3: 自己記憶（participantsが話者のみ）は常に対象。共有記憶
    // （participantsが2名以上）は、今の会話相手（targetIds）が参加者に
    // 含まれる場合のみ対象にする（無関係な第三者との共有記憶は使わない）。
    // targetIdsが空（相手がいない）場合は自己記憶のみが対象になる。
    const candidates = speakerCandidates.filter((item) => {
      const isSelfMemory = item.participants.length <= 1;
      if (isSelfMemory) return true;
      return query.targetIds.some((targetId) => item.participants.includes(targetId));
    });

    // 6.2③: 相手がいる会話ではshareable:falseの記憶を発話材料として使わない
    // （data-design.md 4.3: 自身の内的バイアス計算にのみ使ってよく、発話材料には使わない）。
    const hasOtherParty = query.targetIds.length > 0;
    const shareableFiltered = candidates.filter((item) => item.shareable || !hasOtherParty);

    // 6.2③: 直近数ターン以内に想起済みの記憶は除外する（重複回避）。
    const recentlyRecalledIds = new Set(
      await this.repo.getRecentRecalls(query.sessionId, RECALL_DEDUP_WINDOW_TURNS),
    );
    const notRecentlyRecalled = shareableFiltered.filter(
      (item) => !recentlyRecalledIds.has(item.id),
    );

    // 6.2④: キーワード一致件数（同数ならimportance）でスコアリングし上位を選出する。
    const ranked = [...notRecentlyRecalled].sort((a, b) => {
      const scoreDiff = keywordScore(b, query.topicKeywords) - keywordScore(a, query.topicKeywords);
      if (scoreDiff !== 0) return scoreDiff;
      return b.importance - a.importance;
    });

    const selected = ranked.slice(0, MAX_RESULTS);

    await Promise.all(
      selected.map((item) =>
        this.repo.recordRecall(query.sessionId, query.turnNo, item.id, item.source),
      ),
    );

    return selected;
  }
}
