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
  sourcePath?: string;            // 由来ファイルパス。'preset'のみ設定（T15、memory_preset_cache.raw_md_path用）
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
  // resolve()が返すRelationshipContextはメモリを含まず、共有記憶検索はConversationManager
  // （T12）がMemoryRetrieverを別途呼び出す想定のため、MemoryRetriever（F3）を依存に含めない。
  // features.md F4.2が挙げる「関連度をRelationshipManager側の判定に反映する」構想はT38（2026-08-19）
  // で見送りとした（プロトタイプ規模ではパイプライン順序の組み替えコストに見合わないため）。
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
├── MemoryRetriever.ts                # F3.4：キーワードマッチ（T07）＋意味検索（T15）のハイブリッド
├── EmbeddingService.ts                 # Together AI Embeddings APIラッパー（T15）
├── cosineSimilarity.ts                  # コサイン類似度計算（T15）
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
  // embeddingServiceはoptional。未注入時はT07同様キーワードのみのランキングになる
  // （後方互換）。data-design.md 6.2①のFTS5候補抽出は`repo.getAllCandidates`の
  // 全件走査で代替した（プロトタイプ規模のデータ量では①を省略してよいという
  // data-design.md 6.2の記載を採用）。
  constructor(private repo: MemoryRepository, private embeddingService?: EmbeddingService) {}

  // Topic/DialoguePlannerからのクエリを受け、F3.4の①〜④の手順で記憶を検索する
  // （③フィルタリング・④上位選出はT07、②意味的再ランキングはT15で追加）
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

T15時点では`packages/server/src/services/TurnOrchestrator.ts`の`MemoryRetriever`生成箇所に`embeddingService`が渡されておらず、意味検索が本番の会話生成フローで実行されない配線漏れがあった。T37でT36と同様に`TurnOrchestrator`のコンストラクタから`embeddingService`を配線し、実運用でも意味的再ランキングが働くようにした。

## 7. F4: Topic Analyzer / ConversationState（`packages/engine/src/topic/`）

```text
topic/
├── TopicTree.ts              # Topicのツリー構造保持
├── TopicClassifier.ts         # 新規発話 → 既存/子/新規Topic判定 (F4.2)
├── TopicParameterUpdater.ts    # energy/novelty/life更新 (F4.3)
├── TopicContinuationScorer.ts   # 話題継続価値の算出 (F4.4)
├── ConversationStateManager.ts   # ConversationState全体の保持・更新 (F4.5)
├── RhythmTracker.ts               # 直近Act系列の監視・補正 (F4.6)
└── types.ts                        # TopicEvent, TopicClassificationResult 等
```

```typescript
export class TopicClassifier {
  // T36（2026-08-14）: T15で実装済みのEmbeddingService（F7、Together AI Embeddings API）を
  // 注入可能にし、注入時はutteranceと既存Topic.labelの埋め込みベクトルのコサイン類似度で
  // same/child/new判定を行う。未注入時は文字bigramのJaccard係数（doc/todo.md T08時点の
  // 暫定実装）にフォールバックする（テスト等、意味的類似度が不要な場面向け）。
  // RelationshipManager（T06実装済み）は依存に含めていない。features.md F4.2が挙げる
  // 「関係性記憶・共有記憶との関連度も判定材料に含める」構想はT38（2026-08-19）で見送りとした
  // （ConversationManagerのTopic判定は前ターンの発話を使う一手遅れ設計のため、今回の発話に
  // 対する記憶検索結果はTopic判定時点でまだ存在せず、反映にはパイプライン順序の組み替えが必要。
  // プロトタイプ規模ではそのコストに見合わないと判断）。
  constructor(embeddingService?: EmbeddingService) {}

  // 意味的類似度による3段階判定 (F4.2)。関係性記憶を加味する構想はT38で見送り済み。
  // embeddingServiceを使った類似度計算は非同期I/Oのためasyncメソッドとする。
  async classify(utterance: string, tree: TopicTree, speakerId: string, targetId: string): Promise<TopicClassificationResult>;
}
```

