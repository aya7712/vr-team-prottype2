// RelationshipGraph（F2.1）ではペアを無向として扱う（4体構成で最大6エッジ）。
// characterId/targetCharacterIdの並び順に意味はなく、trust/intimacy/respectは
// ペアに対して対称な値として扱われる。話者ごとに異なる呼称（address）はここではなく
// AddressBookEntry（relationship/types.ts）で方向性ありのまま別管理する。
export interface RelationshipEdge {
  characterId: string;
  targetCharacterId: string;
  type: string;
  trust: number;
  intimacy: number;
  respect: number;
  story: RelationshipStoryEvent[];
}

export interface RelationshipStoryEvent {
  turnNo?: number;
  summary: string;
  source: 'preset' | 'session';
}
