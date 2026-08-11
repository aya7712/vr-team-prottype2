import { describe, expect, it } from 'vitest';
import { TopicClassifier } from './TopicClassifier.js';
import { TopicTree } from './TopicTree.js';
import type { Topic } from '../types/topic.js';

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
  const classifier = new TopicClassifier();

  it('Topicツリーが空なら新規Topic判定になる', () => {
    const tree = new TopicTree();
    const result = classifier.classify('今日の天気の話', tree, 'char_a', 'char_b');
    expect(result.kind).toBe('new');
  });

  it('既存Topicとほぼ同じ発話は同一Topic判定になる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
    const result = classifier.classify('ボルダリングに行った話', tree, 'char_a', 'char_b');
    expect(result).toEqual({ kind: 'same', topicId: 'topic_1' });
  });

  it('部分的に関連する発話は子Topic判定になる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
    const result = classifier.classify('ボルダリングの道具の話', tree, 'char_a', 'char_b');
    expect(result.kind).toBe('child');
    if (result.kind === 'child') {
      expect(result.parentTopicId).toBe('topic_1');
    }
  });

  it('全く無関係な発話は新規Topic判定になる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'topic_1', label: 'ボルダリングに行った話' }));
    const result = classifier.classify('宇宙開発について', tree, 'char_a', 'char_b');
    expect(result.kind).toBe('new');
  });
});