`Topic.label`は発話全文ではなく、発話の最初の一文（句読点まで、最大20文字）に短縮したものを保持する（T36）。既存Topic全件についてembeddingServiceを呼び出す設計だが、`MemoryRetriever`（F3.4、T15）と同様にプロトタイプ規模のデータ量では全件走査で十分と判断し、キャッシュは設けていない。

```typescript
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
- T09時点ではJSON形式（`dialoguePlanner/config/baseWeights.json`, `modifierWeights.json`）に決定した。`import x from './y.json'`はビルド後のNode ESM実行時にimport assertionを要求し環境依存の落とし穴になるため、`config/loadConfig.ts`が`readFileSync` + `JSON.parse`で読み込む。JSONファイルは`tsc`ではコピーされないため、`packages/engine`の`build`スクリプトで`dist/dialoguePlanner/config/`へ明示的にコピーしている。

  各Modifierの具体的な係数・対象Actの組み合わせはfeatures.md/class-design.mdに数値仕様が無いため、実装者判断で設定した（`PersonalityModifier`はCharacterState.energy/curiosityを性格傾向の代理指標として使用、`ContextModifier`と`SpeechExpectationCalculator`は同じ`context.expectationTable`を共有）。

## 9. F6: Conversation Manager（`packages/engine/src/conversationManager/`）

```text
conversationManager/
├── ConversationManager.ts     # 全体オーケストレーション（1ターンの実行フロー）
├── SpeakerSelector.ts           # F6.2（T12時点は「常に相手を返す」最小実装。3〜4体対応はT29）
├── EndConditionEvaluator.ts      # F6.5 会話終了判定（T12時点はmaxTurns到達のみ判定）
├── TopicBranchMerger.ts            # F6.3（3人以上、話題の分岐・合流、T30で追加）
├── TurnScheduler.ts                 # F6.4 発話順・テンポ（3〜4体向け、必要になったら追加）
└── types.ts                          # SessionState等（T12でconversationManagerドメイン内に新規定義）
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
    private llmClient: LlmClient,
    private outputParser: OutputParser,                      // T12で追加。F7.3のセリフ本文抽出に必要
    private characterDefs: Map<string, CharacterDefRecord>,  // T12で追加。T04出力。プロンプト構築に
                                                               // 必要なname/personality/toneSample等の
                                                               // 静的情報はCharacterState（F1）に無いため
    private speakerSelector: SpeakerSelector,     // 2人会話では常に相手を返す実装でよい
    private endConditionEvaluator: EndConditionEvaluator,
    private eventBus?: EngineEventBus,             // F8.3。T13で本実装。テスト時は省略可
    private toneReviewer?: ToneReviewer,           // Issue #5対応・T43。10.2章参照。既定値あり省略可
  ) {}

  // architecture.md 6章のシーケンスをそのまま実装するエントリポイント
  async runTurn(sessionState: SessionState): Promise<TurnResult>;

  // シナリオ設定を受けた終了判定込みの複数ターン実行（server層のPOST /run から呼ばれる）
  async runSession(sessionState: SessionState, maxTurns: number): AsyncGenerator<TurnResult>;
}

