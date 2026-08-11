import { describe, expect, it } from 'vitest';
import { TopicTree } from './TopicTree.js';
import type { Topic } from '../types/topic.js';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic_1',
    label: 'テスト',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

describe('TopicTree', () => {
  it('addTopic/getTopicで登録・取得できる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'topic_1' }));
    expect(tree.getTopic('topic_1')?.id).toBe('topic_1');
    expect(tree.getTopic('missing')).toBeUndefined();
  });

  it('updateTopicで部分更新できる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'topic_1', energy: 0.5 }));
    const updated = tree.updateTopic('topic_1', { energy: 0.9 });
    expect(updated.energy).toBe(0.9);
    expect(tree.getTopic('topic_1')?.energy).toBe(0.9);
  });

  it('updateTopicは存在しないIDで例外を投げる', () => {
    const tree = new TopicTree();
    expect(() => tree.updateTopic('missing', { energy: 0.9 })).toThrow();
  });

  it('getChildren/getRootTopicsで親子関係を取得できる', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'root', parentTopicId: undefined }));
    tree.addTopic(makeTopic({ id: 'child_1', parentTopicId: 'root' }));
    tree.addTopic(makeTopic({ id: 'child_2', parentTopicId: 'root' }));

    expect(tree.getRootTopics().map((t) => t.id)).toEqual(['root']);
    expect(
      tree
        .getChildren('root')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['child_1', 'child_2']);
  });

  it('computeDepthは親のdepth+1を返す', () => {
    const tree = new TopicTree();
    tree.addTopic(makeTopic({ id: 'root', depth: 0 }));
    expect(tree.computeDepth(undefined)).toBe(0);
    expect(tree.computeDepth('root')).toBe(1);
  });

  it('computeDepthは存在しない親IDで例外を投げる', () => {
    const tree = new TopicTree();
    expect(() => tree.computeDepth('missing')).toThrow();
  });
});
