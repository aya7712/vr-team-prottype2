import type { MemoryItem } from '../types/memory.js';
import type { MemoryRepository } from './MemoryRepository.js';
import type { MemoryQuery } from './types.js';
import type { EmbeddingService } from './EmbeddingService.js';
import { cosineSimilarity } from './cosineSimilarity.js';

const RECALL_DEDUP_WINDOW_TURNS = 5;
const MAX_RESULTS = 3;
const SEMANTIC_SCORE_WEIGHT = 2; // コサイン類似度(0〜1)にかける重み。キーワード一致件数と同程度の影響力にする。

function keywordScore(item: MemoryItem, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const haystack = [item.summary, item.tags.join(' '), item.body ?? ''].join(' ').toLowerCase();
  return keywords.reduce(
    (score, keyword) => (haystack.includes(keyword.toLowerCase()) ? score + 1 : score),
    0,
  );
}

/**
 * F3.4: キーワードマッチ（T07）＋意味検索（T15）のハイブリッド版。
 * data-design.md 6.2の①〜④のうち、①FTS5候補抽出は`repo.getAllCandidates`で
 * 代替し（データ件数が少ないプロトタイプ規模のため全件走査で足りる、6.2の
 * 「実装簡易化の余地」を採用）、③フィルタリング・④上位選出を行う。
 * `embeddingService`が注入されている場合のみ②意味的再ランキング（コサイン類似度）を
 * キーワード一致件数に加算するハイブリッドスコアで行う（未注入時はT07同様キーワードのみ）。
 */
export class MemoryRetriever {
  constructor(
    private readonly repo: MemoryRepository,
    private readonly embeddingService?: EmbeddingService,
  ) {}

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

    const semanticScores = await this.computeSemanticScores(notRecentlyRecalled, query);

    // 6.2④: キーワード一致件数＋意味的類似度（同数ならimportance）でスコアリングし上位を選出する。
    const ranked = [...notRecentlyRecalled].sort((a, b) => {
      const totalA = keywordScore(a, query.topicKeywords) + (semanticScores.get(a.id) ?? 0);
      const totalB = keywordScore(b, query.topicKeywords) + (semanticScores.get(b.id) ?? 0);
      const scoreDiff = totalB - totalA;
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

  // 6.2②: クエリのembeddingと各候補のembedding(memory_embeddings)とのコサイン類似度を
  // 計算する。embeddingServiceが無い、またはクエリキーワードが空の場合はスキップする
  // （T07までの挙動を維持）。
  private async computeSemanticScores(
    candidates: MemoryItem[],
    query: MemoryQuery,
  ): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    if (!this.embeddingService || query.topicKeywords.length === 0) {
      return scores;
    }

    const queryEmbedding = await this.embeddingService.embed(query.topicKeywords.join(' '));

    await Promise.all(
      candidates.map(async (item) => {
        const itemEmbedding = await this.repo.getEmbedding(item.id);
        if (!itemEmbedding) return;
        const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
        scores.set(item.id, similarity * SEMANTIC_SCORE_WEIGHT);
      }),
    );

    return scores;
  }
}