// class-design.mdに定義が無かったためconversationManager/types.tsに新規定義（T12）。
// ターンをまたいでミュータブルに更新される（短期記憶はdata-design.md 6.4のオンメモリ配列に対応）。
export interface SessionState {
  sessionId: string;
  participantIds: string[];
  topicTree: TopicTree;
  conversationStateManager: ConversationStateManager;
  turnNo: number;
  previousAct?: DialogueAct;
  previousSpeakerId?: string;
  recentUtterances: { speakerId: string; utterance: string; turnNo: number }[];
  initialTopic: string;  // T35で追加。1発話目のTopic分類はこの文字列を起点に行う
                          // （「(会話開始)」プレースホルダーへの依存を廃止）
}
```

`ConversationManager.runTurn`が`architecture.md`6章のデータフロー図をそのまま実装したものになる。各ステップの完了ごとに`eventBus.emit(layerEvent)`を呼び、server層のWebSocket Gatewayがこれを購読してUIへ配信する（EngineはWebSocketの存在を知らない）。T12時点では`EngineEventBus`本体をT13を待たず先行実装し（`logging/EngineEventBus.ts`）、`eventBus`は未注入でも動作するようoptionalにしている（ユニットテストでeventBusを省略できるようにするため）。

## 10. F7: LLM連携（`packages/engine/src/llm/`）

```text
llm/
├── LlmClient.ts               # complete()のみを持つインターフェース
├── TogetherClient.ts            # chat completions呼び出し (F7.2)
├── EmbeddingClient.ts             # embeddings呼び出し（memory/EmbeddingServiceが利用、T15で追加）
├── PromptTemplateLoader.ts         # prompts/**/*.md の読み込み＋mtimeキャッシュ (F7.1a)
├── PromptBuilder.ts                  # テンプレート＋変数からプロンプト全文を構築 (F7.1)
└── OutputParser.ts                     # セリフ本文抽出・簡易整合性チェック (F7.3)
```

```typescript
export interface LlmClient {
  complete(prompt: string, options?: { temperature?: number; model?: string }): Promise<string>;
}

export class TogetherClient implements LlmClient {
  constructor(private apiKey: string, private model: string = 'google/gemma-3n-E4B-it') {}
  // options.modelが指定されればコンストラクタのデフォルトmodelより優先される（T19相当）
  async complete(prompt: string, options?): Promise<string>;
}

export class PromptBuilder {
  constructor(private templateLoader: PromptTemplateLoader) {}

  build(templateName: string, vars: Record<string, string>): string;
}
```

`ConversationManager.runTurn`は発話生成時、発話者の`CharacterDefRecord.llm`（`data-design.md`のcharacters_cache由来、`{ provider, model, temperature } | null`）から`model`/`temperature`を取り出し、`llmClient.complete(prompt, { model, temperature })`として渡す。これによりキャラクターごとに異なるLLMモデル・temperatureで発話生成できる。`llm`が`null`（未指定）の場合は`model`/`temperature`とも`undefined`となり、`TogetherClient`側のデフォルト（コンストラクタの`model`、`temperature`は0.8）にフォールバックする。

### 10.1 プロンプトテンプレート一覧（`packages/engine/prompts/`、implementation-rules.md 6章）

| ファイル | 用途 | プレースホルダー |
|---|---|---|
| `utterance/base.md` | セリフ生成の基本テンプレート（F7.1） | `{{characterName}}`, `{{personality}}`, `{{toneSample}}`, `{{firstPerson}}`, `{{emotion}}`, `{{speakingStyle}}`, `{{targetName}}`, `{{addressTerm}}`, `{{dialogueAct}}`, `{{retrievedMemory}}`, `{{recentDialogue}}` |
| `utterance/with_shared_memory.md` | 共有記憶を参照させたい場合に`base.md`の出力へ追加で組み合わせるテンプレート | `{{baseInstruction}}`, `{{targetName}}`, `{{characterName}}`, `{{sharedMemory}}` |
| `utterance/tone_review.md` | 生成済み発話の口調審査・書き換え（F7、Issue #5対応・plan-e、T43。`ToneReviewer`が使用） | `{{characterName}}`, `{{personality}}`, `{{toneSample}}`, `{{firstPerson}}`, `{{otherCharacterName}}`, `{{otherToneSample}}`, `{{otherFirstPerson}}`, `{{utterance}}` |

T10時点では`utterance/base.md`/`utterance/with_shared_memory.md`のみ作成した。`dialogueAct/candidate_selection.md`（F5.5、小型LLMによるAct候補提案の任意機能）はF5.5自体が未実装のため作成していない。`utterance/tone_review.md`はT43で追加した。

### 10.2 ToneReviewer（F7、Issue #5対応・plan-e、T43）

```text
llm/
└── ToneReviewer.ts   # 生成済み発話の口調審査・書き換え（追加のLLM呼び出し1回）
```

```typescript
export interface ToneReviewCharacterProfile {
  name: string;
  personality: string;
  toneSample: string;
  firstPerson: string;
}

