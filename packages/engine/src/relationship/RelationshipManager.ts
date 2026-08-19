import type { RelationshipGraph } from './RelationshipGraph.js';
import type { AddressBookEntry, RelationshipContext } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 話者→相手の関係コンテキストを解決する（F2.2）。
 *
 * class-design.md 5章ではMemoryRetriever（F3）も依存として示されているが、
 * `resolve()`が返すRelationshipContextはメモリを含まず、共有記憶検索は
 * ConversationManager（T12）がMemoryRetrieverを別途呼び出す形で行うため、依存から外している。
 * features.md F4.2が挙げる「関連度をRelationshipManager側の判定に反映する」構想は
 * T38（2026-08-19）で見送った（プロトタイプ規模ではパイプライン順序の組み替えコストに
 * 見合わないと判断）。
 */
export class RelationshipManager {
  constructor(
    private readonly graph: RelationshipGraph,
    private readonly addressBook: AddressBookEntry[],
  ) {}

  // T31で追加: ConversationManagerがターン結果をRelationshipUpdaterへ渡す際に
  // 更新対象のグラフを参照するために必要（F2.4）。
  getGraph(): RelationshipGraph {
    return this.graph;
  }

  resolve(speakerId: string, targetId: string): RelationshipContext {
    const edge = this.graph.getEdge(speakerId, targetId);
    const addressTerm =
      this.addressBook.find(
        (entry) => entry.characterId === speakerId && entry.targetCharacterId === targetId,
      )?.addressTerm ?? '';

    return {
      edge,
      addressTerm,
      honorificLevel: clamp(1 - edge.intimacy, 0, 1),
      jokeTolerance: clamp(edge.intimacy, 0, 1),
      distance: clamp(1 - (edge.trust + edge.intimacy) / 2, 0, 1),
    };
  }
}
