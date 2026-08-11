import type { RelationshipEdge } from '../types/relationship.js';

// F2 Relationship Engine（class-design.md 5章）の内部型。
// CharacterBrain.applyRelationshipContext（F1.3）が本ファイルのRelationshipContextに
// 依存するため、Relationship Engine本体（T06）に先立って型のみここで定義する。
export interface RelationshipContext {
  edge: RelationshipEdge;
  addressTerm: string;
  honorificLevel: number;
  jokeTolerance: number;
  distance: number;
}