export interface ToneReviewInput {
  utterance: string;
  speaker: ToneReviewCharacterProfile;
  previousSpeaker: ToneReviewCharacterProfile | null; // 会話開始直後（1発話目）はnull
}

export interface ToneReviewResult {
  utterance: string; // 逸脱なし/審査失敗時は元のutteranceと同じ値
  applied: boolean;  // 実際に書き換わったか（ログ・目視確認用）
  prompt: string;
  rawOutput: string | null; // 審査呼び出し失敗時はnull
  error?: string;
}

export class ToneReviewer {
  constructor(
    private promptBuilder: PromptBuilder,
    private llmClient: LlmClient,
    private outputParser?: OutputParser,
  ) {}

  async review(input: ToneReviewInput): Promise<ToneReviewResult>;
}
```

Issue #5（「キャラクターの口調が、前に発言した別キャラクターの口調に引っ張られる」）への対応として、`ConversationManager.runTurn`は`llmClient.complete`で発話を生成した直後、`toneReviewer.review()`を1回呼び出す。話者本人のキャラクタープロフィール（`name`/`personality`/`toneSample`/`firstPerson`）と、直前に発言していた他キャラクター（今回のターンで`sessionState`を更新する前の`previousSpeakerId`）の同プロフィールを渡し、「逸脱していれば口調（語尾・一人称・敬語レベル）だけを話者本人のものに書き直し、そうでなければそのまま出力する」ことをプロンプト（`utterance/tone_review.md`）1回のLLM呼び出しで行わせる（判定用・書き換え用で2回呼ばない）。

既存のplan-c（PR #4、`OutputParser`層での文字列一致ヒューリスティックによる逸脱検知＋同一プロンプトでの再生成）とは異なり、判定自体もLLMに委ねる点、および検知時に「診断結果に基づいて口調だけを書き換える」（同一プロンプトでの盲目的な再生成ではない）点が異なる。

`ToneReviewer`は`ConversationManager`のコンストラクタ末尾（`eventBus`の後）にoptional・default付きで追加した（`toneReviewer: ToneReviewer = new ToneReviewer(promptBuilder, llmClient)`）。既存呼び出し元（`TurnOrchestrator`等）は`eventBus`までを常に明示的な実引数として渡しており、途中に挿入すると位置引数がずれるため、既存呼び出し元を変更せずに済むよう末尾に追加した（実装者判断）。

審査呼び出し（プロンプト構築〜`llmClient.complete`）が失敗した場合は、`implementation-rules.md` 5章の「外部APIエラーは複雑なフォールバックを作らず伝播させる」という原則の**例外**として、審査前のutteranceをそのまま採用するフォールバックを`ToneReviewer.review()`内に実装している。理由は、審査は既に成立した発話に対する追加の品質チェックであり、ここで例外を伝播させると、審査前には成功していたターン全体が失敗扱いになってしまうため。

審査結果（`prompt`/`rawOutput`/`applied`/`error`）は、既存の`layer:llm`イベント（`types/events.ts`の`LlmLayerPayload`）に`toneReview`フィールドとしてoptionalで追加し、新規イベント名は増やしていない（1ターン1回の`layer:llm`発行という既存の順序を変えないため）。

## 11. F8: ログ・イベント（`packages/engine/src/logging/`）

```text
logging/
└── EngineEventBus.ts   # Node.js EventEmitterの薄いラッパー。層名をtypedにする
```

```typescript
export type LayerEventName =
  | 'turn:start' | 'layer:topic' | 'layer:relationship'
  | 'layer:character' | 'layer:dialoguePlanner' | 'layer:memory'
  | 'layer:llm' | 'turn:complete' | 'session:end'; // session:endはT41で追加

