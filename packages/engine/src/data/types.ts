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
  // memory/<owner>/*.mdのbody（本人owner一人称の記憶）から抽出した口調の実例（Issue #5
  // コメント案1）。ToneExemplarSelectorがCharacterDefLoader.loadAll()時に付与する。
  // 該当する記憶が無ければ空配列（nullにはしない。プロンプト側の分岐を単純にするため）。
  toneExemplars: string[];
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
