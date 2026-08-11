import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from './RelationshipGraph.js';
import { RelationshipManager } from './RelationshipManager.js';

describe('RelationshipManager', () => {
  it('resolveは呼び方・敬語レベル・冗談許容度・距離感を返す', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: '幼馴染',
      trust: 0.8,
      intimacy: 0.9,
      respect: 0.5,
      story: [],
    });

    const manager = new RelationshipManager(graph, [
      { characterId: 'char_a', targetCharacterId: 'char_b', addressTerm: '楽' },
      { characterId: 'char_b', targetCharacterId: 'char_a', addressTerm: '宇良' },
    ]);

    const result = manager.resolve('char_a', 'char_b');
    expect(result.addressTerm).toBe('楽');
    expect(result.edge.type).toBe('幼馴染');
    expect(result.honorificLevel).toBeCloseTo(0.1); // 1 - intimacy(0.9)
    expect(result.jokeTolerance).toBeCloseTo(0.9); // intimacy
    expect(result.distance).toBeCloseTo(0.15); // 1 - (trust+intimacy)/2
  });

  it('AddressBookに無い方向のresolveはaddressTermが空文字になる', () => {
    const graph = new RelationshipGraph();
    const manager = new RelationshipManager(graph, []);
    const result = manager.resolve('char_a', 'char_c');
    expect(result.addressTerm).toBe('');
  });

  it('未登録ペアはデフォルトのRelationshipContextを返す', () => {
    const graph = new RelationshipGraph();
    const manager = new RelationshipManager(graph, []);
    const result = manager.resolve('char_a', 'char_d');
    expect(result.edge.type).toBe('初対面');
    expect(result.honorificLevel).toBeCloseTo(0.5);
  });
});
