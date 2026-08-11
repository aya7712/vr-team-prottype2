import { describe, expect, it, vi } from 'vitest';
import { InMemoryMemoryRepository } from './InMemoryMemoryRepository.js';
import { MemoryRetriever } from './MemoryRetriever.js';
import type { EmbeddingService } from './EmbeddingService.js';
import type { MemoryRepository } from './MemoryRepository.js';
import type { MemoryItem } from '../types/memory.js';
import type { MemoryQuery } from './types.js';

// InMemoryMemoryRepository.getEmbedding()は常にnull（T07）を返すため、
// 意味検索のテストにはembeddingを返すフェイクリポジトリでラップする。
function withEmbeddings(
  repo: InMemoryMemoryRepository,
  embeddings: Record<string, Float32Array>,
): MemoryRepository {
  return {
    searchByKeyword: (q, limit) => repo.searchByKeyword(q, limit),
    getAllCandidates: (filter) => repo.getAllCandidates(filter),
    recordRecall: (sessionId, turnNo, memoryId, source) =>
      repo.recordRecall(sessionId, turnNo, memoryId, source),
    getRecentRecalls: (sessionId, withinTurns) => repo.getRecentRecalls(sessionId, withinTurns),
    getEmbedding: async (memoryId) => embeddings[memoryId] ?? null,
  };
}

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

function makeQuery(overrides: Partial<MemoryQuery> = {}): MemoryQuery {
  return {
    sessionId: 'session_1',
    turnNo: 1,
    speakerId: 'char_a',
    targetIds: ['char_b'],
    topicKeywords: [],
    dialogueAct: 'story',
    ...overrides,
  };
}

describe('MemoryRetriever', () => {
  it('shareable: falseの記憶は他キャラとの会話（targetIdsあり）で除外される', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_secret', shareable: false, participants: ['char_a'] }),
      makeMemory({ id: 'mem_open', shareable: true, participants: ['char_a'] }),
    ]);
    const retriever = new MemoryRetriever(repo);

    const results = await retriever.retrieve(makeQuery({ targetIds: ['char_b'] }));
    expect(results.map((m) => m.id)).toEqual(['mem_open']);
  });

  it('相手がいない（targetIds空）場合はshareable: falseの記憶も対象になる', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_secret', shareable: false, participants: ['char_a'] }),
    ]);
    const retriever = new MemoryRetriever(repo);

    const results = await retriever.retrieve(makeQuery({ targetIds: [] }));
    expect(results.map((m) => m.id)).toEqual(['mem_secret']);
  });

  it('共有記憶は今の会話相手（targetIds）が参加者に含まれる場合のみ対象になる', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_self', owner: 'char_a', participants: ['char_a'] }),
      makeMemory({
        id: 'mem_shared_with_b',
        owner: 'char_a',
        participants: ['char_a', 'char_b'],
      }),
    ]);
    const retriever = new MemoryRetriever(repo);

    // char_cとの会話ではchar_bとの共有記憶は無関係なので対象外、自己記憶のみ残る。
    const results = await retriever.retrieve(
      makeQuery({ speakerId: 'char_a', targetIds: ['char_c'] }),
    );
    expect(results.map((m) => m.id)).toEqual(['mem_self']);
  });

  it('participantsに話者が含まれない記憶は対象外になる（自己記憶/共有記憶の切り分け）', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_self', owner: 'char_a', participants: ['char_a'] }),
      makeMemory({ id: 'mem_shared', owner: 'char_a', participants: ['char_a', 'char_b'] }),
      makeMemory({ id: 'mem_others', owner: 'char_c', participants: ['char_c', 'char_d'] }),
    ]);
    const retriever = new MemoryRetriever(repo);

    const results = await retriever.retrieve(makeQuery({ speakerId: 'char_a' }));
    const ids = results.map((m) => m.id).sort();
    expect(ids).toEqual(['mem_self', 'mem_shared']);
  });

  it('topicKeywordsに一致する記憶ほど上位に来る', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_unrelated', summary: '無関係な話', importance: 5 }),
      makeMemory({ id: 'mem_related', summary: 'ボルダリングの話', importance: 1 }),
    ]);
    const retriever = new MemoryRetriever(repo);

    const results = await retriever.retrieve(
      makeQuery({ targetIds: [], topicKeywords: ['ボルダリング'] }),
    );
    expect(results[0]?.id).toBe('mem_related');
  });

  it('直近数ターン以内に想起済みの記憶は除外される', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', participants: ['char_a'] }),
    ]);
    const retriever = new MemoryRetriever(repo);

    await retriever.retrieve(makeQuery({ turnNo: 1, targetIds: [] }));
    const secondResults = await retriever.retrieve(makeQuery({ turnNo: 2, targetIds: [] }));
    expect(secondResults).toEqual([]);
  });

  it('選出した記憶はrecordRecallでrepoに記録される', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', participants: ['char_a'] }),
    ]);
    const retriever = new MemoryRetriever(repo);

    await retriever.retrieve(makeQuery({ turnNo: 5, targetIds: [] }));
    expect(await repo.getRecentRecalls('session_1', 10)).toEqual(['mem_1']);
  });

  it('embeddingServiceを注入すると意味的に近い記憶が上位に来る（T15、data-design.md 6.2②）', async () => {
    const baseRepo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_close', summary: '無関係な単語のみ', importance: 1 }),
      makeMemory({ id: 'mem_far', summary: '無関係な単語のみ', importance: 1 }),
    ]);
    const repo = withEmbeddings(baseRepo, {
      mem_close: new Float32Array([1, 0]),
      mem_far: new Float32Array([0, 1]),
    });
    const embeddingService = {
      embed: vi.fn().mockResolvedValue(new Float32Array([1, 0])),
    } as unknown as EmbeddingService;

    const retriever = new MemoryRetriever(repo, embeddingService);
    const results = await retriever.retrieve(
      makeQuery({ targetIds: [], topicKeywords: ['クエリ'] }),
    );

    expect(results[0]?.id).toBe('mem_close');
    expect(embeddingService.embed).toHaveBeenCalledWith('クエリ');
  });

  it('embeddingServiceが無い場合はキーワードのみでランキングされる（T07までの挙動を維持）', async () => {
    const repo = new InMemoryMemoryRepository([
      makeMemory({ id: 'mem_1', summary: 'ボルダリングの話', importance: 1 }),
    ]);
    const retriever = new MemoryRetriever(repo);

    const results = await retriever.retrieve(
      makeQuery({ targetIds: [], topicKeywords: ['ボルダリング'] }),
    );
    expect(results.map((m) => m.id)).toEqual(['mem_1']);
  });
});