export class EngineEventBus {
  on(event: LayerEventName, handler: (payload: unknown) => void): void;
  off(event: LayerEventName, handler: (payload: unknown) => void): void; // T18で追加
  emit(event: LayerEventName, payload: unknown): void;
}
```

`ConversationManager`（F6、T12）が構造上`eventBus.emit()`を必要とするため、T13を待たずT12で本実装を前倒しした（`LayerEventName`自体はT03で`types/events.ts`に定義済み）。T13では、ここに発行されるイベント名・payloadが`types/events.ts`の`LayerEvent`判別ユニオンと一致することをユニットテストで確認する。`off()`はT18で、`TurnOrchestrator`がセッション実行のたびに永続化用リスナーを購読・解除するために追加した（`EngineEventBus`はserver全体で共有される単一インスタンスのため、購読しっぱなしにすると複数回の実行で重複登録される）。

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
│   │   ├── CacheSyncService.ts    # 起動時にCharacterDefLoader結果をキャッシュテーブルへ同期（T15）
│   │   ├── SessionService.ts       # セッション作成・キャラクター初期化（CharacterDefLoader呼び出し）
│   │   └── TurnOrchestrator.ts      # ConversationManager.runSession呼び出し＋各イベントの永続化
│   ├── db/
│   │   ├── schema.sql             # data-design.md 5章のCREATE TABLE群
│   │   ├── migrate.ts
│   │   └── repositories/
│   │       ├── CharacterCacheRepository.ts   # characters_cache等への書き込み（T15）+ exists()（T17）
│   │       ├── MemoryRepositoryImpl.ts         # engine.memory.MemoryRepository の実装（T15）
│   │       ├── SessionRepository.ts
│   │       ├── TurnRepository.ts
│   │       └── FeedbackRepository.ts
│   └── index.ts
```

- `MemoryRepositoryImpl`が`packages/engine/src/memory/MemoryRepository`インターフェースを実装し、`SessionService`組み立て時にEngineへ注入する（Engine→Server方向の依存を作らない）。`MemoryRepository`インターフェースに無い`saveEmbedding()`（書き込み専用）も持ち、`CacheSyncService`が記憶プリセットのembedding計算結果を保存するのに使う。
- `TurnOrchestrator`（T18）は`ConversationManager`のasync generatorを1ターンずつ受け取りつつ、`EngineEventBus`を購読して`TurnRepository`（`turns`/`turn_layer_events`）・`TopicRepository`（`topics`）へ書き込む。`ws/gateway.ts`（T18）は同じ`EngineEventBus`を別途購読してUIへWebSocketブロードキャストする（`TurnOrchestrator`とは独立した購読者）。
- `CacheSyncService`（T15）はサーバー起動時（T17/T18で実際に呼び出す）に`CharacterDefLoader.loadAll()`→`CharacterCacheRepository`への書き込み→（`EmbeddingService`が注入されていれば）記憶プリセットごとのembedding計算・`MemoryRepositoryImpl.saveEmbedding()`保存、の順で実行する。

### 13.1 SessionRepository / TurnRepository / FeedbackRepository（T16）

`class-design.md`旧版にはメソッドシグネチャの記載が無かったため、`architecture.md` 7章のREST APIエンドポイントから逆算して実装した。

```typescript
export class SessionRepository {
  create(input: CreateSessionInput): SessionRecord;   // POST /api/sessions
  findById(id: string): SessionRecord | null;          // GET /api/sessions/:id
  updateStatus(id: string, status: SessionStatus): void; // POST /run, /stop
  list(): SessionRecord[];
}

export class TurnRepository {
  createTurn(turn: TurnRecord): TurnRecord;                          // F8.1
  findByTurnNo(sessionId: string, turnNo: number): TurnRecord | null; // GET /turns/:turnNo
  listBySession(sessionId: string): TurnRecord[];                     // GET /turns
  createLayerEvent(sessionId: string, turnNo: number, layer: LayerName, payload: unknown): void; // F8.1
  listLayerEvents(sessionId: string, turnNo: number): LayerEventRecord[]; // F9.3
}

export class FeedbackRepository {
  // PRIMARY KEY (session_id, turn_no) のためupsert（POST /turns/:turnNo/feedback、F8.2/F9.5）
  upsert(sessionId: string, turnNo: number, rating: FeedbackRating, comment: string | null): FeedbackRecord;
  findByTurn(sessionId: string, turnNo: number): FeedbackRecord | null;
  listBySession(sessionId: string): FeedbackRecord[];
}
```

