import { describe, expect, it } from 'vitest';
import { CharacterDefLoader } from './CharacterDefLoader.js';
import { YamlCharacterParser } from './YamlCharacterParser.js';
import { MarkdownMemoryParser } from './MarkdownMemoryParser.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

describe('CharacterDefLoader', () => {
  it('実際のcharacter_defから4体のキャラクターと記憶ファイルを正しく読み込む', async () => {
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters, subCharacters, memoryPresets } = await loader.loadAll();

    expect(characters).toHaveLength(4);
    const ids = characters.map((c) => c.id).sort();
    expect(ids).toEqual(['char_a', 'char_b', 'char_c', 'char_d']);

    const charA = characters.find((c) => c.id === 'char_a');
    expect(charA?.name).toBe('浦々宇良');
    expect(charA?.color).toBe('#FFC20E');
    expect(charA?.personality.length).toBeGreaterThan(0);
    expect(charA?.relationships.length).toBeGreaterThan(0);
    expect(charA?.relationships[0]).toMatchObject({
      characterId: 'char_a',
      targetCharacterId: 'char_b',
      address: '楽',
    });
    expect(charA?.relationships.every((r) => r.characterId === 'char_a')).toBe(true);

    expect(subCharacters.length).toBeGreaterThan(0);
    expect(subCharacters.every((s) => s.id.length > 0 && s.name.length > 0)).toBe(true);

    expect(memoryPresets.length).toBeGreaterThan(0);
    for (const owner of ['char_a', 'char_b', 'char_c', 'char_d']) {
      expect(memoryPresets.some((m) => m.owner === owner)).toBe(true);
    }

    const memA1 = memoryPresets.find((m) => m.id === 'mem_a_0001');
    expect(memA1).toBeDefined();
    expect(memA1?.participants).toEqual(['char_a', 'char_b']);
    expect(memA1?.shareable).toBe(true);
    expect(memA1?.related).toEqual(['mem_a_0002', 'mem_b_0001']);
    expect(memA1?.body?.length).toBeGreaterThan(0);
  });
});

describe('YamlCharacterParser 異常系', () => {
  const parser = new YamlCharacterParser();

  it('idが欠落したmainキャラクターYAMLで例外を投げる', () => {
    const invalidYaml = `
name: "テスト"
color: "#000000"
personality: "テスト"
`;
    expect(() => parser.parseMain(invalidYaml, 'test.yaml')).toThrow(/id/);
  });

  it('colorが欠落したmainキャラクターYAMLで例外を投げる', () => {
    const invalidYaml = `
id: char_test
name: "テスト"
personality: "テスト"
`;
    expect(() => parser.parseMain(invalidYaml, 'test.yaml')).toThrow(/color/);
  });

  it('ルートが配列のYAMLで例外を投げる', () => {
    expect(() => parser.parseMain('- a\n- b\n', 'test.yaml')).toThrow(/オブジェクト/);
  });

  it('idが欠落したsubキャラクターYAMLで例外を投げる', () => {
    const invalidYaml = `
name: "テスト"
`;
    expect(() => parser.parseSub(invalidYaml, 'test.yaml')).toThrow(/id/);
  });
});

describe('MarkdownMemoryParser 異常系', () => {
  const parser = new MarkdownMemoryParser();

  it('frontmatterが無いMarkdownで例外を投げる', () => {
    expect(() => parser.parse('本文だけです', 'test.md')).toThrow(/frontmatter/);
  });

  it('必須フィールド(summary)が欠落したfrontmatterで例外を投げる', () => {
    const invalidMd = `---
id: "mem_x_0001"
owner: "char_a"
participants: ["char_a"]
occurred_at: null
occurred_era: "昔"
location: null
tags: ["test"]
importance: 1
emotion: null
shareable: true
related: null
---

本文
`;
    expect(() => parser.parse(invalidMd, 'test.md')).toThrow(/summary/);
  });

  it('shareable: falseの記憶を正しくパースする', () => {
    const md = `---
id: "mem_x_0002"
owner: "char_a"
participants: ["char_a"]
occurred_at: null
occurred_era: "昔"
location: null
summary: "秘密の話"
tags: ["秘密"]
importance: 2
emotion: null
shareable: false
related: null
---

本文です
`;
    const result = parser.parse(md, 'test.md');
    expect(result.shareable).toBe(false);
    expect(result.body).toBe('本文です');
  });
});
