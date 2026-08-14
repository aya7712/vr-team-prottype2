import type { TopicTree } from './TopicTree.js';
import type { TopicClassificationResult } from './types.js';
import type { EmbeddingService } from '../memory/EmbeddingService.js';
import { cosineSimilarity } from '../memory/cosineSimilarity.js';

const SAME_TOPIC_THRESHOLD = 0.5;
const CHILD_TOPIC_THRESHOLD = 0.2;
// labelとして保持する要約の上限長。文単位の要約（LLM）はT36で見送り、
// 発話の最初の文（句読点まで）を短いlabelとして採用する暫定対応とする
// （doc/todo.md T36の2026-08-14追記）。
const LABEL_MAX_LENGTH = 20;
const SENTENCE_BOUNDARY = /[。！？!?\n]/;

function toCharBigrams(text: string): Set<string> {
  const normalized = text.trim();
  if (normalized.length < 2) return new Set(normalized ? [normalized] : []);

  const bigrams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}

// 文字bigramのJaccard係数による簡易的な類似度（0〜1）。
// embeddingServiceが未注入の場合のフォールバックとして残す（doc/todo.md T36）。
function jaccardSimilarity(a: string, b: string): number {
  const bigramsA = toCharBigrams(a);
  const bigramsB = toCharBigrams(b);
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// 発話の最初の文（句読点まで、無ければ全文）をLABEL_MAX_LENGTHで丸めたものを
// Topicのlabelとして使う。発話全文をlabelにすると（旧実装）、類似度計算の対象が
// 長文同士になり意味的に近い発話でもスコアが薄まってしまう問題があった。
function toShortLabel(utterance: string): string {
  const trimmed = utterance.trim();
  const boundaryIndex = trimmed.search(SENTENCE_BOUNDARY);
  const firstSentence = boundaryIndex === -1 ? trimmed : trimmed.slice(0, boundaryIndex + 1);
  return firstSentence.length > LABEL_MAX_LENGTH
    ? `${firstSentence.slice(0, LABEL_MAX_LENGTH)}…`
    : firstSentence;
}

/**
 * 新規発話 → 既存/子/新規Topic判定（F4.2）。
 *
 * T15で実装済みのEmbeddingService（Together AI Embeddings API、意味検索用）を注入した
 * 場合、utteranceと既存Topic.labelの埋め込みベクトルのコサイン類似度で判定する
 * （doc/todo.md T36の2026-08-14追記）。未注入時（テスト等）は文字bigramのJaccard係数に
 * フォールバックする。
 * RelationshipManager（関係性記憶との関連度判定、F4.2）も、実際の関連度判定
 * ロジックが未実装のT08時点では使い道が無いため依存に含めていない。関連度判定を
 * 実装する後続TODOでコンストラクタに追加する。
 */
export class TopicClassifier {
  constructor(private readonly embeddingService?: EmbeddingService) {}

  async classify(
    utterance: string,
    tree: TopicTree,
    _speakerId: string,
    _targetId: string,
  ): Promise<TopicClassificationResult> {
    const suggestedLabel = toShortLabel(utterance);
    const topics = tree.getAllTopics();
    if (topics.length === 0) {
      return { kind: 'new', suggestedLabel };
    }

    const scores = await this.scoreAgainstTopics(utterance, topics);

    let bestTopic = topics[0];
    let bestScore = scores[0];
    for (let i = 1; i < topics.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestTopic = topics[i];
      }
    }

    if (bestScore >= SAME_TOPIC_THRESHOLD) {
      return { kind: 'same', topicId: bestTopic.id };
    }
    if (bestScore >= CHILD_TOPIC_THRESHOLD) {
      return { kind: 'child', parentTopicId: bestTopic.id, suggestedLabel };
    }
    return { kind: 'new', suggestedLabel };
  }

  // 既存Topic全件についてembeddingを都度計算する（結果をキャッシュしない）。
  // `MemoryRetriever`（F3.4、T15）と同様、プロトタイプ規模のTopic件数では
  // 全件走査で十分と判断した（実装者判断、implementation-rules.md 9章）。
  private async scoreAgainstTopics(
    utterance: string,
    topics: { label: string }[],
  ): Promise<number[]> {
    if (!this.embeddingService) {
      return topics.map((topic) => jaccardSimilarity(utterance, topic.label));
    }

    const utteranceEmbedding = await this.embeddingService.embed(utterance);
    const topicEmbeddings = await Promise.all(
      topics.map((topic) => this.embeddingService!.embed(topic.label)),
    );
    return topicEmbeddings.map((embedding) => cosineSimilarity(utteranceEmbedding, embedding));
  }
}
