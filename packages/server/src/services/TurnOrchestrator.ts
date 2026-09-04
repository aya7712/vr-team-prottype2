import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  CharacterBrain,
  EmotionUpdater,
  GoalUpdater,
  IntentUpdater,
  SpeakingStyleResolver,
  RelationshipManager,
  RelationshipUpdater,
  buildRelationshipGraphFromCharacterDefs,
  TopicClassifier,
  TopicParameterUpdater,
  TopicContinuationScorer,
  TopicTree,
  RhythmTracker,
  ConversationStateManager,
  DialogueActCatalog,
  ScoreCalculator,
  SoftmaxSelector,
  SpeechExpectationCalculator,
  DialoguePlanner,
  MemoryRetriever,
  PromptTemplateLoader,
  PromptBuilder,
  OutputParser,
  SpeakerSelector,
  AddresseeSelector,
  EndConditionEvaluator,
  TopicBranchMerger,
  ConversationManager,
} from '@prottype2/engine';
import type {
  LlmClient,
  EngineEventBus,
  TurnResult,
  LayerEventName,
  Topic,
  EmbeddingService,
  SessionEndReason,
} from '@prottype2/engine';
import type { SessionRepository } from '../db/repositories/SessionRepository.js';
import type { TurnRepository } from '../db/repositories/TurnRepository.js';
import type { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';
import type { MemoryRepositoryImpl } from '../db/repositories/MemoryRepositoryImpl.js';
import type { TopicRepository } from '../db/repositories/TopicRepository.js';
import type { LayerName } from '../db/repositories/types.js';

// packages/engine/prompts はビルド成果物（dist/）に含まれないソース資産のため、
// `@prottype2/engine`のmain解決先（dist/index.js）からパッケージルートを逆算して参照する
// （CHARACTER_DEF_PATHと同様、engineパッケージのルート相対で解決する）。
function resolveEnginePromptsPath(): string {
  const require = createRequire(import.meta.url);
  const engineMainPath = require.resolve('@prottype2/engine');
  const engineRoot = dirname(dirname(engineMainPath));
  // PromptBuilder.build()には'utterance/base'のようにサブディレクトリ込みの
  // テンプレート名を渡す（ConversationManager.buildPrompt）ため、ここではprompts/直下を返す。
  return join(engineRoot, 'prompts');
}

const DEFAULT_MAX_TURNS = 10;
const PERSISTED_LAYERS: LayerName[] = [
  'topic',
  'relationship',
  'character',
  'dialoguePlanner',
  'memory',
  'llm',
];

/**
 * `ConversationManager.runSession`を実行しつつ`turns`/`turn_layer_events`へ永続化する
 * （class-design.md 13章、F8.1）。
 *
 * プロトタイプは単一セッションのローカル実行を想定しており（architecture.md 1章）、
 * 同時に複数セッションを並行実行することは想定していない。`EngineEventBus`はserver全体で
 * 共有される単一インスタンスのため、実行のたびに永続化用リスナーを購読し、
 * 完了時に必ず解除する（他セッション実行時の二重登録を防ぐ）。
 */
export class TurnOrchestrator {
  private running = false;
  private stopRequested = false;

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly turnRepository: TurnRepository,
    private readonly characterCacheRepository: CharacterCacheRepository,
    private readonly memoryRepository: MemoryRepositoryImpl,
    private readonly topicRepository: TopicRepository,
    private readonly llmClient: LlmClient,
    private readonly eventBus: EngineEventBus,
    // T15で実装済みのEmbeddingServiceをTopicClassifierの意味的類似度判定（T36）と
    // MemoryRetrieverの意味検索（T15設計時点で配線漏れだったものをT37で解消）に使う。
    // 未注入時はTopicClassifierがJaccard係数、MemoryRetrieverがキーワード一致のみに
    // フォールバックするため、既存呼び出し元との後方互換のためoptionalにする。
    private readonly embeddingService?: EmbeddingService,
  ) {}

  async start(sessionId: string, maxTurns: number = DEFAULT_MAX_TURNS): Promise<void> {
    if (this.running) {
      throw new Error('TurnOrchestrator: 既に別のセッションが実行中です（単一セッション想定）');
    }

    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`TurnOrchestrator: セッション "${sessionId}" が見つかりません`);
    }

    this.running = true;
    this.stopRequested = false;
    const manager = this.buildConversationManager(session.participantIds);
    const unsubscribe = this.subscribePersistence(sessionId);

    // T40: runSession中の例外（LLM/Embedding呼び出しのタイムアウト等）を、requestStop()による
    // 意図的な打ち切りや正常完了と区別してステータスに反映する。区別しないと、例外発生時にも
    // finallyが無条件に'completed'（正常完了）を記録してしまい、失敗が握りつぶされていた。
    let reason: SessionEndReason = 'completed';
    let errorMessage: string | undefined;
    try {
      const sessionState = {
        sessionId,
        participantIds: session.participantIds,
        topicTree: new TopicTree(),
        conversationStateManager: new ConversationStateManager(new RhythmTracker()),
        turnNo: 0,
        recentUtterances: [],
        initialTopic: session.initialTopic,
      };

      for await (const _turn of manager.runSession(sessionState, maxTurns)) {
        // 永続化・WebSocket配信はEngineEventBus購読側（subscribePersistence, gateway.ts）が行う。
        void _turn;
        // POST /stop によるrequestStop()を、次のターンに進む前にここでチェックする
        // （for-await-ofをbreakするとasync generatorのreturn()が呼ばれ安全に打ち切れる）。
        if (this.stopRequested) break;
      }
      reason = this.stopRequested ? 'stopped' : 'completed';
    } catch (err) {
      reason = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      unsubscribe();
      this.running = false;
      this.sessionRepository.updateStatus(sessionId, reason);
      // T41: セッション全体の終了（正常完了/打ち切り/エラー）をUIに伝えるため、
      // ターン単位のレイヤーイベントとは別にsession:endをemitする（gateway.tsが配信する）。
      this.eventBus.emit('session:end', { reason, error: errorMessage });
    }
  }

  // POST /api/sessions/:id/stop から呼ばれる。実行中のrunSessionループを次のターン境界で
  // 安全に打ち切る（即座に中断はしない。ターンの途中で状態を壊さないため）。
  requestStop(): void {
    this.stopRequested = true;
  }

  private buildConversationManager(participantIds: string[]): ConversationManager {
    const characterDefs = this.characterCacheRepository.findByIds(participantIds);
    if (characterDefs.length !== participantIds.length) {
      throw new Error('TurnOrchestrator: participantIdsに対応するキャラクターが不足しています');
    }
    const characterDefMap = new Map(characterDefs.map((def) => [def.id, def]));

    const { graph, addressBook } = buildRelationshipGraphFromCharacterDefs(characterDefs);
    const relationshipManager = new RelationshipManager(graph, addressBook);

    const characterBrains = new Map(
      characterDefs.map((def) => [
        def.id,
        new CharacterBrain(
          {
            id: def.id,
            personality: def.personality,
            emotion: { label: 'calm', intensity: 0 },
            energy: 0.5,
            curiosity: 0.5,
            currentGoal: '仲良くなる',
            conversationIntent: '',
            speakingStyle: {
              honorificLevel: 0,
              jokeTolerance: 0.5,
              distance: 0.5,
              addressTerm: '',
            },
          },
          new EmotionUpdater(),
          new GoalUpdater(),
          new IntentUpdater(),
          new SpeakingStyleResolver(),
        ),
      ]),
    );

    const catalog = new DialogueActCatalog();
    const dialoguePlanner = new DialoguePlanner(
      catalog,
      new ScoreCalculator(catalog),
      new SoftmaxSelector(),
      new SpeechExpectationCalculator(),
    );

    const memoryRetriever = new MemoryRetriever(this.memoryRepository, this.embeddingService);
    const promptBuilder = new PromptBuilder(new PromptTemplateLoader(resolveEnginePromptsPath()));

    return new ConversationManager(
      new TopicClassifier(this.embeddingService),
      new TopicParameterUpdater(),
      new TopicContinuationScorer(),
      relationshipManager,
      characterBrains,
      dialoguePlanner,
      memoryRetriever,
      promptBuilder,
      this.llmClient,
      new OutputParser(),
      characterDefMap,
      new SpeakerSelector(relationshipManager),
      new EndConditionEvaluator(),
      new TopicBranchMerger(),
      new RelationshipUpdater(),
      this.eventBus,
      new AddresseeSelector(relationshipManager),
    );
  }

  /**
   * turn:start, layer:*, turn:completeを購読し、turns/turn_layer_eventsへ永続化する。
   * 返り値の関数を呼ぶと全リスナーを解除する。
   *
   * `turn_layer_events`は`turns(session_id, turn_no)`への外部キー制約を持つため、
   * `turns`行がまだ存在しないターン進行中（layer:*イベントの時点）には書き込めない。
   * そのためレイヤーイベントはターン内でメモリ上にバッファリングし、`turn:complete`で
   * `turns`行を作成した直後にまとめて書き込む。`topics`行（`turns.topic_id`のFK先）も
   * 同様の理由で`layer:topic`受信時に`TopicRepository`経由で先行して書き込む
   * （`topics`自体は`turns`に依存しないためこちらは即時書き込みでよい）。
   */
  private subscribePersistence(sessionId: string): () => void {
    let currentTurnNo = 0;
    let pendingLayerEvents: { layer: LayerName; payload: unknown }[] = [];

    const onTurnStart = (payload: unknown) => {
      currentTurnNo = (payload as { turnNo: number }).turnNo;
      pendingLayerEvents = [];
    };
    this.eventBus.on('turn:start', onTurnStart);

    const layerHandlers = PERSISTED_LAYERS.map((layer) => {
      const eventName = `layer:${layer}` as LayerEventName;
      const handler = (payload: unknown) => {
        if (layer === 'topic') {
          const { topic } = payload as { topic: Topic };
          this.topicRepository.upsert(sessionId, topic, currentTurnNo);
        }
        pendingLayerEvents.push({ layer, payload });
      };
      this.eventBus.on(eventName, handler);
      return { eventName, handler };
    });

    const onTurnComplete = (payload: unknown) => {
      this.turnRepository.createTurn(payload as TurnResult);
      for (const { layer, payload: eventPayload } of pendingLayerEvents) {
        this.turnRepository.createLayerEvent(sessionId, currentTurnNo, layer, eventPayload);
      }
      pendingLayerEvents = [];
    };
    this.eventBus.on('turn:complete', onTurnComplete);

    return () => {
      this.eventBus.off('turn:start', onTurnStart);
      for (const { eventName, handler } of layerHandlers) {
        this.eventBus.off(eventName, handler);
      }
      this.eventBus.off('turn:complete', onTurnComplete);
    };
  }
}
