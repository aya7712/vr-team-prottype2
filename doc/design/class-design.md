# AI会話エンジン クラス設計・フォルダー構成（プロトタイプ版）

対象参照: `requirements.md`, `features.md`, `architecture.md`, `data-design.md`

## 1. 設計方針

- `architecture.md` 5章の「Engineはステートレスな純粋ロジック＋明示的なStateオブジェクト」という方針に従い、**Engine層のクラスはSQLite/WebSocket/HTTPを直接知らない**。永続化・配信は`server`層が担当する。
- 各クラスは `features.md` のF1〜F8の単位にほぼ1:1対応させ、「どの機能を実装したコードか」がすぐ分かるようにする。
- テストしやすさを優先し、外部I/O（Together AI呼び出し、SQLite）は必ずインターフェース越しに呼び出し、テスト時にモック差し替えできるようにする。

## 2. パッケージ構成（再掲・詳細化）

`architecture.md` 4章のディレクトリ構成を前提に、各ファイルへのクラス/関数の割り当てを以下に詳細化する。

```text
packages/
├── engine/
│   src/
│   ├── types/                    # 全レイヤー共通の型定義（後述 3章）
│   ├── character/                 # F1
│   ├── relationship/              # F2
│   ├── memory/                    # F3
│   ├── topic/                     # F4
│   ├── dialoguePlanner/           # F5
│   ├── conversationManager/       # F6
│   ├── llm/                       # F7
│   ├── data/                      # character_def取り込み（data-design.md 4章）
│   ├── logging/                   # F8（EventBus定義。永続化はserver層）
│   └── index.ts                   # Engineのpublic API（server層から呼ぶ入口）
│   prompts/                       # F7.1a プロンプトテンプレート
├── server/
│   src/
│   ├── routes/                    # REST
│   ├── ws/                        # WebSocket Gateway
│   ├── db/                        # SQLiteスキーマ・Repository実装
│   ├── services/                  # SessionService, TurnOrchestrator
│   └── index.ts                   # Expressエントリポイント
└── ui/
    src/
    ├── views/                     # F9.1〜F9.4 各画面
    ├── components/                # 共通UIパーツ
    ├── state/                     # WebSocketイベント購読・store
    └── api/                       # REST/WSクライアント
```

## 3. 共通型定義（`packages/engine/src/types/`）

```text
types/
├── character.ts       # CharacterState, Personality, Emotion, Goal, Intent
├── relationship.ts     # RelationshipEdge, RelationshipStoryEvent
├── memory.ts            # MemoryItem, MemorySource ('preset'|'session')
├── topic.ts              # Topic, ConversationState
├── dialogueAct.ts         # DialogueAct（列挙）, DialogueActScore, SpeechExpectation
├── turn.ts                 # TurnInput, TurnResult, TargetCharacterIds
└── events.ts                # LayerEvent（F8.3で流すイベントのペイロード型）
```

