import { describe, expect, it } from 'vitest';
import { AddresseeSelector } from './AddresseeSelector.js';
import type { AddresseeSelectionContext } from './AddresseeSelector.js';
import { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipGraph } from '../relationship/RelationshipGraph.js';

const PARTICIPANTS = ['char_a', 'char_b', 'char_c', 'char_d'];
const SWEEP_STEPS = 1000;

// SpeakerSelector.test.tsと同じ考え方: Math.randomによる統計テストのflakyさを避けるため、
// [0,1)を均等に掃引する決定的なroll生成関数を使う。
function makeDeterministicRoll(): () => number {
  let i = 0;
  return () => {
    const value = i / SWEEP_STEPS;
    i = (i + 1) % SWEEP_STEPS;
    return value;
  };
}

function baseContext(
  overrides: Partial<AddresseeSelectionContext> = {},
): AddresseeSelectionContext {
  return {
    speakerId: 'char_a',
    participantIds: PARTICIPANTS,
    recentTargetIds: [],
    ...overrides,
  };
}

describe('AddresseeSelector', () => {
  it('2人会話では常に唯一の相手を返し、全員向けにはならない', () => {
    const selector = new AddresseeSelector();
    for (let i = 0; i < 20; i++) {
      const result = selector.select(baseContext({ participantIds: ['char_a', 'char_b'] }));
      expect(result).toEqual({ targetId: 'char_b', isEveryone: false });
    }
  });

  it('話者自身は選ばれない', () => {
    const selector = new AddresseeSelector();
    for (let i = 0; i < 50; i++) {
      const result = selector.select(baseContext());
      expect(result.targetId).not.toBe('char_a');
    }
  });

  it('参加者が話者のみの場合は例外を投げる', () => {
    const selector = new AddresseeSelector();
    expect(() => selector.select(baseContext({ participantIds: ['char_a'] }))).toThrow();
  });

  it('関係性（話者との親密度）が高い候補ほど選ばれやすい', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_c',
      type: '親友',
      trust: 0.9,
      intimacy: 0.9,
      respect: 0.9,
      story: [],
    });
    const relationshipManager = new RelationshipManager(graph, []);
    const selector = new AddresseeSelector(relationshipManager, makeDeterministicRoll());

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[selector.select(baseContext()).targetId] += 1;
    }
    expect(counts.char_c).toBeGreaterThan(counts.char_b);
    expect(counts.char_c).toBeGreaterThan(counts.char_d);
  });

  it('直近に呼びかけられた回数が少ない候補ほど選ばれやすい（発話頻度バランス）', () => {
    const selector = new AddresseeSelector(undefined, makeDeterministicRoll());

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[
        selector.select(
          baseContext({ recentTargetIds: ['char_b', 'char_b', 'char_b', 'char_c'] }),
        ).targetId
      ] += 1;
    }
    expect(counts.char_d).toBeGreaterThan(counts.char_b);
    expect(counts.char_c).toBeGreaterThan(counts.char_b);
  });

  it('直前ターンで自分を名指しした相手には返答が返りやすい（自己レビュー対応）', () => {
    const selector = new AddresseeSelector(undefined, makeDeterministicRoll());

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[
        selector.select(
          baseContext({ previousSpeakerId: 'char_c', previousTargetIds: ['char_a'] }),
        ).targetId
      ] += 1;
    }
    expect(counts.char_c).toBeGreaterThan(counts.char_b);
    expect(counts.char_c).toBeGreaterThan(counts.char_d);
  });

  it('直前ターンで自分が名指しされていなければ往復バイアスはかからない', () => {
    const selector = new AddresseeSelector(undefined, makeDeterministicRoll());

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[
        selector.select(
          // previousTargetIdsに話者(char_a)自身が含まれないため、char_cへの補正は入らない。
          baseContext({ previousSpeakerId: 'char_c', previousTargetIds: ['char_b'] }),
        ).targetId
      ] += 1;
    }
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(SWEEP_STEPS * 0.05);
  });

  it('4体構成で複数回試行すると特定の1〜2人だけに呼びかけが偏らない', () => {
    const selector = new AddresseeSelector();
    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    let recentTargetIds: string[] = [];

    for (let i = 0; i < 300; i++) {
      const { targetId } = selector.select(baseContext({ recentTargetIds }));
      counts[targetId] += 1;
      recentTargetIds = [...recentTargetIds, targetId].slice(-4);
    }

    for (const id of ['char_b', 'char_c', 'char_d']) {
      expect(counts[id]).toBeGreaterThan(0);
    }
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(150);
  });

  it('3人以上の会話では一定確率で「全員向け」（isEveryone）になる', () => {
    const selector = new AddresseeSelector();
    let everyoneCount = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      if (selector.select(baseContext()).isEveryone) {
        everyoneCount++;
      }
    }
    const ratio = everyoneCount / trials;
    // EVERYONE_PROBABILITY(0.3)の近辺に収まることを大まかに確認する（統計的検証のため
    // 厳密な一致は求めない、requirements.md 7.2の「偏りが生じない」の精神に合わせる）。
    expect(ratio).toBeGreaterThan(0.15);
    expect(ratio).toBeLessThan(0.45);
  });

  it('isEveryoneがtrueの場合でもtargetIdは話者以外の実在する参加者を返す', () => {
    const selector = new AddresseeSelector();
    for (let i = 0; i < 100; i++) {
      const result = selector.select(baseContext());
      if (result.isEveryone) {
        expect(PARTICIPANTS.filter((id) => id !== 'char_a')).toContain(result.targetId);
      }
    }
  });
});
