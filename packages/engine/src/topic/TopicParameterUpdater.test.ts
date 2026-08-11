import { describe, expect, it } from 'vitest';
import { TopicParameterUpdater } from './TopicParameterUpdater.js';
import type { Topic } from '../types/topic.js';

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic_1',
    label: 'ボルダリングの話',
    depth: 0,
    energy: 0.5,
    novelty: 0.5,
    life: 0.5,
    unresolved: false,
    ...overrides,
  };
}

describe('TopicParameterUpdater', () => {
  const updater = new TopicParameterUpdater();

  it('質問された/笑った/新情報/共感でenergyが上がる', () => {
    const topic = makeTopic({ energy: 0.5 });
    expect(updater.applyEvent(topic, { type: 'questioned' }).energy).toBeCloseTo(0.6);
    expect(updater.applyEvent(topic, { type: 'laughed' }).energy).toBeCloseTo(0.65);
    expect(updater.applyEvent(topic, { type: 'newInfo' }).energy).toBeCloseTo(0.6);
    expect(updater.applyEvent(topic, { type: 'empathized' }).energy).toBeCloseTo(0.6);
  });

  it('同じ話の繰り返し/否定された/長く続いたでenergyが下がる', () => {
    const topic = makeTopic({ energy: 0.5 });
    expect(updater.applyEvent(topic, { type: 'repeated' }).energy).toBeCloseTo(0.4);
    expect(updater.applyEvent(topic, { type: 'denied' }).energy).toBeCloseTo(0.35);
    expect(updater.applyEvent(topic, { type: 'prolonged' }).energy).toBeCloseTo(0.45);
  });

  it('noveltyはnewInfoでのみ増加する（同義反復では増加しない）', () => {
    const topic = makeTopic({ novelty: 0.3 });
    expect(updater.applyEvent(topic, { type: 'newInfo' }).novelty).toBeCloseTo(0.5);
    expect(updater.applyEvent(topic, { type: 'repeated' }).novelty).toBeCloseTo(0.3);
    expect(updater.applyEvent(topic, { type: 'questioned' }).novelty).toBeCloseTo(0.3);
  });

  it('lifeは盛り上がるイベントで回復し、盛り上がらないイベントは減衰のみになる', () => {
    const topic = makeTopic({ life: 0.5 });
    expect(updater.applyEvent(topic, { type: 'laughed' }).life).toBeCloseTo(0.65);
    expect(updater.applyEvent(topic, { type: 'repeated' }).life).toBeCloseTo(0.45);
  });

  it('energy/novelty/lifeは0〜1にクランプされる', () => {
    const nearMax = makeTopic({ energy: 0.98, novelty: 0.98, life: 0.98 });
    const result = updater.applyEvent(nearMax, { type: 'laughed' });
    expect(result.energy).toBeLessThanOrEqual(1);
    expect(result.novelty).toBeLessThanOrEqual(1);
    expect(result.life).toBeLessThanOrEqual(1);

    const nearMin = makeTopic({ energy: 0.02, novelty: 0, life: 0.02 });
    const result2 = updater.applyEvent(nearMin, { type: 'denied' });
    expect(result2.energy).toBeGreaterThanOrEqual(0);
    expect(result2.life).toBeGreaterThanOrEqual(0);
  });
});
