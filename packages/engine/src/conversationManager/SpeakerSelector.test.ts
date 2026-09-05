import { describe, expect, it } from 'vitest';
import { SpeakerSelector } from './SpeakerSelector.js';
import type { SpeakerSelectionContext } from './SpeakerSelector.js';
import { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipGraph } from '../relationship/RelationshipGraph.js';
import type { CharacterState } from '../types/character.js';

const PARTICIPANTS = ['char_a', 'char_b', 'char_c', 'char_d'];
const SWEEP_STEPS = 1000;

// Math.randomによる統計的テストはflakyになりうるため、[0,1)を均等に掃引する
// 決定的なroll生成関数を使う。スコア（＝各候補の確率区間の幅）が試行間で
// 変わらない限り、この掃引は真の確率比率を毎回同じ結果で再現する。
function makeDeterministicRoll(): () => number {
  let i = 0;
  return () => {
    const value = i / SWEEP_STEPS;
    i = (i + 1) % SWEEP_STEPS;
    return value;
  };
}

function makeCharacterState(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: 'x',
    personality: 'テスト',
    emotion: { label: 'calm', intensity: 0 },
    energy: 0.5,
    curiosity: 0.5,
    currentGoal: '',
    conversationIntent: '',
    speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: '' },
    ...overrides,
  };
}

function baseContext(overrides: Partial<SpeakerSelectionContext> = {}): SpeakerSelectionContext {
  return {
    participantIds: PARTICIPANTS,
    previousSpeakerId: 'char_a',
    previousTargetIds: undefined,
    recentSpeakerIds: [],
    characterStates: new Map(PARTICIPANTS.map((id) => [id, makeCharacterState({ id })])),
    ...overrides,
  };
}

