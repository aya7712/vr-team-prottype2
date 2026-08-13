import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEngineEvents } from './useEngineEvents';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  listeners = new Map<string, ((event: unknown) => void)[]>();
  readyState = 0;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', {});
  }

  message(data: unknown): void {
    this.dispatch('message', { data: JSON.stringify(data) });
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', {});
  }
}

describe('useEngineEvents', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it('接続後にopen状態になり、受信したイベントを蓄積する', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useEngineEvents('ws://localhost/ws'));
    expect(result.current.status).toBe('connecting');

    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    await waitFor(() => expect(result.current.status).toBe('open'));

    act(() =>
      socket.message({
        event: 'turn:start',
        payload: { turnNo: 1, speakerCandidateIds: ['char_a'] },
      }),
    );

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0]).toEqual({
      name: 'turn:start',
      payload: { turnNo: 1, speakerCandidateIds: ['char_a'] },
    });
    expect(result.current.latestByName['turn:start']).toEqual(result.current.events[0]);
  });

  it('クローズされるとstatusがclosedになる', async () => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);

    const { result } = renderHook(() => useEngineEvents('ws://localhost/ws'));
    const socket = MockWebSocket.instances[0];
    act(() => socket.open());
    act(() => socket.close());

    await waitFor(() => expect(result.current.status).toBe('closed'));
  });
});