```typescript
// character.ts
export interface CharacterState {
  id: string;
  personality: string;
  emotion: { label: string; intensity: number };
  energy: number;
  curiosity: number;
  currentGoal: string;
  conversationIntent: string;
  speakingStyle: SpeakingStyleModifier;
}

export interface SpeakingStyleModifier {
  honorificLevel: number;   // 敬語レベル
  jokeTolerance: number;    // 冗談の許容度
  distance: number;         // 距離感
  addressTerm: string;      // 呼び方
}

// relationship.ts
export interface RelationshipEdge {
  characterId: string;
  targetCharacterId: string;
  type: string;             // 幼馴染 / 同僚 等
  trust: number;
  intimacy: number;
  respect: number;
  story: RelationshipStoryEvent[];
}

export interface RelationshipStoryEvent {
  turnNo?: number;          // セッション中に発生した場合
  summary: string;
  source: 'preset' | 'session';
}

// memory.ts
export interface MemoryItem {
  id: string;
  source: 'preset' | 'session';
  owner: string;
  participants: string[];
  occurredAt?: string | null;   // data-design.md 4.3 (D3)。日付未特定ならnull
  occurredEra?: string | null;   // 'YYYY-MM-DD'化できない曖昧な時期
  location?: string | null;
  summary: string;
  tags: string[];
  importance: number;
  emotion?: string | null;
  shareable: boolean;
  related?: string[] | null;     // 関連記憶のid（data-design.md 4.3）
  body?: string;
}

// topic.ts
export interface Topic {
  id: string;
  parentTopicId?: string;
  label: string;
  depth: number;
  energy: number;
  novelty: number;
  life: number;
  emotionality?: number;
  unresolved: boolean;
  lastMentionTurn?: number;
}

export interface ConversationState {
  currentTopicId: string;
  atmosphere: number;
  silenceRisk: number;
  excitement: number;
  elapsedTurns: number;
  unresolvedQuestions: string[];
  rhythm: DialogueAct[];   // 直近数ターンのAct履歴
}

// dialogueAct.ts
export type DialogueAct =
  | 'question' | 'answer' | 'empathy' | 'deny' | 'joke'
  | 'tsukkomi' | 'story' | 'deepDive' | 'topicShift' | 'fillSilence';

export interface DialogueActScore {
  act: DialogueAct;
  baseWeight: number;
  modifiers: Record<string, number>;  // personality, relationship, topic, emotion, context
  score: number;
  probability: number;
}

export interface SpeechExpectation {
  expectedActs: { act: DialogueAct; weight: number }[];
  targetCharacterIds?: string[];
}
```

## 4. F1: Character Brain（`packages/engine/src/character/`）

```text
character/
├── CharacterBrain.ts       # 本体クラス
├── EmotionUpdater.ts
├── GoalUpdater.ts
├── IntentUpdater.ts
└── SpeakingStyleResolver.ts
```

```typescript
export class CharacterBrain {
  constructor(
    private state: CharacterState,
    private emotionUpdater: EmotionUpdater,
    private goalUpdater: GoalUpdater,
    private intentUpdater: IntentUpdater,
    private speakingStyleResolver: SpeakingStyleResolver,
  ) {}

  // 会話 → 感情更新 → Goal更新 → Intent更新 の順で状態を進める（features.md F1.2）
  updateAfterTurn(context: TurnUpdateContext): CharacterState;

  // Relationship Engineの結果を受けてSpeaking Style Modifierを反映（F1.3）
  applyRelationshipContext(relCtx: RelationshipContext): void;

  getState(): CharacterState;
}
```

- `EmotionUpdater` / `GoalUpdater` / `IntentUpdater` はそれぞれ独立したルールベース計算クラスとし、単体テストしやすくする。
- `SpeakingStyleResolver` はF2（Relationship Manager）の出力を受け取って`speakingStyle`を更新するだけの薄いクラス（F2側にロジックの主体を置き、ここでは適用のみ行う）。

## 5. F2: Relationship Engine（`packages/engine/src/relationship/`）

```text
relationship/
├── RelationshipGraph.ts        # ノード・エッジの保持（4体=最大6エッジ、無向）
├── RelationshipGraphFactory.ts  # design/mainのrelationshipsからグラフ+AddressBookを構築
├── RelationshipManager.ts        # 相手判定→呼び方等の解決 (F2.2)
├── RelationshipUpdater.ts         # 会話結果によるtrust/intimacy更新、Story追加 (F2.4)
├── config.ts                       # trust/intimacy/respectの初期値・デフォルトtype
└── types.ts                         # RelationshipContext, AddressBookEntry 等
```

