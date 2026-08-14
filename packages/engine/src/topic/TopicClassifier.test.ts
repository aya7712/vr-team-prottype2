import { describe, expect, it, vi } from 'vitest';
import { TopicClassifier } from './TopicClassifier.js';
import { TopicTree } from './TopicTree.js';
import type { Topic } from '../types/topic.js';
import type { EmbeddingService } from '../memory/EmbeddingService.js';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic_1',
    label: 'ボルダリングの話',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

describe('TopicClassifier', () => {
  describe('embeddingService未注入時（Jaccard係数フォールバック）', () => {
    const classifier = new TopicClassifier();

    it('Topicツリーが空なら新規Topic判定になる', async () => {
      const tree = new TopicTree();
      const result = await classifier.classify('今日の天気の話', tree, 'char_a', 'char_b');
      expect(result.kind).toBe('new');
    });

    it('既存Topicとほぼ同じ発話は同一Topic判定になる', async () => {
      const tree = new TopicTree();
      tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
      const result = await classifier.classify('ボルダリングに行った話', tree, 'char_a', 'char_b');
      expect(result).toEqual({ kind: 'same', topicId: 'topic_1' });
    });

    it('部分的に関連する発話は子Topic判定になる', async () => {
      const tree = new TopicTree();
      tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
      const result = await classifier.classify('ボルダリングの道具の話', tree, 'char_a', 'char_b');
      expect(result.kind).toBe('child');
      if (result.kind === 'child') {
        expect(result.parentTopicId).toBe('topic_1');
      }
    });

    it('全く無関係な発話は新規Topic判定になる', async () => {
      const tree = new TopicTree();
      tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
      const result = await classifier.classify('宇宙開発について', tree, 'char_a', 'char_b');
      expect(result.kind).toBe('new');
    });

    it('新規/子Topic判定のsuggestedLabelは発話の最初の一文を要約として使う', async () => {
      const tree = new TopicTree();
      const result = await classifier.classify(
        '今日の天気の話なんだけど、実は明日から崩れるらしいよ。念のため傘持っていきな。',
        tree,
        'char_a',
        'char_b',
      );
      expect(result.kind).toBe('new');
      if (result.kind === 'new') {
        expect(result.suggestedLabel).toBe('今日の天気の話なんだけど、実は明日から崩…');
      }
    });
  });

  describe('embeddingService注入時（コサイン類似度）', () => {
    // 単語ベクトル風の簡易な埋め込みモック。テキストが完全一致すれば同一ベクトル、
    // 「ボルダリング」を共有していれば近い角度のベクトルを返し、無関係な語は
    // 直交ベクトルを返すようにして、cosineSimilarityの閾値判定を検証する。
    function makeEmbeddingService() {
      return {
        embed: vi.fn(async (text: string) => {
          if (text.includes('ボルダリング')) {
            return text.includes('道具')
              ? new Float32Array([0.35, 0.9367])
              : new Float32Array([1, 0]);
          }
          return new Float32Array([0, 1]);
        }),
      } as unknown as EmbeddingService;
    }

    it('埋め込みが近い発話は同一/子Topic判定になり、直交する発話は新規判定になる', async () => {
      const classifier = new TopicClassifier(makeEmbeddingService());
      const tree = new TopicTree();
      tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));

      const same = await classifier.classify('ボルダリングに行った話', tree, 'char_a', 'char_b');
      expect(same).toEqual({ kind: 'same', topicId: 'topic_1' });

      const child = await classifier.classify('ボルダリングの道具の話', tree, 'char_a', 'char_b');
      expect(child.kind).toBe('child');

      const unrelated = await classifier.classify('宇宙開発について', tree, 'char_a', 'char_b');
      expect(unrelated.kind).toBe('new');
    });
  });
});
