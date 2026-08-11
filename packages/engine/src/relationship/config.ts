// RelationshipGraph初期化時のデフォルト数値（data-design.md 4.2:
// 「既存YAMLに数値の初期値定義がないため、初期値は本エンジン側で定めるコンフィグとする」）。
export const DEFAULT_RELATIONSHIP_VALUES = {
  trust: 0.5,
  intimacy: 0.5,
  respect: 0.5,
} as const;

// design/main/*.yamlのrelationshipsに記載が無いペア（未定義の組み合わせ）に
// 適用する既定のtype（features.md F2.1「デフォルト値『初対面』を許容」）。
export const DEFAULT_RELATIONSHIP_TYPE = '初対面';