```typescript
export class RelationshipGraph {
  private edges: Map<string, RelationshipEdge>; // key: 2つのcharacterIdを辞書順に並べたペアキー（無向）

  addEdge(edge: RelationshipEdge): void;
  hasEdge(a: string, b: string): boolean;
  getEdge(a: string, b: string): RelationshipEdge; // 未登録ペアはデフォルト値で遅延生成
  updateEdge(a: string, b: string, patch: Partial<RelationshipEdge>): void;
  getSubgroupCohesion(characterIds: string[]): number; // F2.1 グループ凝集度
}

// design/main/*.yamlのrelationships（T04のCharacterDefLoader出力）からグラフを構築する。
export function buildRelationshipGraphFromCharacterDefs(
  characters: CharacterDefRecord[],
): { graph: RelationshipGraph; addressBook: AddressBookEntry[] };

export interface RelationshipContext {
  edge: RelationshipEdge;
  addressTerm: string;
  honorificLevel: number;
  jokeTolerance: number;
  distance: number;
}

// design/main/*.yamlのrelationshipsは話者ごとに異なる呼称（address）を持つ方向性データ
// だが、RelationshipEdge（trust/intimacy/respect）はペア単位で対称（無向）に持つため、
// 呼称だけは別にAddressBookとして方向性ありのまま保持する。
export interface AddressBookEntry {
  characterId: string;
  targetCharacterId: string;
  addressTerm: string;
}

export class RelationshipManager {
  // T06時点ではMemoryRetriever（F3）が未実装（T07）のため依存に含めない。
  // resolve()が返すRelationshipContextはメモリを含まず、共有記憶検索はConversationManager
  // （T12）がMemoryRetrieverを別途呼び出す想定。
  constructor(private graph: RelationshipGraph, private addressBook: AddressBookEntry[]) {}

  // 話者→相手の関係コンテキストを解決する (F2.2)
  resolve(speakerId: string, targetId: string): RelationshipContext;
}

export class RelationshipUpdater {
  // ターン結果（DialogueAct, 感情変化等）を受けてtrust/intimacyを更新し、
  // 該当すればRelationshipStoryへ新しい出来事を追記する (F2.4)
  applyTurnResult(graph: RelationshipGraph, result: TurnResult): void;
}
```

## 6. F3: Memory（`packages/engine/src/memory/`）

```text
memory/
├── MemoryRepository.ts            # インターフェース（server層のSQLite実装に注入される）
├── InMemoryMemoryRepository.ts      # SQLiteなしで動作確認するためのテスト用フェイク（T07）
├── MemoryRetriever.ts                # F3.4：T07時点ではキーワードマッチのみ。意味検索はT15で追加
├── EmbeddingService.ts                 # Together AI Embeddings APIラッパー（T10/T15で追加）
└── types.ts                              # MemoryQuery, MemoryFilter 等
```

```typescript
// server層で実装され、engineへ注入されるインターフェース（依存性逆転）
export interface MemoryRepository {
  searchByKeyword(query: string, limit: number): Promise<MemoryItem[]>;
  getEmbedding(memoryId: string): Promise<Float32Array | null>;
  getAllCandidates(filter: MemoryFilter): Promise<MemoryItem[]>;
  recordRecall(sessionId: string, turnNo: number, memoryId: string, source: 'preset' | 'session'): Promise<void>;
  getRecentRecalls(sessionId: string, withinTurns: number): Promise<string[]>; // memoryId一覧
}

export interface MemoryFilter {
  participants?: string[];
  ownerId?: string;
  shareableOnly?: boolean;
}

export class MemoryRetriever {
  // T07時点ではEmbeddingService（F7、T10/T15で実装予定）が未実装のため依存に含めない。
  // data-design.md 6.2の①FTS5候補抽出・②意味的再ランキングはT15で追加し、
  // その時点でconstructorにembeddingServiceを追加する。
  constructor(private repo: MemoryRepository) {}

  // Topic/DialoguePlannerからのクエリを受け、F3.4の①〜④の手順で記憶を検索する
  // （T07時点は③フィルタリング・④上位選出のみ。①②はT15で追加）
  async retrieve(query: MemoryQuery): Promise<MemoryItem[]>;
}

export interface MemoryQuery {
  sessionId: string;
  turnNo: number;
  speakerId: string;
  targetIds: string[];
  topicKeywords: string[];
  dialogueAct: DialogueAct;
}
```

## 7. F4: Topic Analyzer / ConversationState（`packages/engine/src/topic/`）

