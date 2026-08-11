import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterDefLoader } from '@prottype2/engine';
import { migrate } from '../migrate.js';
import { CharacterCacheRepository } from './CharacterCacheRepository.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

describe('CharacterCacheRepository', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('existsはcharacters_cacheに存在するIDでtrue、存在しないIDでfalseを返す', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new CharacterCacheRepository(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters } = await loader.loadAll();
    repo.syncCharacters(characters);

    expect(repo.exists('char_a')).toBe(true);
    expect(repo.exists('char_unknown')).toBe(false);
  });

  it('実際のcharacter_defを取り込んだ結果をキャッシュテーブルへ書き込む', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new CharacterCacheRepository(db);

    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters, subCharacters, memoryPresets } = await loader.loadAll();

    repo.syncCharacters(characters);
    repo.syncSubCharacters(subCharacters);
    repo.syncMemoryPresets(memoryPresets);

    const charRows = db.prepare('SELECT * FROM characters_cache ORDER BY id').all() as Array<
      Record<string, unknown>
    >;
    expect(charRows).toHaveLength(4);
    const charA = charRows.find((r) => r.id === 'char_a');
    expect(charA?.name).toBe('浦々宇良');
    expect(charA?.color).toBe('#FFC20E');
    expect(JSON.parse(charA?.vocabulary_json as string)).toContain('すっげー');

    const relRows = db.prepare('SELECT * FROM character_relationships_cache').all();
    expect((relRows as unknown[]).length).toBeGreaterThan(0);

    const subRows = db.prepare('SELECT * FROM sub_characters_cache').all();
    expect((subRows as unknown[]).length).toBeGreaterThan(0);

    const memoryRows = db.prepare('SELECT * FROM memory_preset_cache').all() as Array<
      Record<string, unknown>
    >;
    expect(memoryRows.length).toBeGreaterThan(0);
    const memA1 = memoryRows.find((r) => r.id === 'mem_a_0001');
    expect(memA1?.owner).toBe('char_a');
    expect(memA1?.shareable).toBe(1);
    expect(JSON.parse(memA1?.participants_json as string)).toEqual(['char_a', 'char_b']);

    const ftsRows = db
      .prepare("SELECT * FROM long_term_memory_fts WHERE memory_id = 'mem_a_0001'")
      .all();
    expect(ftsRows).toHaveLength(1);
  });

  it('syncCharactersは2回目の呼び出しで前回のデータを洗い替える', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new CharacterCacheRepository(db);

    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters } = await loader.loadAll();

    repo.syncCharacters(characters);
    repo.syncCharacters(characters);

    const count = db.prepare('SELECT COUNT(*) as c FROM characters_cache').get() as {
      c: number;
    };
    expect(count.c).toBe(4);
  });

  it('syncMemoryPresetsは2回目の呼び出しでFTSテーブルも洗い替える', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new CharacterCacheRepository(db);

    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters, memoryPresets } = await loader.loadAll();

    // memory_preset_cache.ownerはcharacters_cache(id)を参照するため先に同期する。
    repo.syncCharacters(characters);
    repo.syncMemoryPresets(memoryPresets);
    repo.syncMemoryPresets(memoryPresets);

    const memoryCount = db.prepare('SELECT COUNT(*) as c FROM memory_preset_cache').get() as {
      c: number;
    };
    const ftsCount = db.prepare('SELECT COUNT(*) as c FROM long_term_memory_fts').get() as {
      c: number;
    };
    expect(memoryCount.c).toBe(memoryPresets.length);
    expect(ftsCount.c).toBe(memoryPresets.length);
  });
});
