import type { DialogueAct } from '../types/dialogueAct.js';
import { loadJsonConfig } from './config/loadConfig.js';

type BaseWeights = Record<DialogueAct, number>;

const ALL_ACTS: DialogueAct[] = [
  'question',
  'answer',
  'empathy',
  'deny',
  'joke',
  'tsukkomi',
  'story',
  'deepDive',
  'topicShift',
  'fillSilence',
];

/** Dialogue Act一覧と基本重み設定の読み込み（F5.1、`dialoguePlanner/config/baseWeights.json`）。 */
export class DialogueActCatalog {
  private readonly baseWeights: BaseWeights;

  constructor(baseWeights?: BaseWeights) {
    this.baseWeights = baseWeights ?? loadJsonConfig<BaseWeights>('baseWeights.json');
  }

  listActs(): DialogueAct[] {
    return [...ALL_ACTS];
  }

  getBaseWeight(act: DialogueAct): number {
    return this.baseWeights[act];
  }
}