```text
topic/
├── TopicTree.ts              # Topicのツリー構造保持
├── TopicClassifier.ts         # 新規発話 → 既存/子/新規Topic判定 (F4.2)
├── TopicParameterUpdater.ts    # energy/novelty/life更新 (F4.3)
├── TopicContinuationScorer.ts   # 話題継続価値の算出 (F4.4)
├── ConversationStateManager.ts   # ConversationState全体の保持・更新 (F4.5)
└── RhythmTracker.ts               # 直近Act系列の監視・補正 (F4.6)
```

```typescript
export class TopicClassifier {
  constructor(private embeddingService: EmbeddingService, private relationshipManager: RelationshipManager) {}

  // 意味的類似度＋関係性記憶を加味した3段階判定 (F4.2)
  classify(utterance: string, tree: TopicTree, speakerId: string, targetId: string): TopicClassificationResult;
}

export class TopicParameterUpdater {
  // 質問された/笑った/新情報/共感/同じ話/否定された/長く続いた 等のイベントから
  // energy/novelty/life を更新する (F4.3)
  applyEvent(topic: Topic, event: TopicEvent): Topic;
}

export class TopicContinuationScorer {
  // depth/energy/novelty/emotionality/unresolvedから継続価値を算出 (F4.4)
  score(topic: Topic): number;
}

export class ConversationStateManager {
  constructor(private rhythmTracker: RhythmTracker) {}
  getState(): ConversationState;
  updateAfterTurn(act: DialogueAct, topicScore: number): ConversationState;
}
```

## 8. F5: Dialogue Planner（`packages/engine/src/dialoguePlanner/`）

```text
dialoguePlanner/
├── DialogueActCatalog.ts        # 発話行為カタログと基本重み設定の読み込み
├── ScoreCalculator.ts             # Score(act) = Base × 各Modifier (F5.3)
├── ModifierResolvers/
│   ├── PersonalityModifier.ts
│   ├── RelationshipModifier.ts
│   ├── TopicModifier.ts
│   ├── EmotionModifier.ts
│   └── ContextModifier.ts          # 直前発話との相性 (F5.2連携)
├── SoftmaxSelector.ts               # 確率分布化＋サンプリング (F5.4)
├── SpeechExpectationCalculator.ts    # 会話期待値算出 (F5.2)
└── DialoguePlanner.ts                 # 上記を束ねるファサード
```

```typescript
export class DialoguePlanner {
  constructor(
    private catalog: DialogueActCatalog,
    private scoreCalculator: ScoreCalculator,
    private selector: SoftmaxSelector,
    private expectationCalculator: SpeechExpectationCalculator,
  ) {}

  planNext(context: PlanningContext): { act: DialogueAct; scores: DialogueActScore[]; expectation: SpeechExpectation };
}

export interface PlanningContext {
  speaker: CharacterState;
  relationship: RelationshipContext;
  topic: Topic;
  conversationState: ConversationState;
  previousAct?: DialogueAct;
}
```

- `ModifierResolvers/*` は各1関数のみを持つ小さなクラス（またはstrategy関数）とし、`Modifier係数を外部設定として調整可能`（要件5章 チューニング性）にするため、係数テーブル自体はJSON/TS設定ファイル（`dialoguePlanner/config/modifierWeights.ts` 等）に外出しする。

## 9. F6: Conversation Manager（`packages/engine/src/conversationManager/`）

```text
conversationManager/
├── ConversationManager.ts     # 全体オーケストレーション（1ターンの実行フロー）
├── SpeakerSelector.ts           # F6.2（3人以上）
├── TopicBranchMerger.ts          # F6.3（3人以上、話題の分岐・合流）
├── TurnScheduler.ts               # F6.4 発話順・テンポ
└── EndConditionEvaluator.ts        # F6.5 会話終了判定
```

