import type { DialogueAct } from '../types/dialogueAct.js';
import type { TargetCharacterIds, TurnResult } from '../types/turn.js';
import type { RelationshipGraph } from './RelationshipGraph.js';

interface RelationshipDelta {
  trust: number;
  intimacy: number;
}

// DialogueActごとのtrust/intimacy変化量（features.md F2.4）。
// 具体的な数値はfeatures.mdに明記されていないため実装者判断で設定した小さな値。
const RELATIONSHIP_DELTA_RULES: Record<DialogueAct, RelationshipDelta> = {
  empathy: { trust: 0.02, intimacy: 0.05 },
  deny: { trust: -0.03, intimacy: -0.02 },
  joke: { trust: 0, intimacy: 0.03 },
  tsukkomi: { trust: 0, intimacy: 0.02 },
  question: { trust: 0.01, intimacy: 0.01 },
  answer: { trust: 0.01, intimacy: 0 },
  story: { trust: 0.01, intimacy: 0.02 },
  deepDive: { trust: 0.02, intimacy: 0.02 },
  topicShift: { trust: 0, intimacy: 0 },
  fillSilence: { trust: 0, intimacy: 0 },
};

// Relationship Storyに残すべきACT（F2.3: 「あの時もそうだったじゃん」等で
// 参照できる、印象に残る出来事のみ記録する）。
const STORY_WORTHY_ACTS = new Set<DialogueAct>(['empathy', 'deny']);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveTargetIds(result: TurnResult): TargetCharacterIds {
  return result.targetIds ?? [];
}

/** 会話結果を受けてtrust/intimacyを更新し、該当すればRelationship Storyを追記する（F2.4）。 */
export class RelationshipUpdater {
  applyTurnResult(graph: RelationshipGraph, result: TurnResult): void {
    const delta = RELATIONSHIP_DELTA_RULES[result.dialogueAct];
    const targetIds = resolveTargetIds(result);

    for (const targetId of targetIds) {
      const edge = graph.getEdge(result.speakerId, targetId);
      const trust = clamp(edge.trust + delta.trust, 0, 1);
      const intimacy = clamp(edge.intimacy + delta.intimacy, 0, 1);

      const story = STORY_WORTHY_ACTS.has(result.dialogueAct)
        ? [
            ...edge.story,
            {
              turnNo: result.turnNo,
              summary: result.utterance,
              source: 'session' as const,
            },
          ]
        : edge.story;

      graph.updateEdge(result.speakerId, targetId, { trust, intimacy, story });
    }
  }
}
