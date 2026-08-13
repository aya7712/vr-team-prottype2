import { describe, expect, it } from 'vitest';
import { TopicBranchMerger } from './TopicBranchMerger.js';
import type { Topic } from '../types/topic.js';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'parent',
    label: '雑談',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

describe('TopicBranchMerger', () => {
  describe('branch', () => {
    it('親Topicからサブグループにスコープした子Topicを作る', () => {
      const merger = new TopicBranchMerger();
      const parent = makeTopic({ id: 'parent', depth: 0 });

      const branch = merger.branch(parent, ['char_a', 'char_b'], 'ボルダリングの話');

      expect(branch.parentTopicId).toBe('parent');
      expect(branch.depth).toBe(1);
      expect(branch.participantIds).toEqual(['char_a', 'char_b']);
      expect(branch.label).toBe('ボルダリングの話');
    });
  });

  describe('findLowEnergyMergeCandidate', () => {
    it('同じ親を持つ兄弟サブグループでenergyが閾値未満のペアを検出する', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent',
        participantIds: ['char_a', 'char_b'],
        energy: 0.2,
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent',
        participantIds: ['char_c', 'char_d'],
        energy: 0.6,
      });

      const result = merger.findLowEnergyMergeCandidate([branchA, branchB]);
      expect(result).not.toBeNull();
      expect(result?.map((t) => t.id).sort()).toEqual(['a', 'b']);
    });

    it('親が異なるサブグループ同士は合流候補にしない', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent1',
        participantIds: ['char_a', 'char_b'],
        energy: 0.1,
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent2',
        participantIds: ['char_c', 'char_d'],
        energy: 0.1,
      });

      expect(merger.findLowEnergyMergeCandidate([branchA, branchB])).toBeNull();
    });

    it('サブグループでないTopic（participantIds未設定）は候補にしない', () => {
      const merger = new TopicBranchMerger();
      const rootTopic = makeTopic({ id: 'root', energy: 0.1 });

      expect(merger.findLowEnergyMergeCandidate([rootTopic])).toBeNull();
    });

    it('両方のenergyが閾値以上なら合流候補にしない', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent',
        participantIds: ['char_a', 'char_b'],
        energy: 0.6,
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent',
        participantIds: ['char_c', 'char_d'],
        energy: 0.7,
      });

      expect(merger.findLowEnergyMergeCandidate([branchA, branchB])).toBeNull();
    });
  });

  describe('findBridgedTopics', () => {
    it('話者と対象が異なるサブグループに属する場合、両方のTopicを返す', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent',
        participantIds: ['char_a', 'char_b'],
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent',
        participantIds: ['char_c', 'char_d'],
      });

      const result = merger.findBridgedTopics([branchA, branchB], 'char_a', ['char_c']);
      expect(result?.map((t) => t.id).sort()).toEqual(['a', 'b']);
    });

    it('話者と対象が同じサブグループに属する場合はnullを返す', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent',
        participantIds: ['char_a', 'char_b'],
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent',
        participantIds: ['char_c', 'char_d'],
      });

      expect(merger.findBridgedTopics([branchA, branchB], 'char_a', ['char_b'])).toBeNull();
    });
  });

  describe('merge', () => {
    it('2つのサブグループTopicをパラメータ再結合して1つにする', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({
        id: 'a',
        parentTopicId: 'parent',
        label: 'ボルダリングの話',
        participantIds: ['char_a', 'char_b'],
        energy: 0.2,
        novelty: 0.4,
        life: 0.3,
        unresolved: true,
      });
      const branchB = makeTopic({
        id: 'b',
        parentTopicId: 'parent',
        label: '配信企画の話',
        participantIds: ['char_c', 'char_d'],
        energy: 0.6,
        novelty: 0.6,
        life: 0.8,
        unresolved: false,
      });

      const merged = merger.merge(branchA, branchB);

      expect(merged.parentTopicId).toBe('parent');
      expect(merged.participantIds).toEqual(['char_a', 'char_b', 'char_c', 'char_d']);
      expect(merged.energy).toBeCloseTo(0.4);
      expect(merged.novelty).toBeCloseTo(0.5);
      expect(merged.life).toBe(0.8);
      expect(merged.unresolved).toBe(true);
      expect(merged.label).toContain('ボルダリングの話');
      expect(merged.label).toContain('配信企画の話');
    });

    it('参加者の重複を除いて和集合にする', () => {
      const merger = new TopicBranchMerger();
      const branchA = makeTopic({ id: 'a', participantIds: ['char_a', 'char_b'] });
      const branchB = makeTopic({ id: 'b', participantIds: ['char_b', 'char_c'] });

      const merged = merger.merge(branchA, branchB);
      expect(merged.participantIds).toEqual(['char_a', 'char_b', 'char_c']);
    });
  });
});
