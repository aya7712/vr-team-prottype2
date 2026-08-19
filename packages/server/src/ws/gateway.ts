import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { EngineEventBus, LayerEventName } from '@prottype2/engine';

// architecture.md 7章のWebSocketイベント一覧。EngineEventBusで発行されるものと同じ。
const LAYER_EVENT_NAMES: LayerEventName[] = [
  'turn:start',
  'layer:topic',
  'layer:relationship',
  'layer:character',
  'layer:dialoguePlanner',
  'layer:memory',
  'layer:llm',
  'turn:complete',
  'session:end', // T41: セッション全体の終了（正常完了/打ち切り/エラー）をUIに伝える。
];

/**
 * `EngineEventBus`を購読し、発行されたレイヤーイベントを全接続クライアントへ
 * ブロードキャストする（F8.3、class-design.md 13章）。EngineはWebSocketの存在を
 * 知らない（`ConversationManager`はEngineEventBusにemitするだけ）。
 */
export function attachWebSocketGateway(
  httpServer: HttpServer,
  eventBus: EngineEventBus,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  for (const eventName of LAYER_EVENT_NAMES) {
    eventBus.on(eventName, (payload) => {
      const message = JSON.stringify({ event: eventName, payload });
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      }
    });
  }

  return wss;
}
