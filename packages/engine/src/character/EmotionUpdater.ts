import type { CharacterState } from '../types/character.js';
import type { DialogueAct } from '../types/dialogueAct.js';
import type { TurnUpdateContext } from './types.js';

interface EmotionRule {
  label: string;
  delta: number;
}

// 相手から向けられたDialogueActごとの感情反応ルール（features.md F1.2）。
const EMOTION_RULES: Record<DialogueAct, EmotionRule> = {
  empathy: { label: 'happy', delta: 0.2 },
  deny: { label: 'hurt', delta: 0.2 },
  joke: { label: 'amused', delta: 0.15 },
  tsukkomi: { label: 'amused', delta: 0.1 },
  question: { label: 'engaged', delta: 0.05 },
  answer: { label: 'calm', delta: 0.05 },
  story: { label: 'interested', delta: 0.1 },
  deepDive: { label: 'interested', delta: 0.1 },
  topicShift: { label: 'calm', delta: -0.05 },
  fillSilence: { label: 'calm', delta: -0.05 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 会話イベントを受けてemotionを更新する（F1.2の最初のステップ）。 */
export class EmotionUpdater {
  update(
    current: CharacterState['emotion'],
    context: TurnUpdateContext,
  ): CharacterState['emotion'] {
    const rule = EMOTION_RULES[context.receivedAct];
    const baseIntensity = current.label === rule.label ? current.intensity : 0;
    return {
      label: rule.label,
      intensity: clamp(baseIntensity + rule.delta, 0, 1),
    };
  }
}
