import { describe, expect, it, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { CharacterDefLoader, MemoryRetriever } from '@prottype2/engine';
import type { EmbeddingService } from '@prottype2/engine';
import { migrate } from '../migrate.js';
import { CharacterCacheRepository } from './CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from './MemoryRepositoryImpl.js';

const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';

/**
 * MemoryRetriever（engine, T07/T15）とMemoryRepositoryImpl（server, T15）を
 * 実際のcharacter_defデータで組み合わせた統合テスト。doc/todo.md T15のテスト要件:
 * 「キーワード検索・意味検索それぞれで期待する記憶が上位に来ることを確認する」。
 */
describe('MemoryRetriever × MemoryRepositoryImpl（実character_defデータ）', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  async function setup() {
    db = new Database(':memory:');
    migrate(db);
    const cacheRepo = new CharacterCacheRepository(db);
    const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
    const { characters, memoryPresets } = await loader.loadAll();
    cacheRepo.syncCharacters(characters);
    cacheRepo.syncMemoryPresets(memoryPresets);
    return { memoryPresets };
  }

  it('キーワード検索: ボルダリングに関するtopicKeywordsでmem_a_0001が上位に来る', async () => {
    await setup();
    const memoryRepo = new MemoryRepositoryImpl(db);
    const retriever = new MemoryRetriever(memoryRepo);

    const results = await retriever.retrieve({
      sessionId: 'session_1',
      turnNo: 1,
      speakerId: 'char_a',
      targetIds: ['char_b'],
      topicKeywords: ['ボルダリング'],
      dialogueAct: 'story',
    });

    expect(results[0]?.id).toBe('mem_a_0001');
  });

  it('意味検索: embeddingServiceを注入すると、キーワードでは拾えない同義語クエリでも意味的に近い記憶が上位に来る', async () => {
    const { memoryPresets } = await setup();
    const memoryRepo = new MemoryRepositoryImpl(db);

    // 事前計算済みベクトルとして、mem_a_0001（ボルダリングの思い出）だけクエリベクトルと
    // 同一方向、他は直交方向に割り当てる（Embedding APIは課金が発生するため使わない）。
    for (const memory of memoryPresets) {
      if (memory.owner !== 'char_a') continue;
      const vector =
        memory.id === 'mem_a_0001' ? new Float32Array([1, 0]) : new Float32Array([0, 1]);
      await memoryRepo.saveEmbedding(memory.id, 'preset', 'test-model', vector);
    }

    const embeddingService = {
      embed: vi.fn().mockResolvedValue(new Float32Array([1, 0])),
    } as unknown as EmbeddingService;
    const retriever = new MemoryRetriever(memoryRepo, embeddingService);

    // 'クライミング'はmem_a_0001の本文中には登場しないため、キーワード一致では拾えない
    // （意味検索によってのみ上位に来ることを確認する）。
    const results = await retriever.retrieve({
      sessionId: 'session_1',
      turnNo: 1,
      speakerId: 'char_a',
      targetIds: ['char_b'],
      topicKeywords: ['クライミング'],
      dialogueAct: 'story',
    });

    expect(results[0]?.id).toBe('mem_a_0001');
    expect(embeddingService.embed).toHaveBeenCalledWith('クライミング');
  });
});
