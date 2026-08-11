import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { TurnUpdateContext } from './types.js';
import type { EmotionUpdater } from './EmotionUpdater.js';
import type { GoalUpdater } from './GoalUpdater.js';
import type { IntentUpdater } from './IntentUpdater.js';
import type { SpeakingStyleResolver } from './SpeakingStyleResolver.js';

/** キャラクターの内部状態を保持・更新する（F1）。 */
export class CharacterBrain {
  constructor(
    private state: CharacterState,
    private readonly emotionUpdater: EmotionUpdater,
    private readonly goalUpdater: GoalUpdater,
    private readonly intentUpdater: IntentUpdater,
    private readonly speakingStyleResolver: SpeakingStyleResolver,
  ) {}

  // 会話 → 感情更新 → Goal更新 → Intent更新 の順で状態を進める（features.md F1.2）
  updateAfterTurn(context: TurnUpdateContext): CharacterState {
    const emotion = this.emotionUpdater.update(this.state.emotion, context);
    this.state = { ...this.state, emotion };

    const currentGoal = this.goalUpdater.update(this.state, context);
    this.state = { ...this.state, currentGoal };

    const conversationIntent = this.intentUpdater.update(this.state, context);
    this.state = { ...this.state, conversationIntent };

    return this.state;
  }

  // Relationship Engineの結果を受けてSpeaking Style Modifierを反映（F1.3）
  applyRelationshipContext(relCtx: RelationshipContext): void {
    this.state = { ...this.state, speakingStyle: this.speakingStyleResolver.resolve(relCtx) };
  }

  getState(): CharacterState {
    return this.state;
  }
}
