import type { RelationshipEdge } from '../types/relationship.js';
import { DEFAULT_RELATIONSHIP_TYPE, DEFAULT_RELATIONSHIP_VALUES } from './config.js';

// ペアは無向（4体構成で最大6エッジ、features.md F2.1）。
// キーは2つのcharacterIdを辞書順に並べたもので正規化し、getEdge(a,b)は
// 呼び出し順によらず同じエッジを返す。
function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/** キャラクター間の関係をノード・エッジで保持するグラフ（F2.1）。 */
export class RelationshipGraph {
  private readonly edges = new Map<string, RelationshipEdge>();

  addEdge(edge: RelationshipEdge): void {
    this.edges.set(pairKey(edge.characterId, edge.targetCharacterId), edge);
  }

  hasEdge(a: string, b: string): boolean {
    return this.edges.has(pairKey(a, b));
  }

  getEdge(a: string, b: string): RelationshipEdge {
    const existing = this.edges.get(pairKey(a, b));
    if (existing) return existing;

    const fallback: RelationshipEdge = {
      characterId: a,
      targetCharacterId: b,
      type: DEFAULT_RELATIONSHIP_TYPE,
      ...DEFAULT_RELATIONSHIP_VALUES,
      story: [],
    };
    this.edges.set(pairKey(a, b), fallback);
    return fallback;
  }

  updateEdge(a: string, b: string, patch: Partial<RelationshipEdge>): void {
    const current = this.getEdge(a, b);
    this.edges.set(pairKey(a, b), { ...current, ...patch });
  }

  // グループ内の凝集度（ペア単位のintimacy平均、features.md F2.1）。
  getSubgroupCohesion(characterIds: string[]): number {
    const pairs: [string, string][] = [];
    for (let i = 0; i < characterIds.length; i++) {
      for (let j = i + 1; j < characterIds.length; j++) {
        pairs.push([characterIds[i], characterIds[j]]);
      }
    }
    if (pairs.length === 0) return 0;

    const total = pairs.reduce((sum, [a, b]) => sum + this.getEdge(a, b).intimacy, 0);
    return total / pairs.length;
  }
}
