import { describe, expect, it, vi } from 'vitest';
import { EngineEventBus } from './EngineEventBus.js';

describe('EngineEventBus', () => {
  it('onで購読したハンドラがemitで呼ばれる', () => {
    const bus = new EngineEventBus();
    const handler = vi.fn();
    bus.on('turn:start', handler);

    const payload = { turnNo: 1, speakerCandidateIds: ['char_a'] };
    bus.emit('turn:start', payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('異なるイベント名のハンドラは呼ばれない', () => {
    const bus = new EngineEventBus();
    const turnStartHandler = vi.fn();
    const turnCompleteHandler = vi.fn();
    bus.on('turn:start', turnStartHandler);
    bus.on('turn:complete', turnCompleteHandler);

    bus.emit('turn:start', { turnNo: 1, speakerCandidateIds: [] });

    expect(turnStartHandler).toHaveBeenCalledTimes(1);
    expect(turnCompleteHandler).not.toHaveBeenCalled();
  });

  it('同一イベントに複数のハンドラを登録できる', () => {
    const bus = new EngineEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('layer:llm', handler1);
    bus.on('layer:llm', handler2);

    bus.emit('layer:llm', { prompt: 'p', rawOutput: 'r' });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('購読者が居ないイベントをemitしても例外を投げない', () => {
    const bus = new EngineEventBus();
    expect(() => bus.emit('turn:complete', {})).not.toThrow();
  });
});
