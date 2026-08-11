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

// design/main/*.yaml の relationships（`data/`ドメインのCharacterRelationshipRecord）から
// 抽出した「呼び方」の方向性データ。RelationshipEdgeは6ペア分の対称な数値
// （trust/intimacy/respect）のみを持つため、話者ごとに異なる呼称は別途この
// AddressBookで方向性ありのまま保持する。
export interface AddressBookEntry {
  characterId: string;
  targetCharacterId: string;
  addressTerm: string;
}
