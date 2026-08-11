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