describe('SpeakerSelector', () => {
  it('previousSpeakerIdが無い場合は先頭の参加者を返す（会話開始時）', () => {
    const selector = new SpeakerSelector();
    const result = selector.selectNext(baseContext({ previousSpeakerId: undefined }));
    expect(result).toBe('char_a');
  });

  it('直前の話者自身は選ばれない', () => {
    const selector = new SpeakerSelector(undefined, () => 0.99);
    for (let i = 0; i < 20; i++) {
      const result = selector.selectNext(baseContext());
      expect(result).not.toBe('char_a');
    }
  });

  it('2体構成では常に交互発話になる（T12までの挙動を維持）', () => {
    const selector = new SpeakerSelector(undefined, () => 0.5);
    const result = selector.selectNext(
      baseContext({ participantIds: ['char_a', 'char_b'], previousSpeakerId: 'char_a' }),
    );
    expect(result).toBe('char_b');
  });

  it('名指しされたキャラクターが最も高い頻度で選ばれる', () => {
    const selector = new SpeakerSelector(undefined, makeDeterministicRoll());
    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[selector.selectNext(baseContext({ previousTargetIds: ['char_d'] }))] += 1;
    }
    expect(counts.char_d).toBeGreaterThan(counts.char_b);
    expect(counts.char_d).toBeGreaterThan(counts.char_c);
  });

  it('4体・複数回試行で特定のキャラだけが発話し続けない（requirements.md 7.2）', () => {
    // ターンを重ねるごとにスコア（発話頻度バランス等）が変化していく実運用に近い
    // シナリオのため、決定的な掃引ではなく実際の乱数で統計的に検証する。
    const selector = new SpeakerSelector();
    const counts: Record<string, number> = { char_a: 0, char_b: 0, char_c: 0, char_d: 0 };
    let previousSpeakerId = 'char_a';
    const recentSpeakerIds: string[] = [previousSpeakerId];

    for (let i = 0; i < 300; i++) {
      const next = selector.selectNext(
        baseContext({ previousSpeakerId, recentSpeakerIds: [...recentSpeakerIds] }),
      );
      counts[next] += 1;
      previousSpeakerId = next;
      recentSpeakerIds.push(next);
    }

    // 全員が最低1回は発話機会を得ている（特定の1〜2人だけに偏らない）。
    for (const id of PARTICIPANTS) {
      expect(counts[id]).toBeGreaterThan(0);
    }
    // 発話頻度バランス補正により、最多と最少の差が極端に開きすぎないことを確認する
    // （均等である必要はないが、要件7.2の「偏りが生じない」を大まかに確認する）。
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(120);
  });

  it('関係性（直前の話者との親密度）が高い候補ほど選ばれやすくなる', () => {
    const graph = new RelationshipGraph();
    graph.addEdge({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      type: '親友',
      trust: 0.9,
      intimacy: 0.9,
      respect: 0.9,
      story: [],
    });
    const relationshipManager = new RelationshipManager(graph, []);
    const selector = new SpeakerSelector(relationshipManager, makeDeterministicRoll());

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[selector.selectNext(baseContext())] += 1;
    }
    expect(counts.char_b).toBeGreaterThan(counts.char_c);
    expect(counts.char_b).toBeGreaterThan(counts.char_d);
  });

  it('積極性（energy）が高い候補ほど選ばれやすくなる', () => {
    const selector = new SpeakerSelector(undefined, makeDeterministicRoll());
    const characterStates = new Map(PARTICIPANTS.map((id) => [id, makeCharacterState({ id })]));
    characterStates.set('char_c', makeCharacterState({ id: 'char_c', energy: 1.0 }));

    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[selector.selectNext(baseContext({ characterStates }))] += 1;
    }
    expect(counts.char_c).toBeGreaterThan(counts.char_b);
    expect(counts.char_c).toBeGreaterThan(counts.char_d);
  });

  // Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorが提案したrecommendedSpeakerIdが
  // SpeakerSelectorのスコアリングに反映されることを確認する。SpeakerBalanceAdvisor自体の
  // 判定ロジックはSpeakerBalanceAdvisor.test.tsで個別に検証済みのため、ここでは
  // SpeakerSelectionContext.speakerBalanceAdviceの配線のみを確認する。
  describe('speakerBalanceAdvice（SpeakerBalanceAdvisorによる発話バランス判定）', () => {
    it('recommendedSpeakerIdに指定されたキャラクターが最も高い頻度で選ばれる', () => {
      const selector = new SpeakerSelector(undefined, makeDeterministicRoll());
      const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
      for (let i = 0; i < SWEEP_STEPS; i++) {
        counts[
          selector.selectNext(
            baseContext({
              speakerBalanceAdvice: { justified: false, recommendedSpeakerId: 'char_d' },
            }),
          )
        ] += 1;
      }
      expect(counts.char_d).toBeGreaterThan(counts.char_b);
      expect(counts.char_d).toBeGreaterThan(counts.char_c);
    });

    it('justified:trueの場合、頻度バランス補正が弱まり直近よく話した候補も選ばれやすくなる', () => {
      // char_bだけが直近ずっと話し続けている状況（頻度バランス補正が強く働けば
      // char_bは選ばれにくいはずの状況）を作り、justified:falseとtrueで
      // char_bの選ばれやすさが変化する（trueの方が選ばれやすくなる）ことを確認する。
      const recentSpeakerIds = ['char_b', 'char_b', 'char_b', 'char_b'];

      const selectorNotJustified = new SpeakerSelector(undefined, makeDeterministicRoll());
      const countsNotJustified: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
      for (let i = 0; i < SWEEP_STEPS; i++) {
        countsNotJustified[
          selectorNotJustified.selectNext(
            baseContext({
              recentSpeakerIds,
              speakerBalanceAdvice: { justified: false, recommendedSpeakerId: null },
            }),
          )
        ] += 1;
      }

      const selectorJustified = new SpeakerSelector(undefined, makeDeterministicRoll());
      const countsJustified: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
      for (let i = 0; i < SWEEP_STEPS; i++) {
        countsJustified[
          selectorJustified.selectNext(
            baseContext({
              recentSpeakerIds,
              speakerBalanceAdvice: { justified: true, recommendedSpeakerId: null },
            }),
          )
        ] += 1;
      }

      expect(countsJustified.char_b).toBeGreaterThan(countsNotJustified.char_b);
    });

    it('speakerBalanceAdvice省略時も既存挙動のまま動作する（後方互換）', () => {
      const selector = new SpeakerSelector(undefined, () => 0.5);
      const result = selector.selectNext(baseContext({ speakerBalanceAdvice: undefined }));
      expect(PARTICIPANTS).toContain(result);
    });
  });
});
