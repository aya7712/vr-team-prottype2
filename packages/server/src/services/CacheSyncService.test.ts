import { describe, expect, it, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterDefLoader } from '@prottype2/engine';
import type { EmbeddingService } from '@prottype2/engine';
import { migrate } from '../db/migrate.js';
import { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from '../db/repositories/MemoryRepositoryImpl.js';
import { CacheSyncService } from './CacheSyncService.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

describe('CacheSyncService', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it('実際のcharacter_defを取り込みキャッシュテーブルへ同期する', async () => {
    db = new Database(':memory:');
    migrate(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const cacheRepo = new CharacterCacheRepository(db);
    const memoryRepo = new MemoryRepositoryImpl(db);

    const service = new CacheSyncService(loader, cacheRepo, memoryRepo);
    await service.sync();

    const charCount = db.prepare('SELECT COUNT(*) as c FROM characters_cache').get() as {
      c: number;
    };
    const memoryCount = db.prepare('SELECT COUNT(*) as c FROM memory_preset_cache').get() as {
      c: number;
    };
    expect(charCount.c).toBe(4);
    expect(memoryCount.c).toBeGreaterThan(0);
  });

  it('embeddingServiceが注入されている場合、記憶ごとにembeddingを計算しmemory_embeddingsへ保存する', async () => {
    db = new Database(':memory:');
    migrate(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const cacheRepo = new CharacterCacheRepository(db);
    const memoryRepo = new MemoryRepositoryImpl(db);
    const embeddingService = {
      embed: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2])),
    } as unknown as EmbeddingService;

    const service = new CacheSyncService(loader, cacheRepo, memoryRepo, embeddingService);
    await service.sync();

    const embeddingCount = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get() as {
      c: number;
    };
    const memoryCount = db.prepare('SELECT COUNT(*) as c FROM memory_preset_cache').get() as {
      c: number;
    };
    expect(embeddingCount.c).toBe(memoryCount.c);
    expect(embeddingService.embed).toHaveBeenCalled();
  });

  it('embeddingServiceが無い場合はmemory_embeddingsへ何も書き込まない', async () => {
    db = new Database(':memory:');
    migrate(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const cacheRepo = new CharacterCacheRepository(db);
    const memoryRepo = new MemoryRepositoryImpl(db);

    const service = new CacheSyncService(loader, cacheRepo, memoryRepo);
    await service.sync();

    const embeddingCount = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get() as {
      c: number;
    };
    expect(embeddingCount.c).toBe(0);
  });
});
