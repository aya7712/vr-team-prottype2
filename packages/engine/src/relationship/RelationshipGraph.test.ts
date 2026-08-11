import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from './RelationshipGraph.js';

describe('RelationshipGraph', () => {
  it('addEdgeしたエッジをgetEdgeで呼び出し順によらず取得できる', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: '幼馴染',
      trust: 0.7,
      intimacy: 0.8,
      respect: 0.5,
      story: [],
    });

    expect(graph.getEdge('char_a', 'char_b').type).toBe('幼馴染');
    expect(graph.getEdge('char_b', 'char_a').type).toBe('幼馴染');
    expect(graph.getEdge('char_a', 'char_b')).toBe(graph.getEdge('char_b', 'char_a'));
  });

  it('未登録ペアはgetEdgeでデフォルト値が遅延生成される', () => {
    const graph = new RelationshipGraph();
    const edge = graph.getEdge('char_a', 'char_c');
    expect(edge.type).toBe('初対面');
    expect(edge.trust).toBe(0.5);
    expect(edge.intimacy).toBe(0.5);
    expect(edge.respect).toBe(0.5);
  });

  it('updateEdgeで既存エッジを部分更新できる', () => {
    const graph = new RelationshipGraph();
    graph.getEdge('char_a', 'char_b');
    graph.updateEdge('char_a', 'char_b', { trust: 0.9 });
    expect(graph.getEdge('char_a', 'char_b').trust).toBe(0.9);
  });

  it('4体構成で最大6エッジを保持できる', () => {
    const graph = new RelationshipGraph();
    const ids = ['char_a', 'char_b', 'char_c', 'char_d'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        graph.addEdge({
          characterId: ids[i],
          targetCharacterId: ids[j],
          type: 'テスト',
          trust: 0.5,
          intimacy: 0.5,
          respect: 0.5,
          story: [],
        });
      }
    }

    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (graph.hasEdge(ids[i], ids[j])) count++;
      }
    }
    expect(count).toBe(6);
  });

  it('getSubgroupCohesionはペア単位のintimacy平均を返す', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: 'テスト',
      trust: 0.5,
      intimacy: 0.8,
      respect: 0.5,
      story: [],
    });
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_c',
      type: 'テスト',
      trust: 0.5,
      intimacy: 0.4,
      respect: 0.5,
      story: [],
    });
    graph.addEdge({
      characterId: 'char_b',
      targetCharacterId: 'char_c',
      type: 'テスト',
      trust: 0.5,
      intimacy: 0.6,
      respect: 0.5,
      story: [],
    });

    expect(graph.getSubgroupCohesion(['char_a', 'char_b', 'char_c'])).toBeCloseTo(0.6);
  });

  it('要素数0または1のgetSubgroupCohesionは0を返す', () => {
    const graph = new RelationshipGraph();
    expect(graph.getSubgroupCohesion([])).toBe(0);
    expect(graph.getSubgroupCohesion(['char_a'])).toBe(0);
  });
});
