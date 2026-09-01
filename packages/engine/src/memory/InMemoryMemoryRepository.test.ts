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
    const results = await repo.getAllCandidates({ participants: ['char_b'] });
    expect(results.map((m) => m.id)).toEqual(['mem_1']);
  });

  it('getAllCandidatesはshareableOnlyでshareable:falseを除外する', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', shareable: true }),
      makeMemory({ id: 'mem_2', shareable: false }),
    ]);
    const results = await repo.getAllCandidates({ shareableOnly: true });
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

  it('getEmbeddingは未保存のmemoryIdに対してnullを返す', async () => {
    const repo = new InMemoryMemoryRepository([makeMemory()]);
    expect(await repo.getEmbedding('mem_1')).toBeNull();
  });

  // T43（Issue #5「口調が前の話者に引っ張られる」対応, plan-f）
  it('saveSessionMemoryで保存した記憶はgetAllCandidatesで取得できる', async () => {
    const repo = new InMemoryMemoryRepository([]);
    const item = makeMemory({ id: 'mem_session_1', source: 'session', shareable: false });

    await repo.saveSessionMemory('session_1', 2, item);

    const results = await repo.getAllCandidates({ ownerId: 'char_a' });
    expect(results.map((m) => m.id)).toEqual(['mem_session_1']);
  });

  it('saveEmbeddingで保存したベクトルはgetEmbeddingで復元できる', async () => {
    const repo = new InMemoryMemoryRepository([]);
    const vector = new Float32Array([0.1, 0.2, 0.3]);

    await repo.saveEmbedding('mem_1', 'session', 'test-model', vector);

    expect(await repo.getEmbedding('mem_1')).toEqual(vector);
  });
});