### 13.2 REST API（T17、`packages/server/src/routes/`, `app.ts`）

`createApp(db)`（`app.ts`）がExpressアプリを組み立てるエントリポイント。`routes/sessions.ts`と`routes/turns.ts`はそれぞれ`Router`ファクトリ関数として実装し、`SessionService`/各Repositoryを引数で受け取る（テスト時に`:memory:`DBで組み立てたアプリをsupertestで検証できるようにするため）。`routes/turns.ts`は`Router({ mergeParams: true })`で`/api/sessions/:id/turns`にマウントし、親の`:id`パラメータを継承する。

`SessionService`（`services/SessionService.ts`）はT17時点では以下のみを担う。実際の会話生成（`ConversationManager`の組み立て・`runSession`実行）は`TurnOrchestrator`（T18）が担当する。

```typescript
export class SessionService {
  // characters_cacheへの実在チェックもCharacterCacheRepository経由で行う
  // （implementation-rules.md 5章: SQLiteアクセスはRepositoryクラス経由のみ）。
  constructor(
    private sessionRepository: SessionRepository,
    private characterCacheRepository: CharacterCacheRepository,
  ) {}

  // participantIdsが2〜4体・重複なし・characters_cacheに実在することを検証してから作成する
  createSession(request: { participantIds: string[]; initialTopic?: string }): SessionRecord;
  getSession(id: string): SessionRecord | null;
  run(id: string): SessionRecord | null;   // T17時点はstatus更新のみ（実際の生成はT18のTurnOrchestrator）
  stop(id: string): SessionRecord | null;
}
```

Express 5（`path-to-regexp`更新に伴い）では`req.params[name]`の型が`string | string[]`になるため、単一セグメントの名前付きパラメータのみを使う本プロジェクトでは`routes/params.ts`の`getParam()`ヘルパーで`string`に絞り込んでから使用する。

`TurnRecord`はengineの`TurnResult`（`types/turn.ts`）とフィールド構成を一致させており、`TurnOrchestrator`（T18）がConversationManagerの出力をそのまま渡せるようにしている。`turns.topic_id`は`topics(id)`への外部キー制約があるため、ターン保存前に対応する`topics`行が存在している必要がある（`topics`テーブル自体へのRepositoryはT16のスコープ外。T18で`TurnOrchestrator`が`ConversationManager`の`layer:topic`イベントを受けて書き込む想定）。

### 13.3 TurnOrchestrator / ws/gateway.ts（T18）

`POST /api/sessions/:id/run`は`SessionService.run()`でstatusを`running`へ更新した後、`TurnOrchestrator.start(id, maxTurns)`を**awaitせずに**呼び出す（fire-and-forget）。レスポンス（202）は開始の受理のみを表し、生成の完了は待たない。`POST /stop`は`TurnOrchestrator.requestStop()`を呼び、次のターン境界で安全にループを打ち切る（ターン途中で状態を壊さないため即時中断はしない）。

```typescript
export class TurnOrchestrator {
  constructor(
    private sessionRepository: SessionRepository,
    private turnRepository: TurnRepository,
    private characterCacheRepository: CharacterCacheRepository,
    private memoryRepository: MemoryRepositoryImpl,
    private topicRepository: TopicRepository,   // T18で追加（13.1章参照）
    private llmClient: LlmClient,
    private eventBus: EngineEventBus,
  ) {}

  // participantIdsからCharacterDefRecordを読み出し、CharacterBrain/RelationshipManager/
  // DialoguePlanner/MemoryRetriever/PromptBuilder等を組み立ててConversationManagerを
  // 構築し、runSessionを実行しながらEngineEventBusを購読して永続化する。
  async start(sessionId: string, maxTurns?: number): Promise<void>;

  // 次のターン境界でrunSessionループを打ち切る（statusはstoppedになる）。
  requestStop(): void;
}
```

