import type { MemoryItem } from '../types/memory.js';
import type { MemoryRepository } from './MemoryRepository.js';
import type { MemoryQuery } from './types.js';
import type { EmbeddingService } from './EmbeddingService.js';
import { cosineSimilarity } from './cosineSimilarity.js';

const RECALL_DEDUP_WINDOW_TURNS = 5;
const MAX_RESULTS = 3;
const SEMANTIC_SCORE_WEIGHT = 2; // コサイン類似度(0〜1)にかける重み。キーワード一致件数と同程度の影響力にする。

// Issue #5（口調の一貫性）plan-f, T43: 自分の過去発話（voice exemplar）の採用件数。
// 「自己発話由来の記憶と既存の記憶で採用件数の配分を分ける」という提案時点のリスク対応として、
// 既存のMAX_RESULTS（プリセット記憶等）とは別枠のプール・上限を持たせる。
const MAX_SELF_VOICE_RESULTS = 2;
// 会話中に生成される自己発話記憶は、character_defのプリセット記憶（importance 1-5、
// キャラクター定義者が選定）と異なり毎ターン自動的に増え続けるため、意図的に最低値の
// importanceにしておく（同じ話者・同じ話題で複数該当した場合の同点タイブレークにのみ影響する。
// 6.2④の並び順自体はキーワード一致件数＋意味的類似度が主要な決定要因）。
const SELF_UTTERANCE_IMPORTANCE = 1;

export interface SelfVoiceQuery {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  topicKeywords: string[];
}

export interface RecordSelfUtteranceParams {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  utterance: string;
  topicLabel: string;
  emotion?: string | null;
}

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
 *
 * T43（Issue #5「口調が前の話者に引っ張られる」対応, plan-f）: `retrieve()`とは別に
 * `recordSelfUtterance`/`retrieveSelfVoiceExemplars`を追加した。ConversationManagerが
 * 発話生成のたびに話者自身の発話をD8 session_memories（data-design.md 5.2、`shareable: false`
 * の自己記憶）として永続化し、次回そのキャラクターが話す際に意味検索で近い過去発話を
 * 実例（voice exemplar）としてpromptへ渡す。`retrieve()`の候補プール（MAX_RESULTS=3）に
 * 混ぜてしまうと自己発話（毎ターン増え続ける）がプリセット記憶を埋没させかねないため、
 * 採用件数の配分を分けた別枠の検索として実装している（提案時点のリスク対応）。
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
  // （T07までの挙動を維持）。引数はMemoryQueryそのものではなくtopicKeywordsのみに
  // 絞ったオブジェクト型にし（T43）、retrieveSelfVoiceExemplars（MemoryQueryを持たない）とも
  // 共有できるようにしている。
  private async computeSemanticScores(
    candidates: MemoryItem[],
    query: { topicKeywords: string[] },
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

  /**
   * T43（Issue #5 plan-f）: 話者自身の過去発話（`source: 'session'`かつ`participants`が
   * 話者本人のみの自己記憶）の中から、現在の話題に意味的に近いものを`MAX_SELF_VOICE_RESULTS`件
   * まで返す。`retrieve()`と異なり`shareable`によるフィルタは行わない。`shareable: false`は
   * 「他キャラクターとの会話中の“発話材料”として使わない」ための制約（data-design.md 4.3）だが、
   * ここで取得した実例は他キャラへ開示される会話内容にはならず、話者自身のプロンプトへ
   * 「口調の参考」として渡すだけのため、この制約の対象外と判断した。
   * 自己レビューで発見: `getAllCandidates`はsession_memories全体（他セッション分も含む）を
   * 返すため、話者自身の過去発話が別セッションのものまで混入してしまう不具合があった。
   * `repo.getSelfVoiceCandidates(sessionId, speakerId)`（このセッション・この話者に限定した
   * 専用メソッド）に差し替えて修正した。
   */
  async retrieveSelfVoiceExemplars(query: SelfVoiceQuery): Promise<MemoryItem[]> {
    const candidates = await this.repo.getSelfVoiceCandidates(query.sessionId, query.speakerId);

    const recentlyRecalledIds = new Set(
      await this.repo.getRecentRecalls(query.sessionId, RECALL_DEDUP_WINDOW_TURNS),
    );
    const notRecentlyRecalled = candidates.filter((item) => !recentlyRecalledIds.has(item.id));

    const semanticScores = await this.computeSemanticScores(notRecentlyRecalled, query);

    const ranked = [...notRecentlyRecalled].sort((a, b) => {
      const totalA = keywordScore(a, query.topicKeywords) + (semanticScores.get(a.id) ?? 0);
      const totalB = keywordScore(b, query.topicKeywords) + (semanticScores.get(b.id) ?? 0);
      const scoreDiff = totalB - totalA;
      if (scoreDiff !== 0) return scoreDiff;
      return b.importance - a.importance;
    });

    const selected = ranked.slice(0, MAX_SELF_VOICE_RESULTS);

    // 一般記憶の想起と同じmemory_recall_logを共有し、直近数ターンは同じ発言例を
    // 繰り返し提示しないようにする（7.1「記憶・話題の重複回避」）。
    await Promise.all(
      selected.map((item) =>
        this.repo.recordRecall(query.sessionId, query.turnNo, item.id, 'session'),
      ),
    );

    return selected;
  }

  /**
   * T43（Issue #5 plan-f）: 発話生成後に呼び出し、話者自身の発話をD8 session_memories
   * （data-design.md 5.2）として永続化する。embeddingServiceが注入されている場合は
   * 発話文のembeddingも計算しmemory_embeddingsへ保存する（次ターン以降の
   * retrieveSelfVoiceExemplarsでの意味検索に使う）。
   */
  async recordSelfUtterance(params: RecordSelfUtteranceParams): Promise<void> {
    const item: MemoryItem = {
      id: `mem_session_${params.sessionId}_${params.turnNo}`,
      source: 'session',
      owner: params.speakerId,
      participants: [params.speakerId],
      summary: params.utterance,
      tags: params.topicLabel ? [params.topicLabel] : [],
      importance: SELF_UTTERANCE_IMPORTANCE,
      emotion: params.emotion ?? null,
      shareable: false,
    };
    await this.repo.saveSessionMemory(params.sessionId, params.turnNo, item);

    if (!this.embeddingService) return;
    const vector = await this.embeddingService.embed(params.utterance);
    await this.repo.saveEmbedding(item.id, 'session', this.embeddingService.getModel(), vector);
  }
}
