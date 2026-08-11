import { EventEmitter } from 'node:events';
import type { LayerEventName } from '../types/events.js';

/** Node.js EventEmitterの薄いラッパー。層名をtypedにする（F8.3、class-design.md 11章）。 */
export class EngineEventBus {
  private readonly emitter = new EventEmitter();

  on(event: LayerEventName, handler: (payload: unknown) => void): void {
    this.emitter.on(event, handler);
  }

  // class-design.md 11章のインターフェースには無いが、server層（TurnOrchestrator、T18）が
  // セッション実行のたびに購読・解除するために必要なため追加した。
  off(event: LayerEventName, handler: (payload: unknown) => void): void {
    this.emitter.off(event, handler);
  }

  emit(event: LayerEventName, payload: unknown): void {
    this.emitter.emit(event, payload);
  }
}
