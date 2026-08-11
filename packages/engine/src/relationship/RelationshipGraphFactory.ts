import type { CharacterDefRecord } from '../data/types.js';
import { RelationshipGraph } from './RelationshipGraph.js';
import type { AddressBookEntry } from './types.js';
import { DEFAULT_RELATIONSHIP_VALUES } from './config.js';

/**
 * `CharacterDefLoader`（T04）が読み込んだdesign/mainのrelationshipsを初期値として
 * RelationshipGraphとAddressBook（方向性のある呼称データ）を構築する（data-design.md 4.2）。
 */
export function buildRelationshipGraphFromCharacterDefs(characters: CharacterDefRecord[]): {
  graph: RelationshipGraph;
  addressBook: AddressBookEntry[];
} {
  const graph = new RelationshipGraph();
  const addressBook: AddressBookEntry[] = [];

  for (const character of characters) {
    for (const rel of character.relationships) {
      addressBook.push({
        characterId: rel.characterId,
        targetCharacterId: rel.targetCharacterId,
        addressTerm: rel.address,
      });

      // 相手側の記述が先に処理されていれば既存エッジを維持し、
      // まだ無ければこちら側のdescriptionをtypeの初期値として使う
      // （data-design.md 4.2: 「当面はdescriptionをそのままエッジのメタ情報として保持」）。
      // 双方のdescriptionの文言が食い違う場合（例: 片方は「幼馴染」、もう片方は
      // 「腐れ縁」と書いている等）は先に処理された側が優先され、もう一方は
      // 採用されない（先勝ち）。数値（trust/intimacy/respect）は常に共通の
      // デフォルト値から始まるため、この食い違いが数値に影響することはない。
      if (!graph.hasEdge(rel.characterId, rel.targetCharacterId)) {
        graph.addEdge({
          characterId: rel.characterId,
          targetCharacterId: rel.targetCharacterId,
          type: rel.description,
          ...DEFAULT_RELATIONSHIP_VALUES,
          story: [],
        });
      }
    }
  }

  // 全ペア（4C2まで）を初期化漏れなく保持する（features.md F2.1）。
  // どちらのrelationshipsにも記載が無いペアはgetEdge()呼び出し時に
  // デフォルト値（「初対面」）で遅延生成される。
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      graph.getEdge(characters[i].id, characters[j].id);
    }
  }

  return { graph, addressBook };
}
