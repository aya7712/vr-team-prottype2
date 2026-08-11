import type { CharacterState } from '../types/character.js';
import type { TurnUpdateContext } from './types.js';

const EMOTION_INTENSITY_THRESHOLD = 0.5;
const DEFAULT_GOAL = '仲良くなる';

/**
 * 更新後のemotionを踏まえてcurrentGoalを更新する（F1.2の2番目のステップ）。
 * `state`は呼び出し時点でemotionが更新済みであることを前提とする。
 */
export class GoalUpdater {
  // 現状は更新後のemotionのみからgoalを決定する。TurnUpdateContext自体は
  // update系クラス間でシグネチャを揃えるために受け取るが、このクラスでは未使用。
  update(state: CharacterState, _context: TurnUpdateContext): string {
    if (!state.currentGoal) {
      return DEFAULT_GOAL;
    }

    if (state.emotion.intensity < EMOTION_INTENSITY_THRESHOLD) {
      return state.currentGoal;
    }

    switch (state.emotion.label) {
      case 'hurt':
        return '仲良くなる';
      case 'amused':
        return '笑わせる';
      default:
        return state.currentGoal;
    }
  }
}
