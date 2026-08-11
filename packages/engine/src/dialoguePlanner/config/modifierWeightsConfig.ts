import type { DialogueAct } from '../../types/dialogueAct.js';
import { loadJsonConfig } from './loadConfig.js';

export interface ModifierWeightsConfig {
  personality: {
    ampFactor: number;
    actTrait: Partial<Record<DialogueAct, 'curiosity' | 'energy'>>;
  };
  relationship: {
    ampFactor: number;
    jokeToleranceActs: DialogueAct[];
    intimacyActs: DialogueAct[];
    honorificPenaltyActs: DialogueAct[];
  };
  topic: {
    ampFactor: number;
    energyNoveltyActs: DialogueAct[];
    lowLifeBoostActs: DialogueAct[];
    unresolvedBoostActs: DialogueAct[];
  };
  emotion: {
    ampFactor: number;
    actBoostByEmotion: Record<string, DialogueAct[]>;
  };
  context: {
    expectationTable: Partial<Record<DialogueAct, Partial<Record<DialogueAct, number>>>>;
  };
}

// 各ModifierResolver・SpeechExpectationCalculatorで共有する設定を一度だけ読み込む。
export const modifierWeightsConfig = loadJsonConfig<ModifierWeightsConfig>('modifierWeights.json');