```typescript
export class ConversationManager {
  constructor(
    private topicClassifier: TopicClassifier,
    private topicUpdater: TopicParameterUpdater,
    private continuationScorer: TopicContinuationScorer,
    private relationshipManager: RelationshipManager,
    private characterBrains: Map<string, CharacterBrain>,
    private dialoguePlanner: DialoguePlanner,
    private memoryRetriever: MemoryRetriever,
    private promptBuilder: PromptBuilder,
    private llmClient: TogetherClient,
    private speakerSelector: SpeakerSelector,     // 2人会話では常に相手を返す実装でよい
    private endConditionEvaluator: EndConditionEvaluator,
    private eventBus: EngineEventBus,             // F8.3
  ) {}

  // architecture.md 6章のシーケンスをそのまま実装するエントリポイント
  async runTurn(sessionState: SessionState): Promise<TurnResult>;

  // シナリオ設定を受けた終了判定込みの複数ターン実行（server層のPOST /run から呼ばれる）
  async runSession(sessionState: SessionState, maxTurns: number): AsyncGenerator<TurnResult>;
}
```

`ConversationManager.runTurn`が`architecture.md`6章のデータフロー図をそのまま実装したものになる。各ステップの完了ごとに`eventBus.emit(layerEvent)`を呼び、server層のWebSocket Gatewayがこれを購読してUIへ配信する（EngineはWebSocketの存在を知らない）。

## 10. F7: LLM連携（`packages/engine/src/llm/`）

```text
llm/
├── TogetherClient.ts        # chat completions呼び出し (F7.2)
├── EmbeddingClient.ts         # embeddings呼び出し（memory/EmbeddingServiceが利用）
├── PromptTemplateLoader.ts     # prompts/**/*.md の読み込み＋mtimeキャッシュ (F7.1a)
├── PromptBuilder.ts             # テンプレート＋変数からプロンプト全文を構築 (F7.1)
└── OutputParser.ts               # セリフ本文抽出・簡易整合性チェック (F7.3)
```

```typescript
export interface LlmClient {
  complete(prompt: string, options?: { temperature?: number }): Promise<string>;
}

export class TogetherClient implements LlmClient {
  constructor(private apiKey: string, private model: string = 'google/gemma-3n-E4B-it') {}
  async complete(prompt: string, options?): Promise<string>;
}

export class PromptBuilder {
  constructor(private templateLoader: PromptTemplateLoader) {}

  build(templateName: string, vars: Record<string, string>): string;
}
```

## 11. F8: ログ・イベント（`packages/engine/src/logging/`）

```text
logging/
└── EngineEventBus.ts   # Node.js EventEmitterの薄いラッパー。層名をtypedにする
```

```typescript
export type LayerEventName =
  | 'turn:start' | 'layer:topic' | 'layer:relationship'
  | 'layer:character' | 'layer:dialoguePlanner' | 'layer:memory'
  | 'layer:llm' | 'turn:complete';

export class EngineEventBus {
  on(event: LayerEventName, handler: (payload: unknown) => void): void;
  emit(event: LayerEventName, payload: unknown): void;
}
```

永続化（`turns`, `turn_layer_events`テーブルへの書き込み）は**server層**の`TurnOrchestrator`がこの`EngineEventBus`を購読して行う。Engine自体はSQLiteに依存しない。

## 12. `packages/engine/src/data/`（character_def取り込み、data-design.md 4章対応）

```text
data/
├── CharacterDefLoader.ts     # design/main, design/sub, memory/**/*.md を起動時に読み込む
├── YamlCharacterParser.ts
├── MarkdownMemoryParser.ts     # YAML frontmatter + 本文パース
└── types.ts
```

```typescript
export class CharacterDefLoader {
  constructor(private basePath: string) {} // 環境変数 CHARACTER_DEF_PATH

  async loadAll(): Promise<{
    characters: CharacterDefRecord[];
    subCharacters: SubCharacterRecord[];
    memoryPresets: MemoryItem[];
  }>;
}
```

読み込んだ結果は`server`層の`db`が`characters_cache` / `memory_preset_cache`テーブルへ書き込む（Loader自体はファイルパースのみを担当し、DBを知らない）。

