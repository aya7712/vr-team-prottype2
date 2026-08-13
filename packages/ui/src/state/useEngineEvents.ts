import { useEffect, useRef, useState } from 'react';
import type { LayerEvent } from '@prottype2/engine';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

// イベント名ごとに対応するペイロード型へ絞り込めるよう、`Record`ではなくマップ型で定義する。
export type LatestLayerEventByName = {
  [Name in LayerEvent['name']]?: Extract<LayerEvent, { name: Name }>;
};

export interface UseEngineEventsResult {
  status: ConnectionStatus;
  events: LayerEvent[];
  latestByName: LatestLayerEventByName;
}

interface WireMessage {
  event: LayerEvent['name'];
  payload: unknown;
}

function isWireMessage(value: unknown): value is WireMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    'payload' in value &&
    typeof (value as { event: unknown }).event === 'string'
  );
}

/**
 * `ws/gateway.ts`（class-design.md 13章）がブロードキャストする`{event, payload}`形式の
 * レイヤーイベントを購読する。`architecture.md` 7章のイベント一覧をそのまま流す。
 */
export function useEngineEvents(url: string): UseEngineEventsResult {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [events, setEvents] = useState<LayerEvent[]>([]);
  const [latestByName, setLatestByName] = useState<LatestLayerEventByName>({});
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setStatus('connecting');
    setEvents([]);
    setLatestByName({});

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.addEventListener('open', () => setStatus('open'));
    socket.addEventListener('close', () => setStatus('closed'));
    socket.addEventListener('message', (messageEvent: MessageEvent<string>) => {
      const parsed: unknown = JSON.parse(messageEvent.data);
      if (!isWireMessage(parsed)) return;
      const layerEvent = { name: parsed.event, payload: parsed.payload } as LayerEvent;
      setEvents((prev) => [...prev, layerEvent]);
      setLatestByName((prev) => ({ ...prev, [layerEvent.name]: layerEvent }));
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [url]);

  return { status, events, latestByName };
}
