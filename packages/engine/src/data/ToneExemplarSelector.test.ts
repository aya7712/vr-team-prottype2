import { describe, expect, it } from 'vitest';
import { ToneExemplarSelector } from './ToneExemplarSelector.js';
import type { MemoryItem } from '../types/memory.js';

function makeMemory(overrides: Partial<MemoryItem> & Pick<MemoryItem, 'id' | 'owner'>): MemoryItem {
  return {
    source: 'preset',
    participants: [overrides.owner],
    summary: 'テストの記憶',
    tags: [],
    importance: 1,
    shareable: true,
    body: 'それはある日のことだった。すっげー楽しかったんだよなー、あのときは。今でも時々思い出す。',
    ...overrides,
  };
}

describe('ToneExemplarSelector', () => {
  const selector = new ToneExemplarSelector();

  it('owner一致・本文ありの記憶からのみ実例を抽出する', () => {
    const memories = [
      makeMemory({ id: 'mem_a_1', owner: 'char_a' }),
      makeMemory({ id: 'mem_b_1', owner: 'char_b' }),
    ];

    const result = selector.select(memories, 'char_a');

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('すっげー楽しかったんだよなー');
  });

  it('bodyが空の記憶は除外する', () => {
    const memories = [makeMemory({ id: 'mem_a_1', owner: 'char_a', body: '' })];
    expect(selector.select(memories, 'char_a')).toEqual([]);
  });

  it('importanceが高い記憶を優先し、件数はmaxExemplarsで打ち切る', () => {
    const memories = [
      makeMemory({ id: 'mem_a_1', owner: 'char_a', importance: 1, body: '一番目の記憶だよ。まあまあ普通の一日だったなー。特に何も無かった。' }),
      makeMemory({ id: 'mem_a_2', owner: 'char_a', importance: 5, body: '二番目の記憶だよ。すごく印象的な出来事があったんだ。今でも覚えてる。' }),
      makeMemory({ id: 'mem_a_3', owner: 'char_a', importance: 3, body: '三番目の記憶だよ。それなりに楽しい一日だった。悪くはなかった。' }),
    ];

    const result = selector.select(memories, 'char_a', 2);

    expect(result).toHaveLength(2);
    // importance最大の記憶（mem_a_2）の抜粋が先頭に来る
    expect(result[0]).toContain('すごく印象的な出来事があったんだ');
  });

  it('一文が長すぎる場合は末尾を省略記号で切り詰める', () => {
    const longSentence = 'あ'.repeat(120) + '。';
    const memories = [
      makeMemory({ id: 'mem_a_1', owner: 'char_a', body: `導入。${longSentence}まとめ。` }),
    ];

    const result = selector.select(memories, 'char_a');

    expect(result).toHaveLength(1);
    expect(result[0].length).toBeLessThanOrEqual(91);
    expect(result[0].endsWith('…')).toBe(true);
  });

  it('該当する記憶が無い場合は空配列を返す', () => {
    expect(selector.select([], 'char_a')).toEqual([]);
  });
});
