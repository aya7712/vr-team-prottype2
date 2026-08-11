// design/main/*.yaml の relationships フィールドをそのまま写した初期データ。
// trust/intimacy/respect等の数値はここでは持たず、F2 Relationship Graphの
// 初期値としてエンジン側コンフィグから算出する（data-design.md 4.2）。
export interface CharacterRelationshipRecord {
  characterId: string;
  targetCharacterId: string;
  address: string;
  description: string;
}

export interface CharacterLlmConfig {
  provider: string;
  model: string;
  temperature: number;
}

export interface CharacterDefRecord {
  id: string;
  name: string;
  furigana: string | null;
  color: string;
  age: number | null;
  gender: string | null;
  firstPerson: string | null;
  personality: string;
  toneSample: string | null;
  vocabulary: string[];
  ngTopics: string[];
  relationships: CharacterRelationshipRecord[];
  unitContext: Record<string, unknown> | null;
  llm: CharacterLlmConfig | null;
  rawYamlPath: string;
}

export interface SubCharacterRecord {
  id: string;
  name: string;
  rawYamlPath: string;
}