## 13. `packages/server/` の構成

```text
server/
├── src/
│   ├── routes/
│   │   ├── sessions.ts        # POST/GET /api/sessions, /run, /stop
│   │   ├── turns.ts             # GET turns一覧・詳細, POST feedback
│   ├── ws/
│   │   └── gateway.ts           # EngineEventBus購読 → WebSocket broadcast
│   ├── services/
│   │   ├── SessionService.ts     # セッション作成・キャラクター初期化（CharacterDefLoader呼び出し）
│   │   └── TurnOrchestrator.ts    # ConversationManager.runSession呼び出し＋各イベントの永続化
│   ├── db/
│   │   ├── schema.sql             # data-design.md 5章のCREATE TABLE群
│   │   ├── migrate.ts
│   │   └── repositories/
│   │       ├── CharacterCacheRepository.ts
│   │       ├── MemoryRepositoryImpl.ts     # engine.memory.MemoryRepository の実装
│   │       ├── SessionRepository.ts
│   │       ├── TurnRepository.ts
│   │       └── FeedbackRepository.ts
│   └── index.ts
```

- `MemoryRepositoryImpl`が`packages/engine/src/memory/MemoryRepository`インターフェースを実装し、`SessionService`組み立て時にEngineへ注入する（Engine→Server方向の依存を作らない）。
- `TurnOrchestrator`は`ConversationManager`のasync generatorを1ターンずつ受け取り、`TurnRepository`/`FeedbackRepository`へ書き込みつつ、`ws/gateway.ts`経由でUIへブロードキャストする。

## 14. `packages/ui/` の構成

```text
ui/
├── src/
│   ├── views/
│   │   ├── ConversationView/    # F9.1
│   │   ├── ParameterDashboard/   # F9.2
│   │   ├── LayerInspector/        # F9.3
│   │   └── LogBrowser/             # F9.4（検索なし、一覧＋詳細のみ）
│   ├── components/
│   │   ├── ChatBubble.tsx
│   │   ├── TopicTreeGraph.tsx
│   │   ├── RelationshipMatrix.tsx
│   │   ├── ScoreBreakdownTable.tsx  # DialogueActスコア内訳表示
│   │   └── PromptViewer.tsx          # LLM送信プロンプト全文表示
│   ├── state/
│   │   └── useEngineEvents.ts        # WebSocket購読フック
│   └── api/
│       └── client.ts                   # REST呼び出し
```

## 15. クラス間依存関係図（概観）

```text
                        ConversationManager (F6)
                                  │
     ┌───────────┬────────────┬──┴───────┬─────────────┬─────────────┐
     ▼           ▼            ▼          ▼             ▼             ▼
TopicClassifier RelationshipManager CharacterBrain DialoguePlanner MemoryRetriever PromptBuilder→TogetherClient
     │                 │                                   │              │
     ▼                 ▼                                   ▼              ▼
TopicTree     RelationshipGraph                    ScoreCalculator   MemoryRepository(interface)
                                                                            ▲
                                                                            │ 実装を注入
                                                                MemoryRepositoryImpl (server/db)
```

依存の向きは常に「Engine内のドメインロジック → インターフェース」であり、SQLite/WebSocket等の実装詳細は`server`層のみが知る。これにより`packages/engine`単体でユニットテストが完結する。

## 16. 未決事項

- `ConversationManager`のコンストラクタ引数が多いため、実装時にDIコンテナ（`tsyringe`等）を使うか、シンプルなファクトリ関数（`createConversationManager(deps)`）で済ませるかは実装着手時に決定する。プロトタイプの単純さを優先するなら後者を推奨。
- `SpeakerSelector`は2人会話フェーズでは「常に相手を返すだけ」の最小実装にとどめ、3〜4人フェーズ（F6.2本実装）で拡張する。
- Modifier係数の設定ファイル形式（TS定数 / JSON / YAML）は未確定。プロンプトテンプレート同様に非エンジニアが編集する可能性があるならYAML/JSONを推奨。
