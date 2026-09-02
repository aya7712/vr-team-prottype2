import { describe, expect, it } from 'vitest';
import { InMemoryMemoryRepository } from './InMemoryMemoryRepository.js';
import type { MemoryItem } from '../types/memory.js';

function makeMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: 'mem_1',
    source: 'preset',
    owner: 'char_a',
    participants: ['char_a'],
    summary: 'テストの記憶',
    tags: ['テスト'],
    importance: 3,
    shareable: true,
    body: 'テスト本文',
    ...overrides,
  };
}

describe('InMemoryMemoryRepository', () => {
  it('searchByKeywordはsummary/tags/bodyのいずれかに一致した記憶を返す', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', summary: 'ボルダリングに行った話' }),
      makeMemory({ id: 'mem_2', summary: '無関係な話' }),
    ]);
    const results = await repo.searchByKeyword('ボルダリング', 10);
    expect(results.map((m) => m.id)).toEqual(['mem_1']);
  });

  it('getAllCandidatesはparticipantsフィルタで絞り込める', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', participants: ['char_a', 'char_b'] }),
      makeMemory({ id: 'mem_2', participants: ['char_a', 'char_c'] }),
    ]);
    const results = await repo.getAllCandidates({ ownerId: 'char_a', participants: ['char_b'] });
    expect(results.map((m) => m.id)).toEqual(['mem_1']);
  });

  it('getAllCandidatesはshareableOnlyでshareable:falseを除外する', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', shareable: true }),
      makeMemory({ id: 'mem_2', shareable: false }),
    ]);
    const results = await repo.getAllCandidates({ ownerId: 'char_a', shareableOnly: true });
    expect(results.map((m) => m.id)).toEqual(['mem_1']);
  });

  it('getAllCandidatesはownerIdで絞り込める', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', owner: 'char_a' }),
      makeMemory({ id: 'mem_2', owner: 'char_b' }),
    ]);
    const results = await repo.getAllCandidates({ ownerId: 'char_b' });
    expect(results.map((m) => m.id)).toEqual(['mem_2']);
  });

  it('Issue #9: participantsに含まれていてもownerが異なる記憶は除外される', async () => {
    // mem_shared_by_bはchar_bの視点で書かれた共有記憶（participantsにchar_aも含む）。
    // char_aの発話材料としてはchar_a視点のmem_ownedのみが残るべき。
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_owned', owner: 'char_a', participants: ['char_a', 'char_b'] }),
      makeMemory({ id: 'mem_shared_by_b', owner: 'char_b', participants: ['char_a', 'char_b'] }),
    ]);
    const results = await repo.getAllCandidates({
      ownerId: 'char_a',
      participants: ['char_a'],
    });
    expect(results.map((m) => m.id)).toEqual(['mem_owned']);
  });

  it('recordRecallとgetRecentRecallsはセッション単位で分離される', async () => {
    const repo = new InMemoryMemoryRepository();
    await repo.recordRecall('session_1', 1, 'mem_1', 'preset');
    await repo.recordRecall('session_2', 1, 'mem_2', 'preset');

    expect(await repo.getRecentRecalls('session_1', 5)).toEqual(['mem_1']);
    expect(await repo.getRecentRecalls('session_2', 5)).toEqual(['mem_2']);
  });

  it('getRecentRecallsはwithinTurnsより古い想起を除外する', async () => {
    const repo = new InMemoryMemoryRepository();
    await repo.recordRecall('session_1', 1, 'mem_old', 'preset');
    await repo.recordRecall('session_1', 10, 'mem_new', 'preset');

    expect(await repo.getRecentRecalls('session_1', 3)).toEqual(['mem_new']);
  });

  it('getEmbeddingは常にnullを返す（意味検索はT15で追加）', async () => {
    const repo = new InMemoryMemoryRepository([makeMemory()]);
    expect(await repo.getEmbedding('mem_1')).toBeNull();
  });
});
