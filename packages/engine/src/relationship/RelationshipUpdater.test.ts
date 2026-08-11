import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from './RelationshipGraph.js';
import { RelationshipUpdater } from './RelationshipUpdater.js';
import type { TurnResult } from '../types/turn.js';

function makeTurnResult(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    sessionId: 'session_1',
    turnNo: 1,
    speakerId: 'char_a',
    targetIds: ['char_b'],
    topicId: 'topic_1',
    dialogueAct: 'empathy',
    utterance: 'それは大変だったね',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RelationshipUpdater', () => {
  const updater = new RelationshipUpdater();

  it('empathyでtrust/intimacyが上昇する', () => {
    const graph = new RelationshipGraph();
    updater.applyTurnResult(graph, makeTurnResult({ dialogueAct: 'empathy' }));

    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.trust).toBeCloseTo(0.52);
    expect(edge.intimacy).toBeCloseTo(0.55);
  });

  it('denyでtrust/intimacyが下降する', () => {
    const graph = new RelationshipGraph();
    updater.applyTurnResult(graph, makeTurnResult({ dialogueAct: 'deny' }));

    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.trust).toBeCloseTo(0.47);
    expect(edge.intimacy).toBeCloseTo(0.48);
  });

  it('empathy/denyはRelationship Storyに追記される', () => {
    const graph = new RelationshipGraph();
    updater.applyTurnResult(
      graph,
      makeTurnResult({ dialogueAct: 'empathy', turnNo: 3, utterance: '分かるよそれ' }),
    );

    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.story).toHaveLength(1);
    expect(edge.story[0]).toMatchObject({
      turnNo: 3,
      summary: '分かるよそれ',
      source: 'session',
    });
  });

  it('jokeのようにStory対象外のActはStoryに追記されない', () => {
    const graph = new RelationshipGraph();
    updater.applyTurnResult(graph, makeTurnResult({ dialogueAct: 'joke' }));

    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.story).toHaveLength(0);
  });

  it('数値は0〜1にクランプされる', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: 'テスト',
      trust: 0.99,
      intimacy: 0.99,
      respect: 0.5,
      story: [],
    });

    updater.applyTurnResult(graph, makeTurnResult({ dialogueAct: 'empathy' }));
    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.trust).toBeLessThanOrEqual(1);
    expect(edge.intimacy).toBeLessThanOrEqual(1);
  });

  it('targetIdsが未指定の場合は何も更新しない', () => {
    const graph = new RelationshipGraph();
    updater.applyTurnResult(graph, makeTurnResult({ targetIds: undefined }));
    expect(graph.hasEdge('char_a', 'char_b')).toBe(false);
  });
});
