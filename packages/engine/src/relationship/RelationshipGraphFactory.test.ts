import { describe, expect, it } from 'vitest';
import { buildRelationshipGraphFromCharacterDefs } from './RelationshipGraphFactory.js';
import { CharacterDefLoader } from '../data/CharacterDefLoader.js';
import type { CharacterDefRecord } from '../data/types.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

function makeCharacter(
  id: string,
  relationships: CharacterDefRecord['relationships'],
): CharacterDefRecord {
  return {
    id,
    name: id,
    furigana: null,
    color: '#000000',
    age: null,
    gender: null,
    firstPerson: null,
    personality: 'テスト',
    toneSample: null,
    vocabulary: [],
    ngTopics: [],
    relationships,
    unitContext: null,
    llm: null,
    rawYamlPath: `${id}.yaml`,
  };
}

describe('buildRelationshipGraphFromCharacterDefs', () => {
  it('2体構成でグラフとAddressBookを構築できる', () => {
    const charA = makeCharacter('char_a', [
      { characterId: 'char_a', targetCharacterId: 'char_b', address: '楽', description: '幼馴染' },
    ]);
    const charB = makeCharacter('char_b', [
      {
        characterId: 'char_b',
        targetCharacterId: 'char_a',
        address: '宇良',
        description: '幼馴染',
      },
    ]);

    const { graph, addressBook } = buildRelationshipGraphFromCharacterDefs([charA, charB]);

    expect(graph.getEdge('char_a', 'char_b').type).toBe('幼馴染');
    expect(
      addressBook.find((e) => e.characterId === 'char_a' && e.targetCharacterId === 'char_b')
        ?.addressTerm,
    ).toBe('楽');
    expect(
      addressBook.find((e) => e.characterId === 'char_b' && e.targetCharacterId === 'char_a')
        ?.addressTerm,
    ).toBe('宇良');
  });

  it('4体構成で全6ペアの初期化漏れがない', () => {
    const chars = ['char_a', 'char_b', 'char_c', 'char_d'].map((id) =>
      makeCharacter(
        id,
        ['char_a', 'char_b', 'char_c', 'char_d']
          .filter((other) => other !== id)
          .map((other) => ({
            characterId: id,
            targetCharacterId: other,
            address: other,
            description: `${id}から見た${other}`,
          })),
      ),
    );

    const { graph } = buildRelationshipGraphFromCharacterDefs(chars);

    let count = 0;
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        expect(graph.hasEdge(chars[i].id, chars[j].id)).toBe(true);
        count++;
      }
    }
    expect(count).toBe(6);
  });

  it('双方のdescriptionが食い違う場合は先に処理された側が優先される（先勝ち）', () => {
    const charA = makeCharacter('char_a', [
      { characterId: 'char_a', targetCharacterId: 'char_b', address: '楽', description: '幼馴染' },
    ]);
    const charB = makeCharacter('char_b', [
      {
        characterId: 'char_b',
        targetCharacterId: 'char_a',
        address: '宇良',
        description: '腐れ縁',
      },
    ]);

    const { graph } = buildRelationshipGraphFromCharacterDefs([charA, charB]);
    expect(graph.getEdge('char_a', 'char_b').type).toBe('幼馴染');
  });

  it('relationshipsに記載の無いペアはデフォルト値（初対面）になる', () => {
    const charA = makeCharacter('char_a', []);
    const charB = makeCharacter('char_b', []);

    const { graph } = buildRelationshipGraphFromCharacterDefs([charA, charB]);
    const edge = graph.getEdge('char_a', 'char_b');
    expect(edge.type).toBe('初対面');
    expect(edge.trust).toBe(0.5);
  });

  // T28: 実際のcharacter_def（4体）を読み込ませ、全6ペアが初期化漏れなく
  // 構築されることを確認する（合成データでの4体テストに加えて実データでも検証する）。
  it('実際のcharacter_def（4体）で全6ペアが初期化漏れなく構築される', async () => {
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters } = await loader.loadAll();
    expect(characters).toHaveLength(4);

    const { graph } = buildRelationshipGraphFromCharacterDefs(characters);

    let count = 0;
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        expect(graph.hasEdge(characters[i].id, characters[j].id)).toBe(true);
        const edge = graph.getEdge(characters[i].id, characters[j].id);
        expect(edge.type).not.toBe('初対面');
        count++;
      }
    }
    expect(count).toBe(6);
  });
});
