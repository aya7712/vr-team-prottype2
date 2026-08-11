import { describe, expect, it, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterDefLoader } from '@prottype2/engine';
import { migrate } from '../migrate.js';
import { CharacterCacheRepository } from './CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from './MemoryRepositoryImpl.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

describe('MemoryRepositoryImpl', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  async function setupWithRealCharacterDef() {
    db = new Database(':memory:');
    migrate(db);
    const cacheRepo = new CharacterCacheRepository(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters, memoryPresets } = await loader.loadAll();
    cacheRepo.syncCharacters(characters);
    cacheRepo.syncMemoryPresets(memoryPresets);
    return { memoryPresets };
  }

  it('searchByKeywordはフレーズ全体で一致する記憶を返す（キーワード検索）', async () => {
    await setupWithRealCharacterDef();
    const repo = new MemoryRepositoryImpl(db);

    const results = await repo.searchByKeyword(
      '楽と初めてボルダリングに行き、一番上の課題を登りきれず悔しかったが、また行こうと約束した。',
      10,
    );
    expect(results.map((m) => m.id)).toContain('mem_a_0001');
  });

  it('getAllCandidatesはparticipantsフィルタでpreset記憶を絞り込める', async () => {
    await setupWithRealCharacterDef();
    const repo = new MemoryRepositoryImpl(db);

    const results = await repo.getAllCandidates({ participants: ['char_a'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((m) => m.participants.includes('char_a'))).toBe(true);
  });

  it('意味検索: getEmbeddingはsaveEmbeddingで保存したベクトルを復元できる', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new MemoryRepositoryImpl(db);

    const original = new Float32Array([0.1, -0.2, 0.3, 0.4]);
    repo.saveEmbedding('mem_1', 'preset', 'test-model', original);

    const restored = await repo.getEmbedding('mem_1');
    expect(restored).not.toBeNull();
    expect(Array.from(restored!)).toEqual(Array.from(original));
  });

  it('getEmbeddingは未保存のmemoryIdに対してnullを返す', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new MemoryRepositoryImpl(db);

    expect(await repo.getEmbedding('mem_unknown')).toBeNull();
  });

  it('recordRecall/getRecentRecallsで想起履歴を記録・取得できる', async () => {
    db = new Database(':memory:');
    migrate(db);
    const repo = new MemoryRepositoryImpl(db);

    await repo.recordRecall('session_1', 5, 'mem_1', 'preset');
    const recent = await repo.getRecentRecalls('session_1', 3);
    expect(recent).toEqual(['mem_1']);

    const tooOld = await repo.getRecentRecalls('session_2', 3);
    expect(tooOld).toEqual([]);
  });
});
