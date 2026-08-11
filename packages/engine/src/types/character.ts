export interface CharacterState {
  id: string;
  personality: string;
  emotion: { label: string; intensity: number };
  energy: number;
  curiosity: number;
  currentGoal: string;
  conversationIntent: string;
  speakingStyle: SpeakingStyleModifier;
}

export interface SpeakingStyleModifier {
  honorificLevel: number;
  jokeTolerance: number;
  distance: number;
  addressTerm: string;
}
