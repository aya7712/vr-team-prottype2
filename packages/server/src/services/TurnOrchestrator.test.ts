import { describe, expect, it, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { EngineEventBus } from '@prottype2/engine';
import type { LlmClient, EmbeddingService } from '@prottype2/engine';
import { migrate } from '../db/migrate.js';
import { SessionRepository } from '../db/repositories/SessionRepository.js';
import { TurnRepository } from '../db/repositories/TurnRepository.js';
import { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from '../db/repositories/MemoryRepositoryImpl.js';
import { TopicRepository } from '../db/repositories/TopicRepository.js';
import { TurnOrchestrator } from './TurnOrchestrator.js';

function seedCharacters(db: Database.Database, ids: string[]) {
  const insert = db.prepare(`
    INSERT INTO characters_cache
      (id, name, furigana, color, age, gender, first_person, personality, tone_sample,
       vocabulary_json, ng_topics_json, unit_context_json, llm_json, raw_yaml_path, loaded_at)
    VALUES (@id, @name, NULL, '#000000', NULL, NULL, '私', @name, NULL, '[]', '[]', NULL, NULL, 'x.yaml', @loadedAt)
  `);
  for (const id of ids) {
    insert.run({ id, name: id, loadedAt: new Date().toISOString() });
  }
}

function makeFakeLlmClient(): LlmClient {
  return { complete: vi.fn().mockResolvedValue('「テスト発話」') };
}

describe('TurnOrchestrator', () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function setup(llmClient: LlmClient = makeFakeLlmClient(), embeddingService?: EmbeddingService) {
    db = new Database(':memory:');
    migrate(db);
    seedCharacters(db, ['char_a', 'char_b']);

    const sessionRepository = new SessionRepository(db);
    const turnRepository = new TurnRepository(db);
    const characterCacheRepository = new CharacterCacheRepository(db);
    const memoryRepository = new MemoryRepositoryImpl(db);
    const topicRepository = new TopicRepository(db);
    const eventBus = new EngineEventBus();

    const session = sessionRepository.create({
      id: 'session_1',
      participantIds: ['char_a', 'char_b'],
      status: 'stopped',
      initialTopic: 'テスト話題',
    });

    const orchestrator = new TurnOrchestrator(
      sessionRepository,
      turnRepository,
      characterCacheRepository,
      memoryRepository,
      topicRepository,
      llmClient,
      eventBus,
      embeddingService,
    );

    return { session, sessionRepository, turnRepository, orchestrator, eventBus, memoryRepository };
  }

  it('startはmaxTurns分のturnsとtopics/turn_layer_eventsを永続化する', async () => {
    const { session, orchestrator, turnRepository } = setup();

    await orchestrator.start(session.id, 2);

    const turns = turnRepository.listBySession(session.id);
    expect(turns).toHaveLength(2);
    expect(turns.map((t) => t.turnNo)).toEqual([1, 2]);

    const layerEvents = turnRepository.listLayerEvents(session.id, 1);
    expect(layerEvents.map((e) => e.layer)).toEqual([
      'topic',
      'relationship',
      'character',
      'dialoguePlanner',
      'memory',
      'llm',
    ]);

    const topicRow = db.prepare('SELECT COUNT(*) as c FROM topics').get() as { c: number };
    expect(topicRow.c).toBeGreaterThan(0);
  });

  it('start完了後、セッションのstatusがcompletedになる', async () => {
    const { session, orchestrator, sessionRepository } = setup();
    await orchestrator.start(session.id, 1);
    expect(sessionRepository.findById(session.id)?.status).toBe('completed');
  });

  it('requestStopを呼ぶと次のターン境界で打ち切りstatusがstoppedになる', async () => {
    const { session, orchestrator, sessionRepository, turnRepository } = setup();

    const runPromise = orchestrator.start(session.id, 100);
    // 1ターン分完了した直後にrequestStopする。フェイクLLMは即時解決するため、
    // 完全な同期タイミング保証はできないが、maxTurns=100に対し早期に停止要求する
    // ことで「途中で打ち切られる」ことを確認する。
    orchestrator.requestStop();
    await runPromise;

    const turns = turnRepository.listBySession(session.id);
    expect(turns.length).toBeLessThan(100);
    expect(sessionRepository.findById(session.id)?.status).toBe('stopped');
  });

  it('LLM呼び出しが例外を投げるとstatusがfailedになる（T40、旧実装ではcompletedのまま握りつぶされていた）', async () => {
    const failingLlmClient: LlmClient = {
      complete: vi.fn().mockRejectedValue(new Error('LLM呼び出しタイムアウト')),
    };
    const { session, orchestrator, sessionRepository } = setup(failingLlmClient);

    await expect(orchestrator.start(session.id, 5)).rejects.toThrow('LLM呼び出しタイムアウト');
    expect(sessionRepository.findById(session.id)?.status).toBe('failed');
  });

  it('session:endイベントがreason=completedで1回だけ発行される（T41）', async () => {
    const { session, orchestrator, eventBus } = setup();
    const onSessionEnd = vi.fn();
    eventBus.on('session:end', onSessionEnd);

    await orchestrator.start(session.id, 1);

    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith({ reason: 'completed', error: undefined });
  });

  it('session:endイベントがLLM例外時にreason=failedとエラーメッセージ付きで発行される（T40/T41）', async () => {
    const failingLlmClient: LlmClient = {
      complete: vi.fn().mockRejectedValue(new Error('LLM呼び出しタイムアウト')),
    };
    const { session, orchestrator, eventBus } = setup(failingLlmClient);
    const onSessionEnd = vi.fn();
    eventBus.on('session:end', onSessionEnd);

    await expect(orchestrator.start(session.id, 5)).rejects.toThrow();

    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith({
      reason: 'failed',
      error: 'LLM呼び出しタイムアウト',
    });
  });

  it('embeddingServiceを注入するとMemoryRetrieverの意味検索まで配線される（T37）', async () => {
    const embed = vi.fn().mockResolvedValue(new Float32Array([1, 0]));
    // T43: MemoryRetriever.recordSelfUtterance（話者自身の発話をsession_memoriesへ保存する
    // 際のembedding保存）がgetModelも呼ぶようになったため、embedと合わせてフェイクに含める。
    const embeddingService = {
      embed,
      getModel: vi.fn().mockReturnValue('test-model'),
    } as unknown as EmbeddingService;
    const { session, orchestrator, memoryRepository } = setup(
      makeFakeLlmClient(),
      embeddingService,
    );

    // char_aが参照可能な記憶を1件仕込み、embedding付きにする。`repo.getEmbedding`は
    // MemoryRetriever.computeSemanticScores()からのみ呼ばれる（TopicClassifierは
    // MemoryRepositoryに一切依存しない）ため、これが呼ばれたことをもってMemoryRetriever
    // 側の配線（embeddingServiceの伝播）を、TopicClassifier経由の呼び出しと区別して検証できる。
    db.prepare(
      `
      INSERT INTO memory_preset_cache
        (id, owner, participants_json, summary, tags_json, importance, shareable, body, raw_md_path, loaded_at)
      VALUES ('mem_1', 'char_a', '["char_a"]', 'テストの記憶', '[]', 1, 1, '本文', 'x.md', ?)
      `,
    ).run(new Date().toISOString());
    db.prepare(
      `
      INSERT INTO memory_embeddings (memory_id, memory_source, model, vector, updated_at)
      VALUES ('mem_1', 'preset', 'test-model', ?, ?)
      `,
    ).run(Buffer.from(new Float32Array([1, 0]).buffer), new Date().toISOString());

    const getEmbeddingSpy = vi.spyOn(memoryRepository, 'getEmbedding');

    await orchestrator.start(session.id, 1);

    expect(getEmbeddingSpy).toHaveBeenCalledWith('mem_1');
  });

  it('存在しないセッションIDに対してstartは例外を投げる', async () => {
    const { orchestrator } = setup();
    await expect(orchestrator.start('missing', 1)).rejects.toThrow();
  });

  it('実行完了後にeventBusのリスナーが解除される（2回実行しても重複永続化されない）', async () => {
    const { session, orchestrator, turnRepository } = setup();

    await orchestrator.start(session.id, 1);
    const afterFirst = turnRepository.listLayerEvents(session.id, 1).length;

    // 2回目の実行は新しいセッションで行い、1回目のリスナーが残っていないことを検証する。
    const db2 = db;
    const sessionRepository2 = new SessionRepository(db2);
    const session2 = sessionRepository2.create({
      id: 'session_2',
      participantIds: ['char_a', 'char_b'],
      status: 'stopped',
      initialTopic: 'テスト話題',
    });
    await orchestrator.start(session2.id, 1);

    // session_1側のレイヤーイベント件数が2回目の実行によって変化していないこと
    // （リスナー解除が効いていること）を確認する。
    expect(turnRepository.listLayerEvents(session.id, 1).length).toBe(afterFirst);
  });
});
