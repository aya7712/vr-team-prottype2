export type DialogueAct =
  | 'question'
  | 'answer'
  | 'empathy'
  | 'deny'
  | 'joke'
  | 'tsukkomi'
  | 'story'
  | 'deepDive'
  | 'topicShift'
  | 'fillSilence';

export interface DialogueActScore {
  act: DialogueAct;
  baseWeight: number;
  modifiers: Record<string, number>;
  score: number;
  probability: number;
}

export interface SpeechExpectation {
  expectedActs: { act: DialogueAct; weight: number }[];
  targetCharacterIds?: string[];
}
