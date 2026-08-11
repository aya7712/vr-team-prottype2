import type { TopicTree } from './TopicTree.js';
import type { TopicClassificationResult } from './types.js';

const SAME_TOPIC_THRESHOLD = 0.5;
const CHILD_TOPIC_THRESHOLD = 0.2;

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
// T15で埋め込みベースの意味的類似度に差し替える暫定実装（doc/todo.md T08）。
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

/**
 * 新規発話 → 既存/子/新規Topic判定（F4.2）。
 *
 * class-design.md旧版ではEmbeddingService（F7、T15で実装予定）にも依存する設計
 * だったが、T08時点では意味的類似度を文字bigramのJaccard係数で暫定計算するため
 * 依存から外している（T15で埋め込みベースの計算に差し替える際に依存を追加する）。
 * RelationshipManager（関係性記憶との関連度判定、F4.2）も、実際の関連度判定
 * ロジックが未実装のT08時点では使い道が無いため依存に含めていない。関連度判定を
 * 実装する後続TODOでコンストラクタに追加する。
 */
export class TopicClassifier {
  classify(
    utterance: string,
    tree: TopicTree,
    _speakerId: string,
    _targetId: string,
  ): TopicClassificationResult {
    const topics = tree.getAllTopics();
    if (topics.length === 0) {
      return { kind: 'new', suggestedLabel: utterance };
    }

    let bestTopic = topics[0];
    let bestScore = jaccardSimilarity(utterance, topics[0].label);
    for (const topic of topics.slice(1)) {
      const score = jaccardSimilarity(utterance, topic.label);
      if (score > bestScore) {
        bestScore = score;
        bestTopic = topic;
      }
    }

    if (bestScore >= SAME_TOPIC_THRESHOLD) {
      return { kind: 'same', topicId: bestTopic.id };
    }
    if (bestScore >= CHILD_TOPIC_THRESHOLD) {
      return { kind: 'child', parentTopicId: bestTopic.id, suggestedLabel: utterance };
    }
    return { kind: 'new', suggestedLabel: utterance };
  }
}
