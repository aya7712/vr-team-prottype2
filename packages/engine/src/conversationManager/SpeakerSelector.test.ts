import { describe, expect, it } from 'vitest';
import { SpeakerSelector, RECENT_WINDOW_SIZE } from './SpeakerSelector.js';
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

  it('名指しされた候補が直近ウィンドウを独占していても、名指し優先は崩れない（T44・Issue #16 plan-a）', () => {
    // 独立レビューで指摘された回帰の再発防止テスト。頻度補正のウィンドウを拡大した際に
    // FREQUENCY_WEIGHTを据え置くと、頻度ペナルティの最大振れ幅がNAMED_BONUSを上回り、
    // 「直近ウィンドウをほぼ独占している名指し候補」が「直近0回発話の名指しされていない
    // 候補」にスコアで逆転されてしまう回帰があった。名指しされた候補（char_d）が
    // 直近ウィンドウのほぼ全てを占めている最悪ケースでも、名指しされていない候補
    // （直近0回発話）より高い頻度で選ばれ続けることを確認する。
    const selector = new SpeakerSelector(undefined, makeDeterministicRoll());
    // char_dが直前の話者(char_a)以外の直近ウィンドウを独占（現実的な最大値: window-1回）。
    const dominatedByNamed = [
      'char_c',
      ...Array.from({ length: RECENT_WINDOW_SIZE - 1 }, () => 'char_d'),
    ];
    const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
    for (let i = 0; i < SWEEP_STEPS; i++) {
      counts[
        selector.selectNext(
          baseContext({ previousTargetIds: ['char_d'], recentSpeakerIds: dominatedByNamed }),
        )
      ] += 1;
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
    // T44 (Issue #16 plan-a): 頻度補正のウィンドウ拡大・非線形化により、300ターン規模
    // では実測（3000試行）でmax-min差が最大31程度に収まる（旧実装の緩い基準120からは
    // 大幅に強化）。統計的なばらつきに対する余裕を持たせつつ、大きな回帰（長時間の独占）
    // を検知できる基準として40を採用する。
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(40);
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

  it('直近ウィンドウの発話頻度が高いほど加点が非線形に急減する（T44・Issue #16 plan-a）', () => {
    // RECENT_WINDOW_SIZEを拡張しただけでなく、線形→二乗の非線形補正になっていることを
    // 確認する。char_cは全シナリオでウィンドウ内の発話回数が常に0（比較の基準点）に
    // なるようにし、char_bの発話回数だけを0→半分→ほぼ全部と変化させる。
    // Softmaxの性質上、log(count_b / count_c)は「score_b - score_c」に正比例する
    // （分母の正規化項は比に取ると消えるため、他候補の発話回数の変化に左右されない）。
    // score_cは常に一定なので、このlog比の変化幅がscore_bの変化幅をそのまま反映する。
    const selector = new SpeakerSelector(undefined, makeDeterministicRoll());
    const zeroWindow = Array.from({ length: RECENT_WINDOW_SIZE }, () => 'char_d'); // char_b, char_cは0回
    const halfWindow = [
      ...Array.from({ length: RECENT_WINDOW_SIZE / 2 }, () => 'char_b'),
      ...Array.from({ length: RECENT_WINDOW_SIZE / 2 }, () => 'char_d'),
    ];
    const mostlyWindow = [
      'char_d',
      ...Array.from({ length: RECENT_WINDOW_SIZE - 1 }, () => 'char_b'),
    ];

    const logRatioBtoC = (recentSpeakerIds: string[]): number => {
      const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
      for (let i = 0; i < SWEEP_STEPS; i++) {
        counts[selector.selectNext(baseContext({ recentSpeakerIds }))] += 1;
      }
      return Math.log(counts.char_b / counts.char_c);
    };

    const zeroLogRatio = logRatioBtoC(zeroWindow); // char_bは直近0回発話
    const halfLogRatio = logRatioBtoC(halfWindow); // char_bは直近半分を占める
    const mostlyLogRatio = logRatioBtoC(mostlyWindow); // char_bは直近ほぼ全てを占める

    // 発話頻度が上がるほどchar_bの相対的な選ばれやすさは単調に減る。
    expect(halfLogRatio).toBeLessThan(zeroLogRatio);
    expect(mostlyLogRatio).toBeLessThan(halfLogRatio);

    // 非線形（二乗）補正により、「0回→半分」でのscore低下幅より
    // 「半分→ほぼ全部」でのscore低下幅の方が大きくなる（旧・線形補正では
    // 発話回数の増分が同じなら低下幅も同じになるはずの箇所で、大きな偏りほど
    // 補正が加速度的に急峻になることを確認する）。
    const dropZeroToHalf = zeroLogRatio - halfLogRatio;
    const dropHalfToMostly = halfLogRatio - mostlyLogRatio;
    expect(dropHalfToMostly).toBeGreaterThan(dropZeroToHalf);
  });

  it('直前の話者との親密なペアが直近ウィンドウを支配しているほど関係性ボーナスが減衰する（T44・Issue #16 plan-a）', () => {
    // RelationshipUpdaterは同じペアが話すたびにintimacyを上げるため、intimacyボーナスを
    // 無条件に加点し続けると「話すほど選ばれ、選ばれるほど話す」正のフィードバックで
    // 発話者が固定化する（Issue #16の症状）。直近ウィンドウをchar_a/char_bのペアが
    // 占有している状況では、char_bの優位性（intimacy由来のボーナス）が、
    // ペアが直近に登場していない場合より縮小することを確認する。
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

    const ratioOf = (recentSpeakerIds: string[]): number => {
      const counts: Record<string, number> = { char_b: 0, char_c: 0, char_d: 0 };
      for (let i = 0; i < SWEEP_STEPS; i++) {
        counts[selector.selectNext(baseContext({ recentSpeakerIds }))] += 1;
      }
      return counts.char_b / (counts.char_b + counts.char_c + counts.char_d);
    };

    const freshRatio = ratioOf([]); // ペアは直近に登場していない
    const dominatedWindow = Array.from({ length: RECENT_WINDOW_SIZE }, (_, i) =>
      i % 2 === 0 ? 'char_a' : 'char_b',
    ); // 直近ウィンドウ全体をchar_a/char_bのペアが占有
    const dominatedRatio = ratioOf(dominatedWindow);

    expect(dominatedRatio).toBeLessThan(freshRatio);
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
});
