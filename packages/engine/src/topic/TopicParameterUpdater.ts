import type { Topic } from '../types/topic.js';
import type { TopicEvent, TopicEventType } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// features.md F4.3: 「質問された/笑った/新情報/共感 等でプラス、同じ話の繰り返し/
// 否定された/長く続いた等でマイナス」。具体的な数値は明記されていないため
// 実装者判断で設定した値。
const ENERGY_DELTA: Record<TopicEventType, number> = {
  questioned: 0.1,
  laughed: 0.15,
  newInfo: 0.1,
  empathized: 0.1,
  repeated: -0.1,
  denied: -0.15,
  prolonged: -0.05,
};

// F4.3: 「novelty: 新しい情報量の指標。同義反復ではdepthが増えても増加しない」。
// newInfoイベントのみが新規情報の発生源であるため、それ以外は変化させない。
const NOVELTY_DELTA: Record<TopicEventType, number> = {
  questioned: 0,
  laughed: 0,
  newInfo: 0.2,
  empathized: 0,
  repeated: 0,
  denied: 0,
  prolonged: 0,
};

// F4.3: 「life: 毎ターン減衰し、盛り上がりで回復」。
const LIFE_DECAY = 0.05;
const LIFE_RECOVERY: Record<TopicEventType, number> = {
  questioned: 0.15,
  laughed: 0.2,
  newInfo: 0.15,
  empathized: 0.15,
  repeated: 0,
  denied: 0,
  prolonged: 0,
};

/** イベントを受けてenergy/novelty/lifeを更新する（F4.3）。 */
export class TopicParameterUpdater {
  applyEvent(topic: Topic, event: TopicEvent): Topic {
    return {
      ...topic,
      energy: clamp(topic.energy + ENERGY_DELTA[event.type], 0, 1),
      novelty: clamp(topic.novelty + NOVELTY_DELTA[event.type], 0, 1),
      life: clamp(topic.life - LIFE_DECAY + LIFE_RECOVERY[event.type], 0, 1),
    };
  }
}
