import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { Topic, ConversationState } from '../types/topic.js';
import type { DialogueAct } from '../types/dialogueAct.js';

export interface PlanningContext {
  speaker: CharacterState;
  relationship: RelationshipContext;
  topic: Topic;
  conversationState: ConversationState;
  previousAct?: DialogueAct;
}