**エラー時のステータスとイベント通知（T40/T41、2026-08-19）**: `start()`のループ実行中に例外（LLM/Embedding呼び出しの`AbortError`等）が発生した場合、`finally`ブロックで無条件に`'completed'`を記録していたためセッションの異常終了が正常完了として記録されてしまう問題があった。`try/catch`で例外発生を検知し、`stopRequested`による打ち切りかどうかと合わせて`'completed'`/`'stopped'`/`'failed'`（`SessionStatus`に追加）を区別して記録するよう修正した。また、`finally`で`eventBus.emit('session:end', { reason, error? })`を発行し、`ws/gateway.ts`経由でUIにもセッション全体の終了（理由・エラー内容）を通知する。ターン単位のイベント（`turn:start`〜`turn:complete`）とは異なり`session:end`は`start()`の実行につき1回だけ発行される。`turn:complete`と違い`turns`/`turn_layer_events`テーブルへは永続化しない一過性のイベントのため、`session:end`発行後にWebSocket再接続したクライアントは過去の終了通知を受け取れない（`GET /api/sessions/:id`で`status`を確認すれば終了理由の大分類は分かる）。プロトタイプでは単一クライアント接続を想定しており実害は小さいと判断し、この制約は許容している。

**キャラクター初期状態**: `CharacterBrain`の初期`CharacterState`は、`personality`のみ`CharacterDefRecord`（DBの`characters_cache`）から引き継ぎ、`emotion`/`energy`/`curiosity`/`currentGoal`/`speakingStyle`はF1.1のデフォルト値（calm/0.5/0.5/'仲良くなる'/中立）から開始する（features.md/class-design.mdに初期値の指定が無いため実装者判断）。

**プロンプトテンプレートのパス解決**: `packages/engine/prompts/`はビルド成果物（`dist/`）に含まれないソース資産のため、`require.resolve('@prottype2/engine')`でmain解決先（`dist/index.js`）を取得し、そこからパッケージルートを逆算して`prompts/`を参照する（モノレポのworkspace解決に依存する、CHARACTER_DEF_PATHとは異なる方式）。

**`turn_layer_events`の書き込みタイミング**: `turns(session_id, turn_no)`への外部キー制約があるため、ターン進行中に発行される`layer:*`イベントは`turns`行の作成（`turn:complete`時点）より先に発生する。そのため`TurnOrchestrator`はターン内でレイヤーイベントをメモリ上にバッファリングし、`turn:complete`で`turns`行を作成した直後にまとめて書き込む。`topics`行（`turns.topic_id`のFK先）は`turns`に依存しないため、`layer:topic`受信時に`TopicRepository.upsert()`で即時書き込む。

**単一セッション前提**: architecture.md 1章の「単一ユーザー・単一セッションのローカル実行を想定」に従い、`TurnOrchestrator`は同時に複数セッションを実行できない（2回目の`start()`は例外を投げる）。`EngineEventBus`はserver全体で共有される単一インスタンスのため、`start()`は実行のたびに永続化用リスナーを`on()`で購読し、完了時（`finally`）に`off()`で解除する。

```typescript
// EngineEventBus（class-design.md 11章）にoff()を追加（T18）。
export class EngineEventBus {
  on(event: LayerEventName, handler: (payload: unknown) => void): void;
  off(event: LayerEventName, handler: (payload: unknown) => void): void;
  emit(event: LayerEventName, payload: unknown): void;
}
```

`ws/gateway.ts`の`attachWebSocketGateway(httpServer, eventBus)`は`TurnOrchestrator`とは独立に同じ`EngineEventBus`を購読し、`architecture.md` 7章のイベント一覧（`turn:start`〜`turn:complete`、`session:end`）を`{ event, payload }`形式のJSONとして全接続クライアントへブロードキャストする。`WebSocketServer`は`path: '/ws'`でhttp.Serverへアタッチする。

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
