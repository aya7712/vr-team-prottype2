# 実装TODOリスト

対象参照: `doc/design/requirements.md`, `doc/design/features.md`, `doc/design/architecture.md`, `doc/design/data-design.md`, `doc/design/class-design.md`, `doc/design/implementation-rules.md`, `doc/design/ui-design-rules.md`

## このファイルの使い方（Claude Code向け）

1. 上から順に、**未着手（`[ ]`）のTODOを1件だけ**選んで着手する。複数件をまとめて進めない。
2. 実装する。`doc/design/*.md` の該当セクション（各TODOに記載）を必ず読んでから着手する。既存コードと設計の乖離に気づいたら、`implementation-rules.md` 9章に従って先にどちらかを更新する。
3. **テストを実行する**（該当パッケージの `npm test`。新規ロジックには対応するテストを追加してから実行する。UIのみのTODOでビルド/型チェックのみになる場合はその旨を明記する）。
4. **自己レビューを行う**。メインのエージェント自身でレビューせず、**必ずサブエージェント（Agent tool、`/code-review`スキル）に実行させる**。メインの実装コンテキストに引きずられない独立した視点でレビューさせるため、`subagent_type: "fork"`（コンテキストを引き継ぐ自分自身の分身）ではなく、独立した`code-reviewer`等のサブエージェントを使う。レビューのモデルは**Sonnet固定**とする（Agent tool呼び出し時に`model: "sonnet"`を明示的に指定する）。
   レビュー観点として、通常のバグ検出に加えて必ず以下を確認させる（プロンプトに明記する）。
   - `doc/design/implementation-rules.md` に定義された規約（命名規約・ディレクトリ/依存ルール・外部I/O集約・プロンプトテンプレート運用・ログ命名等）を守れているか
   - UIを含むTODOの場合、`doc/design/ui-design-rules.md`（カラーシステム、キャラクターカラーの適用箇所・適用方法、コントラスト比等）を守れているか
   - 実装が `doc/design/architecture.md` / `doc/design/class-design.md` / `doc/design/data-design.md` の該当箇所と乖離していないか（クラス責務・テーブル構成・API/イベント仕様等）
   - 実装が冗長になっていないか（不要な抽象化、重複コード、TODOのスコープを超えた過剰実装がないか）
   指摘があれば修正し、修正後は3のテストを再実行する。
5. **コミットする**（1 TODO = 1コミットを基本とする。コミットメッセージにはTODO番号を含める。例: `feat: [T05] Character Brain (F1) を実装`）。コミットメッセージ本文の末尾に、レビュー実行の証跡として以下のtrailerを必ず含める（`implementation-rules.md` 9章のpre-commitフックがこれを検証する）。
   ```
   Self-Review: sonnet, TODO=T05, findings=2-fixed
   ```
   `findings=`には「指摘数-対応状況」を書く（例: `0`＝指摘なし、`2-fixed`＝2件指摘し全て修正、`1-skipped`＝1件指摘したが対応しなかった場合。対応しなかった場合は理由をコミット本文に併記する）。
6. このファイルの該当項目を `[ ]` → `[x]` に更新し、それも同じコミット（または直後のコミット）に含める。
7. 次のTODOに進む。

**やらないこと**: 複数TODOの並行着手、テスト/レビューの省略、このファイルにない大きな設計変更の独断での実施（必要な場合はユーザーに確認する）。

---

## フェーズ0: プロジェクト基盤

- [x] **T01. モノレポ初期化**
  `architecture.md` 3〜4章に従い、npm workspaces構成（`packages/engine`, `packages/server`, `packages/ui`）を作成する。ルートに `package.json`, `tsconfig.base.json`, ESLint/Prettier設定、`.gitignore`（`data/*.sqlite`, `.env` を含む）を用意する。各パッケージに空の `src/index.ts` と最小の `package.json` を置き、`npm install` が通ることを確認する。
  テスト: `npm install` が成功すること、`npm run build`（空実装でよい）が全パッケージで通ること。

- [x] **T02. Lint/Test/Buildスクリプトの整備**
  ルートに `npm run lint` / `npm run test` / `npm run build` を用意し、各パッケージに委譲する。Vitestをengine/serverに、engineにはUIなしのユニットテスト実行環境を設定する。`implementation-rules.md` 8章のテスト方針に従う。
  テスト: サンプルの `1+1` テストを仮置きし、`npm run test` が通ることを確認（後続TODOで実テストに置き換わる）。

- [x] **T03. 共有型定義の作成**
  `class-design.md` 3章に従い、`packages/engine/src/types/` に `character.ts`, `relationship.ts`, `memory.ts`, `topic.ts`, `dialogueAct.ts`, `turn.ts`, `events.ts` を作成する。`server`/`ui` から参照できるようpathエイリアス（例: `@engine/types`）を設定する。
  テスト: 型チェック（`tsc --noEmit`）が通ること。

- [x] **T03a. pre-commitフックの導入（format/lint/typecheck/test + 自己レビューtrailer検証）**
  `implementation-rules.md` 9章に従い、Huskyの`pre-commit`（コミットメッセージ関連は`commit-msg`）フックを導入し、以下を検証する。エラーが1つでもあればコミットを拒否する。
  - `packages/`配下の変更を含む場合: `npm run format:check`（またはformatterの`--check`相当）、`npm run lint`、`npm run typecheck`（`tsc --noEmit`）、`npm run test` を実行し、いずれかが失敗したらコミットを拒否する。
  - `packages/`配下の変更を含むコミットは、コミットメッセージに `Self-Review: <model>, TODO=<番号>, findings=<内容>` のtrailerが含まれない場合もコミットを拒否する。
  - `doc/`のみの変更（設計ドキュメント更新等）はformat/lint/typecheck/test・trailerともにチェック対象外とする。
  テスト: (1) format/lint/typecheck/testのいずれかが失敗する状態でのコミットが拒否されること、(2) 全て成功しtrailerも正しい場合にコミットが成功すること、(3) trailer無しでのコミットが拒否されること、(4) `doc/`のみの変更ではいずれのチェックも行わずコミットが成功すること、を確認する（`git commit`をサンドボックスの一時リポジトリ等で試すスクリプトテストとして書く）。

---

## フェーズ1: Engine（2体会話・コアロジック）

- [x] **T04. character_def取り込み（CharacterDefLoader）**
  `class-design.md` 12章、`data-design.md` 4章に従い、`packages/engine/src/data/` に `CharacterDefLoader`, `YamlCharacterParser`, `MarkdownMemoryParser` を実装する。`CHARACTER_DEF_PATH` 環境変数（既定値 `/home/sora_55/workspace/vr-team/character_def`）から `design/main`, `design/sub`, `memory/**/*.md` を読み込み、型付きレコードを返す。`color`フィールド（`ui-design-rules.md` 2.2）も取り込むこと。
  テスト: 実際の `character_def` ディレクトリを読み込ませ、4体のキャラクター・少なくとも1件ずつの記憶ファイルが正しくパースされることをユニットテストで確認する。YAML/Markdownの異常系（frontmatter欠落等）で例外を投げることも確認する。

- [x] **T05. Character Brain（F1）**
  `class-design.md` 4章に従い、`CharacterBrain`, `EmotionUpdater`, `GoalUpdater`, `IntentUpdater`, `SpeakingStyleResolver` を実装する。`features.md` F1.2の更新順序（感情→Goal→Intent）を守る。
  テスト: 代表的な入力（共感された/否定された等のイベント）に対する状態更新の期待値をユニットテストする。

- [x] **T06. Relationship Engine（F2）**
  `class-design.md` 5章に従い、`RelationshipGraph`, `RelationshipManager`, `RelationshipUpdater` を実装する。T04で取得した `design/main` の `relationships` を初期値として`RelationshipGraph`を構築するファクトリも用意する。4体分＝最大6エッジを保持できることを確認する（`features.md` F2.1）。
  テスト: 2体・4体それぞれでのグラフ構築、`resolve()`が呼び方/敬語レベル等を返すこと、`RelationshipUpdater`によるtrust/intimacy変化をユニットテストする。

- [x] **T07. Memory（F3）: リポジトリインターフェースとインメモリ実装**
  `class-design.md` 6章に従い、`MemoryRepository`インターフェースを定義し、まずはSQLiteなしで動作確認するための**インメモリ実装**（テスト用フェイク）を用意する。`MemoryRetriever`（キーワードマッチのみの簡易版でよい。意味検索はT15で追加）を実装する。
  テスト: `shareable: false` の記憶が他キャラとの会話で除外されること、`participants`に基づく自己記憶/共有記憶の切り分けをユニットテストする。

- [x] **T08. Topic Analyzer / ConversationState（F4）**
  `class-design.md` 7章に従い、`TopicTree`, `TopicClassifier`（意味的類似度部分は暫定的に文字列一致・簡易スコアで実装し、埋め込みはT15後に差し替える）, `TopicParameterUpdater`, `TopicContinuationScorer`, `ConversationStateManager`, `RhythmTracker` を実装する。
  テスト: `features.md` F4.3のenergy/novelty/life更新ルール、F4.6のリズム補正（同一Act連続時に他Actの重みが上がること）をユニットテストする。

- [x] **T09. Dialogue Planner（F5）**
  `class-design.md` 8章に従い、`DialogueActCatalog`, `ScoreCalculator`, 各`ModifierResolver`, `SoftmaxSelector`, `SpeechExpectationCalculator`, `DialoguePlanner`を実装する。Modifier係数は外部設定ファイル（`implementation-rules.md`未確定事項→この時点でJSON形式に決定して進めてよい）として `dialoguePlanner/config/` に置く。
  テスト: `features.md` F5.3のスコア計算式、F5.4のSoftmax確率化、同一入力を複数回実行した際に確率的な揺らぎが出ることをユニットテストする。

- [x] **T10. LLM連携（F7）: Together AIクライアントとプロンプト管理**
  `class-design.md` 10章に従い、`TogetherClient`（既定モデル `google/gemma-3n-E4B-it`）, `PromptTemplateLoader`, `PromptBuilder`, `OutputParser` を実装する。`packages/engine/prompts/utterance/base.md` 等、最低限のテンプレートを`implementation-rules.md` 6章のルールに沿って作成する。
  テスト: `PromptBuilder`のプレースホルダー置換をユニットテストする（LLM実呼び出しはモックする）。`.env.example`に`TOGETHER_API_KEY`, `TOGETHER_MODEL`を追加する。

- [x] **T11. Together AI疎通確認（実APIを1回だけ呼ぶ検証）**
  `google/gemma-3n-E4B-it` に対して実際にAPIキーを使い1リクエストを送り、応答が返ることを手動確認する（自動テストにはしない。CIでAPIキーを使う自動テストは追加しない）。結果と手順を本TODOのコミットメッセージまたはPRメモに残す。
  テスト: 手動確認のみ。

- [x] **T12. Conversation Manager（F6, 2体会話版）**
  `class-design.md` 9章に従い、`ConversationManager.runTurn` / `runSession` を実装する。`SpeakerSelector`はこの時点では「常に相手を返す」最小実装でよい（3〜4体対応はT19）。`architecture.md` 6章のシーケンス通りに各ステップでイベントを発行する。
  テスト: T05〜T10のモック/フェイクを組み合わせた統合テストとして、2体・数ターンの`runSession`が例外なく完走し、`TurnResult`が期待するフィールドを持つことを確認する。

- [x] **T13. Turn Logger / EventBus（F8, Engine側）**
  `class-design.md` 11章に従い、`EngineEventBus`を実装し、T12の`ConversationManager`から各レイヤーイベントが発行されることを確認する。
  テスト: イベント購読時に想定した`LayerEventName`と`payload`が発行されることをユニットテストする。

---

## フェーズ2: Server（永続化・API・配信）

- [x] **T14. SQLiteスキーマ・マイグレーション**
  `data-design.md` 5章のCREATE TABLE群を`packages/server/src/db/schema.sql`として作成し、起動時に適用する`migrate.ts`を実装する。`better-sqlite3`を導入する。
  テスト: マイグレーション実行後、全テーブルが期待通りのカラムで作成されることをテストする。

- [x] **T15. キャッシュ同期・MemoryRepository実装・意味検索**
  `data-design.md` 4章・6章に従い、`server`起動時にT04の`CharacterDefLoader`結果を`characters_cache`/`memory_preset_cache`へ書き込む処理を実装する。`EmbeddingService`（Together AI Embeddings API）と`memory_embeddings`テーブルを実装し、`MemoryRepositoryImpl`（`MemoryRepository`の本実装、FTS5＋コサイン類似度のハイブリッド検索）を実装してT07のフェイクと差し替える。
  テスト: 実際の`character_def`データを取り込んだ状態で、キーワード検索・意味検索それぞれで期待する記憶が上位に来ることを確認するテストを書く（Embedding生成は課金が発生するため、テストではモックまたは事前計算済みベクトルを使う）。

- [x] **T16. Session/Turn/Feedback Repository**
  `class-design.md` 13章に従い、`SessionRepository`, `TurnRepository`, `FeedbackRepository`を実装する。
  テスト: CRUD操作のユニットテスト。

- [x] **T17. REST API（セッション管理・ターン取得）**
  `architecture.md` 7章のエンドポイント一覧に従い、`POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/turns`, `GET /api/sessions/:id/turns/:turnNo`, `POST /api/sessions/:id/turns/:turnNo/feedback`, `POST /api/sessions/:id/run`, `POST /api/sessions/:id/stop` を実装する。
  テスト: 各エンドポイントのリクエスト/レスポンスをHTTPレベルで検証する統合テストを書く。

- [x] **T18. WebSocket Gateway・TurnOrchestrator**
  `class-design.md` 13章に従い、`TurnOrchestrator`が`ConversationManager.runSession`を実行しつつ`turns`/`turn_layer_events`へ永続化し、`ws/gateway.ts`が`EngineEventBus`のイベントをWebSocketでブロードキャストすることを実装する。
  テスト: WebSocketクライアントを模擬し、`POST /run`実行中に`architecture.md` 7章のイベント一覧が想定順序で届くことを確認する。

- [x] **T19. 2体・50ターン結合テスト**
  実際に`google/gemma-3n-E4B-it`を使い、2キャラクターで50ターンの会話を生成するE2Eスクリプトを作成する（自動テストではなく手動実行スクリプトでよい）。`requirements.md` 7.1の成功基準（Dialogue Actの多様性、共有記憶の参照、話題転換が3回以上、後半のドリフトがないこと等）を目視確認し、結果をメモとして残す。
  テスト: スクリプト実行と結果目視確認。問題があれば該当TODOへ差し戻して修正する。

---

## フェーズ3: UI（モニタリング画面）

- [x] **T20. UI基盤・デザイントークン**
  `ui-design-rules.md` 2〜3章に従い、Vite+Reactプロジェクトを`packages/ui`に構築し、CSS変数によるニュートラルカラーパレット（ライト/ダーク対応）とタイポグラフィの基本スタイルを定義する。`getReadableTextColor`ユーティリティ関数を実装する。
  テスト: `getReadableTextColor`のユニットテスト（複数の背景色パターンでのコントラスト判定）。ビルドが通ることを確認する。

- [x] **T21. WebSocket購読フック・REST APIクライアント**
  `class-design.md` 14章に従い、`useEngineEvents`フックと`api/client.ts`を実装する。
  テスト: モックWebSocketサーバーに対する接続・イベント受信のユニットテストを書く。

- [x] **T22. リアルタイム会話ビュー（F9.1）**
  `features.md` F9.1、`ui-design-rules.md` 2.2の「チャットバブル」ルールに従い実装する。発話者のキャラクターカラーをバブル左ボーダー・発言者名に適用する。
  テスト: モックデータでのコンポーネントテスト（スナップショットまたはRTLでの表示確認）。`npm run dev`で実際にブラウザ表示を確認する。

- [x] **T23. パラメータダッシュボード（F9.2）**
  `features.md` F9.2、`ui-design-rules.md` 2.2の該当ルールに従い、キャラクター別状態カード・ConversationState表示・Topicツリー・Relationship Matrixを実装する。
  テスト: モックデータでのコンポーネントテスト。ブラウザでの目視確認。

- [x] **T24. レイヤー別計算過程ビュー（F9.3）**
  `features.md` F9.3、`ui-design-rules.md` 5章に従い、Dialogue Actスコア内訳テーブル・選択Actのハイライト・折りたたみ式プロンプトビューアを実装する。
  テスト: モックデータでのコンポーネントテスト。ブラウザでの目視確認。

- [x] **T25. ログ閲覧（F9.4）**
  `features.md` F9.4（検索機能なし）に従い、過去ターンの一覧とターン選択時のF9.2/F9.3再利用表示を実装する。
  テスト: モックデータでのコンポーネントテスト。

- [x] **T26. 人手評価入力（F9.5）**
  `features.md` F9.5に従い、表示中ターンへの自然/不自然評価とコメント入力UIを実装し、`POST /api/sessions/:id/turns/:turnNo/feedback`と接続する。
  テスト: フォーム送信のコンポーネントテスト、APIモックでの送信確認。

- [x] **T27. UI結合確認（2体会話）**
  T19の50ターン会話をUIに接続した状態で実行し、F9.1〜F9.5が一通り機能することをブラウザで確認する（`run`スキルを使用）。
  テスト: 手動確認。問題点があれば該当TODOに差し戻す。

---

## フェーズ4: 多人数会話（3〜4体）拡張

- [x] **T28. Relationship Graphの4体全ペア対応確認**
  T06のグラフ構築が4体・6ペアで初期化漏れなく動作することを確認し、不足があれば修正する（`features.md` F2.1）。
  テスト: 4体構成でのユニットテスト追加。

- [x] **T29. Speaker Selection（F6.2）本実装**
  `class-design.md` 9章、`features.md` F6.2に従い、`SpeakerSelector`を本実装する（名指し優先・発話頻度バランス・積極性・関係性を考慮したスコアリングと確率選択）。
  テスト: 4体構成で、特定キャラだけが発話し続けない（`requirements.md` 7.2の基準）ことを複数回試行で確認するテストを書く。

- [x] **T30. 話題の分岐・合流（F6.3）**
  `class-design.md` 9章、`features.md` F6.3に従い、`TopicBranchMerger`を実装する。
  テスト: サブグループでの話題分岐が発生するケース、合流条件を満たした際にマージされるケースをユニットテストする。

- [x] **T31. 4体・結合テスト**
  4キャラクターでの会話生成をE2Eスクリプトで実行し、`requirements.md` 7.2の成功基準（発話機会の分配、名指し誘導、6ペア関係の破綻なし、話題の分岐/合流）を確認する。
  テスト: スクリプト実行と結果目視確認。

- [x] **T32. UIの4体対応確認**
  F9.1〜F9.4が4体構成でも破綻なく表示されること（キャラクターカラー4色の同時表示、Relationship Matrixの6ペア表示等）をブラウザで確認する。
  テスト: 手動確認。

- [x] **T33. ログ閲覧画面のセッション一覧表示**
  ユーザー要望により追加。現状`GET /api/sessions`の一覧取得エンドポイントが無く、`LogBrowser`はセッションIDを手入力する方式になっている。`architecture.md` 7章に`GET /api/sessions`（セッション一覧。id/createdAt/status/participantIds等を返す）を追加し、`data-design.md`のsessionsテーブル定義と整合させる。`packages/ui`の`LogBrowser`（`class-design.md` 14章）は、セッションID手入力欄をセッション一覧（クリックで選択、表示中のセッションをハイライト）に置き換える。`features.md` F9.4の記述もこの変更に合わせて更新する。
  テスト: 一覧APIのHTTPテスト（`packages/server`）。UIのセッション一覧表示・クリック選択のコンポーネントテスト（`packages/ui`）。

- [x] **T34. リアルタイム画面からのターン数指定でのセッション開始**
  ユーザー要望により追加。現状UIにはセッション作成・開始のUIが無く、`POST /api/sessions`・`POST /api/sessions/:id/run`は外部（curl等）から呼ぶことでしか動作確認できていない（T27/T32参照）。`packages/ui`のリアルタイム画面（`ConversationView`周辺）に、参加キャラクター選択・ターン数入力・開始ボタンを持つセッション作成フォームを追加し、`apiClient.createSession`→`apiClient.runSession`を呼び出せるようにする。`features.md` F6.6・`class-design.md` 14章の記載に反映する。
  テスト: フォーム入力→送信のコンポーネントテスト（APIモック）。`npm run dev`で実際にUIからセッションを作成・開始できることをブラウザで確認する。

- [x] **T35. 会話生成時の最初のトピック必須指定**
  ユーザー要望により追加。現状セッション作成時に初期トピックの指定が無く、`ConversationManager`は1発話目を「(会話開始)」という固定プレースホルダーから`TopicClassifier`に分類させている。セッション作成時（`POST /api/sessions`）に最初のトピック（文字列、必須）を受け取れるようにし、`SessionRecord`/DBの`sessions`テーブル（`data-design.md`）に保持する。`ConversationManager`は`SessionState`の`TopicTree`をこの初期トピックで初期化した状態から`runTurn`を開始するよう変更する（`resolveTopic`が「(会話開始)」プレースホルダーに頼らないようにする）。`features.md` F6.6・`class-design.md` 9章に反映する。UIはT34のセッション作成フォームに初期トピック入力欄を追加し必須にする。T33のセッション一覧には各セッションの初期トピックも表示する。
  **スキーマ変更の扱い**: `sessions`テーブルへのカラム追加が必要になる。現行の`migrate.ts`は`CREATE TABLE IF NOT EXISTS`のみで既存テーブルへの`ALTER TABLE`に対応していないため（ユーザー確認済み、2026-08-13）、`schema_version`管理付きのバージョン管理された`ALTER TABLE`方式の簡易マイグレーション機構を`migrate.ts`に追加し、既存の`data/engine.sqlite`（確認用データ）を保持したままカラムを追加できるようにする。以後のスキーマ変更でもこの機構を使い、確認用データの削除は行わない。
  テスト: 初期トピック未指定時に`POST /api/sessions`が400を返すテスト。`ConversationManager`が指定した初期トピックから会話を開始する（1発話目の`topicId`が初期Topicと一致する、または初期Topicの子として分類される）ことを確認するユニットテスト。UIのフォームで初期トピックが必須項目として機能することのコンポーネントテスト。マイグレーション機構については、旧スキーマのDBファイルに対して適用してもデータが失われずカラムが追加されることを確認するテストを書く。

- [ ] **T36. topic_idがほぼ毎ターン変化する挙動の調査・対応**
  T19の50ターンE2E実行（`doc/t19_5turn_smoke_and_50turn_log.md`）で、会話内容としては同じ話題が数ターン継続しているように見えるにもかかわらず、`turn:complete`イベントの`topicId`がほぼ毎ターン変化していることが確認された（50ターン中49回topic_idが変化）。`TopicTree`/`TopicClassifier`/`ConversationStateManager`（`class-design.md` 7章、T08）周りの実装を確認し、これが「1発話ごとに新しいTopicノードを作る」設計上の意図した挙動なのか、話題継続の判定ロジックの不具合なのかを切り分ける。不具合であれば修正し、意図した設計であれば`requirements.md` 7.1の「話題転換が3回以上、頻繁すぎないこと」という基準との整合を`class-design.md`/`data-design.md`に明記する。

  **2026-08-14追記（配信ログ目視レビューにより判明）**: 実データ（`data/engine.sqlite`の`topics`テーブル）を確認したところ、原因は`TopicClassifier`（`packages/engine/src/topic/TopicClassifier.ts`）の暫定実装にあることが特定できた。
  - `classify()`が`same`/`child`いずれの場合も`suggestedLabel: utterance`として**発話全文をそのままlabelに設定**しており、要約・抽象化を行っていない。
  - 類似度判定が**文字bigramのJaccard係数**（同ファイルのコメントで「T15で埋め込みベースの意味的類似度に差し替える暫定実装」と明記）のままであり、かつ比較対象が要約されていない長文同士のため、意味的に同じ話題でも語彙が異なるとスコアが閾値（`SAME_TOPIC_THRESHOLD=0.5`/`CHILD_TOPIC_THRESHOLD=0.2`）を超えず、ほぼ毎ターン`new`（ルートの独立トピック）判定になる。
  - なお`TopicClassifier`のコメントが差し替え先として想定していた「T15」は実際には`MemoryRepository`向け`EmbeddingService`（記憶の意味検索）のみのスコープで完了しており（`todo.md` T15参照）、`TopicClassifier`への適用は行われていなかった。
  - 対応方針: T15で実装済みの`EmbeddingService`（`packages/server`、Together AI Embeddings API）を`TopicClassifier`から利用できるようにし、(1) 新規発話ごとにLLM等でトピックlabelを要約・抽象化する処理を追加する、(2) `same`/`child`/`new`の判定をこの要約labelの埋め込みベクトル同士のコサイン類似度に置き換える。`class-design.md` 7章・`data-design.md`のTopic関連定義を実装に合わせて更新する。
  - **実施内容（対応済み）**: (2)は`TopicClassifier`に`embeddingService`をoptional注入し、注入時はutteranceと既存Topic.labelのコサイン類似度でsame/child/new判定を行うように実装した（未注入時は従来のJaccard係数にフォールバック）。(1)については、今回はLLM呼び出しによる要約は見送り、発話の最初の一文（句読点まで、最大20文字）を切り出す簡易ヒューリスティックをlabelとして採用した（`TopicClassifier.toShortLabel`）。LLMによる本格的な要約・抽象化への差し替えは別途フォローアップとする。

  テスト: `TopicClassifier`/`TopicContinuationScorer`の話題継続判定について、同一話題が継続すべき入力パターンでの期待値をユニットテストで確認する。label要約処理についても、発話に対して短い要約ラベルが生成されることを確認するテストを書く（LLM/Embedding呼び出しはモックまたは事前計算済みベクトルを使う）。必要であればT19のE2Eスクリプトを再実行し、`topicId`の変化回数が改善したことを確認する。

- [x] **T37. MemoryRetrieverのembeddingService未配線（記憶の意味検索が実運用で機能していない）の調査・対応**
  T36対応中に発見。`packages/server/src/services/TurnOrchestrator.ts`の`buildConversationManager`（187行目付近）が`new MemoryRetriever(this.memoryRepository)`と`embeddingService`を渡さずに`MemoryRetriever`を生成しており、`MemoryRetriever`（`packages/engine/src/memory/MemoryRetriever.ts`）のコンストラクタ第2引数`embeddingService?`が常に`undefined`になっている。`MemoryRetriever.retrieve()`はembeddingService未注入時はキーワード一致のみで動作する設計（`class-design.md` 6章、T15）のため、T15で謳われた「意味検索（コサイン類似度によるハイブリッド検索）」が本番の会話生成フロー（`POST /api/sessions/:id/run`経由）では一度も実行されておらず、キーワードマッチのみ（T07相当）にとどまっている可能性がある。`main.ts`/`e2eConversation.ts`では`embeddingService`インスタンス自体は生成済み（`CacheSyncService`向け）のため、`TurnOrchestrator`のコンストラクタに`embeddingService`を渡し（T36でTopicClassifier向けに追加した配線と同様の要領）、`buildConversationManager`内の`MemoryRetriever`生成にも渡す対応が想定される。まず意図的にキーワードのみで十分としていた設計判断なのか、単純な配線漏れなのかを`class-design.md`/`data-design.md`と照らして切り分けてから対応する。
  テスト: `TurnOrchestrator`が`embeddingService`を`MemoryRetriever`まで配線していることを確認するユニットテスト。意味検索が有効な状態で、キーワード一致では拾えないが意味的に関連する記憶が上位に来ることを確認する統合テスト（Embedding生成はモックまたは事前計算済みベクトルを使う）。
  **実施内容（対応済み）**: `class-design.md`と照合の結果、意図的な設計ではなく単純な配線漏れと判断。`buildConversationManager`内の`new MemoryRetriever(this.memoryRepository)`を`new MemoryRetriever(this.memoryRepository, this.embeddingService)`に修正した。ユニットテストは、`memory_preset_cache`＋`memory_embeddings`にレコードを1件仕込んだ上で`MemoryRepositoryImpl.getEmbedding`をスパイし、呼ばれたことを確認する形にした（`repo.getEmbedding`は`MemoryRetriever.computeSemanticScores()`からのみ呼ばれ`TopicClassifier`は呼ばないため、T36の配線と区別してMemoryRetriever側の配線を検証できる）。配線を意図的に元に戻すとこのテストが失敗することを確認済み。

- [x] **T38. 関連度判定（RelationshipManager×MemoryRetriever）の先送り解消**
  T36対応中のTODOコメント調査で発見。`RelationshipManager`（`packages/engine/src/relationship/RelationshipManager.ts` 9〜14行目）と`TopicClassifier`（`packages/engine/src/topic/TopicClassifier.ts`）の両方に、互いを名指しして「相手側（`MemoryRetriever`）が実装されたら関連度判定ロジックを追加する」という先送りコメントが残っている。`MemoryRetriever`（F3.4）はT07・T15で実装済みだが、この「関連度判定」自体（`class-design.md` 5章で`RelationshipManager`の依存として示されている`MemoryRetriever`、および`TopicClassifier.classify()`のdocコメントにある「意味的類似度＋関係性記憶を加味した3段階判定」のうち関係性記憶を加味する部分）はいずれも未着手のまま。`class-design.md` 5章・7章と現状の実装の乖離を確認し、(1) 本当に必要な機能か（`requirements.md`の該当要件を確認）、(2) 必要であれば`RelationshipManager.resolve()`および/または`TopicClassifier.classify()`に`MemoryRetriever`（または共有記憶検索結果）を注入し、関連度を判定へ反映する実装を行う。不要と判断した場合は`class-design.md`のコメント・シグネチャ側を実装に合わせて更新する。
  テスト: 関連度判定を実装する場合、共有記憶の有無/内容によって`RelationshipContext`や`TopicClassificationResult`の判定が変わることを確認するユニットテストを書く。
  **実施内容（対応済み、見送り）**: `features.md` F4.2に要件自体は明記されており省略ではなく未実装のギャップだった。ただし`ConversationManager`は「Topic判定 → 関係性解決 → 記憶検索」の順でターンを処理しており、Topic判定は前ターンの発話を使う一手遅れ設計のため、今回の発話に対する記憶検索結果はTopic判定時点でまだ存在しない。関連度を反映するにはパイプライン順序の組み替え（記憶検索の前倒し、または前ターンの検索結果を次のTopic判定へ引き継ぐ）が必要であり、プロトタイプ規模ではそのコストに見合わないとユーザーと合意し実装は見送った。`features.md`（F4.2）・`class-design.md`（`RelationshipManager`/`TopicClassifier`のdocコメント）・実装側（`RelationshipManager.ts`/`TopicClassifier.ts`のdocコメント）を、いずれも「後続TODOで追加」ではなく「T38で見送り済み」と明記する形に更新し、設計と実装の記述を一致させた。

- [x] **T39. `SessionRecord.scenario`フィールドの整理**
  T36対応中のTODOコメント調査で発見。`packages/server/src/db/repositories/types.ts`の`SessionRecord.scenario`（`unknown`型）が「F6.6（シナリオ入力）が未実装のため」というコメント付きで残っているが、T35対応で`features.md` F6.6は「初期トピック（文字列、必須）」に事実上スコープダウンされており（`initialTopic`フィールドが新設・実装済み）、`scenario`は`SessionService.ts`で常に`null`が入るだけの未使用フィールドになっている。`scenario`関連のコード（`SessionRecord`/`CreateSessionInput`の`scenario`、`sessions`テーブルの`scenario_json`カラム、`SessionRepository`/`SessionService`の該当箇所）を削除するか、将来のシナリオ入力機能拡張のために意図的に残すかを判断し、残す場合は`data-design.md`/`class-design.md`にその意図を明記する。削除する場合はT35と同様の`ALTER TABLE`方式マイグレーション機構（`schema_version`管理）でカラム削除に対応する。
  テスト: `scenario`を削除する場合、`POST /api/sessions`が`scenario`無しのリクエストで正しく動作することを確認する既存テストの更新。マイグレーションのテスト（旧スキーマDBに適用してもデータが失われないこと）。
  **実施内容（対応済み）**: UI（`SessionStartForm.tsx`）から一度も送信されず常に`null`となる未使用フィールドと確認できたため削除する方針とした。`migrate.ts`にversion 2のマイグレーション（`ALTER TABLE sessions DROP COLUMN scenario_json`）を追加し、`SessionRecord`/`CreateSessionInput`/`CreateSessionRequest`（server・UI双方）から`scenario`を削除、`SessionRepository`/`SessionService`の関連コードを削除した。`schema.sql`の`CREATE TABLE`自体はT35の`initial_topic`追加と同じ方針（過去互換のため基本形は変えずマイグレーションで差分を適用）に倣い`scenario_json`列を残し、必ずマイグレーションでDROPされる形にした。`migrate.test.ts`に新規DB・旧スキーマDB（データ保持確認込み）双方のテストを追加。`data-design.md`/`class-design.md`のセッションテーブル定義・`SessionService`インタフェースも実装に合わせて更新した。

- [x] **T40. TurnOrchestratorの実行時エラーが握りつぶされ、セッションが誤って`completed`になる問題の修正**
  2026-08-19、実運用中に発見。`packages/server/src/routes/sessions.ts`の`POST /:id/run`は`turnOrchestrator.start(id, maxTurns)`を`await`せず非同期に開始し、失敗時は`.catch((err) => console.error('TurnOrchestrator failed:', err))`でサーバーログに出力するのみで、クライアントには一切通知されない。さらに`TurnOrchestrator.start()`（`packages/server/src/services/TurnOrchestrator.ts`）は`try { ... } finally { ...; this.sessionRepository.updateStatus(sessionId, this.stopRequested ? 'stopped' : 'completed'); }`という構造になっており、`runSession`のfor-await-ofループ内で例外（LLM/Embedding呼び出しの`AbortError`＝60秒タイムアウト等）が発生した場合でも、`finally`ブロックで無条件にステータスが`completed`（正常完了）に上書きされてしまう。実際に、Together AIへのAPI呼び出しがタイムアウトして`DOMException [AbortError]: This operation was aborted`が発生し、途中（7ターン）で生成が停止したセッションが、DB上は`"status": "completed"`という正常終了として記録されていた。ユーザーからは「生成が止まったのにエラーが見えない」状態になる。
  対応方針: (1) `SessionStatus`に`failed`等のエラー状態を追加するか、既存の`stopped`と区別する手段を検討する（`data-design.md`/`class-design.md`のstatus定義を更新）。(2) `TurnOrchestrator.start()`で例外を捕捉し、意図した`stopRequested`による打ち切りと、予期しない例外による中断を区別してステータスを設定する。(3) `POST /:id/run`または既存のWebSocketイベント経由で、非同期実行中に発生したエラーをクライアント（UI）にも通知できるようにする（T41のセッション終了通知の仕組みと合わせて設計するとよい）。
  テスト: `runSession`中に例外を投げるフェイクの`ConversationManager`/`LlmClient`を用意し、`TurnOrchestrator.start()`実行後にセッションステータスが`completed`ではなく意図したエラー状態になることを確認するユニットテスト。
  **実施内容（対応済み）**: `SessionStatus`に`'failed'`を追加（server・UI双方）。`TurnOrchestrator.start()`を`try/catch/finally`に変更し、ループが例外なく終わった場合は`stopRequested`により`'completed'`/`'stopped'`を、例外を捕捉した場合は`'failed'`を`reason`として記録した上でエラーを再throwする（呼び出し元の`console.error`によるログ出力は維持）ように修正した。T41の`session:end`イベントと合わせて実装。

- [x] **T41. 指定ターン数分の会話生成が完了したことをUIから確認できるようにする**
  2026-08-19、T40の調査中にユーザーから要望。現在、会話生成の完了（`maxTurns`分のターンが生成し終わった、またはエラーで中断した等）を伝えるWebSocketイベントが存在しない。`packages/server/src/ws/gateway.ts`は`LAYER_EVENT_NAMES`（`topic:start`〜`turn:complete`等のターン単位のレイヤーイベント）のみを`EngineEventBus`から購読・ブロードキャストしており、セッション全体の開始・終了を表す`session:start`/`session:end`相当のイベントが無い。UI（`packages/ui/src/state/useEngineEvents.ts`、`SessionStartForm.tsx`等）もそれを受け取って表示する仕組みを持たないため、ユーザーはセッション一覧を手動でポーリング（再取得）しない限り、生成が完了したのか単に止まっているだけなのかを画面上で判別できない。
  対応方針: `TurnOrchestrator.start()`の`finally`ブロック（T40のエラー区別対応後）で、セッションの終了理由（`completed`/`stopped`/エラー）を`EngineEventBus`経由でemitし、`gateway.ts`がそれをWebSocketでブロードキャストする。UI側は`useEngineEvents`（または新規フック）でこれを購読し、`SessionStartForm`やログ閲覧画面に「生成が完了しました」「エラーで停止しました」等を表示する。T40のステータス区別と合わせて設計・実装するのが望ましい。
  テスト: セッション終了時にイベントが1回だけemitされることを確認するユニットテスト（`TurnOrchestrator`）。UI側は、対応するWebSocketメッセージ受信後に完了表示が出ることを確認するコンポーネントテスト。
  **実施内容（対応済み）**: `packages/engine/src/types/events.ts`の`LayerEventName`/`LayerEvent`に`'session:end'`（`SessionEndPayload = { reason: SessionEndReason; error?: string }`）を追加し、`TurnOrchestrator.start()`の`finally`で`eventBus.emit('session:end', { reason, error })`するようにした。`ws/gateway.ts`の`LAYER_EVENT_NAMES`に`'session:end'`を追加し配信対象にした。UI側は`ConversationView.tsx`が`useEngineEvents`の`latestByName['session:end']`を参照し、「会話の生成が完了しました。」「会話の生成を停止しました。」「エラーにより会話の生成が中断されました（詳細）。」を表示するようにした。`architecture.md`/`class-design.md`のイベント一覧・`TurnOrchestrator`節も実装に合わせて更新。

---

- [x] **T42. Issue自動改善フローの自動化基盤（会話ログの静的HTMLレポート化、e2eConversation.tsのDB永続化対応）**
  2026-08-30、ユーザーとの相談で「Issueを読み実装しPRを作るエージェントを定期実行し、複数案を比較検討する」自動化フローを検討した結果発見・対応。人間が生成された会話ログの良し悪しを判断する手段として、既存のLogBrowser（F9.4）と同等の情報を、サーバー・DB無しで開ける単一の静的HTMLとして書き出す`packages/server/src/scripts/exportConversationReport.ts`を新設した。またこのフローで会話サンプルを生成するために使う`packages/server/src/scripts/e2eConversation.ts`が`new Database(':memory:')`固定で、実行後にセッションデータが失われレポート生成に使えない問題と、T35（`initialTopic`必須化）に追従できておらず`SessionValidationError`で落ちる既存バグを発見したため、`--db=<path>`引数の追加とinitialTopicの補完で修正した。
  テスト: `exportConversationReport.ts`はスクリプト単体（レンダリング関数）のため既存の`npm test`（server）の対象外。`e2eConversation.ts`修正後、実際に`--db=<path>`指定でセッションが永続化されること、生成したsqliteファイルから`exportConversationReport.js`でレポートが生成できることを手動実行で確認した。
  **実施内容（対応済み）**: 上記の通り実装・動作確認済み。自動化フロー自体のオーケストレーション（案出しエージェント／実装エージェントのプロンプト）は`doc/agent-prompts/`配下に追加（`packages/`配下ではないため本trailerの対象外）。

---

- [x] **T43. 口調逸脱検知＋自動リトライ機構の追加（Issue #1対応、plan-c）**
  2026-08-31、GitHub Issue #1（「キャラクターの口調が間違うことがある。特に、前に発言したキャラクターの発言に引っ張られて口調がずれているように感じる」という報告）への改善案の1つとして、T42の自動化フローで実装した（`doc/agent-prompts/`参照）。`OutputParser`（F7.3）に、生成された発話が話者以外の参加キャラクターの`firstPerson`/`toneSample`の特徴的な語尾パターンを含んでいないかを検知する`checkToneConsistency`を追加した。`ConversationManager`の発話生成ステップでこのチェックに違反した場合、口調逸脱を指摘する補正指示を追加したプロンプト（`packages/engine/prompts/utterance/tone_retry.md`、F7.1a、`class-design.md` 10.1章に追記）で1回だけ再生成するリトライロジックを追加した（既存の`checkConsistency`＝ng_topicsチェックと同様の構造）。プロンプト本体（`utterance/base.md`）自体は変更していない。
  テスト: `OutputParser.test.ts`に`checkToneConsistency`のユニットテストを追加（他キャラのfirstPerson/toneSample語尾の検知、複数違反の検知、firstPerson/toneSampleがnullの場合の安全性、1文字語尾の誤検知防止）。`ConversationManager.test.ts`に、(1)口調違反時に1回だけ再生成されること、(2)違反がなければ再生成されないこと、(3)再生成しても違反が残る場合は1回で打ち切りその結果を採用すること、(4)再生成が発生したターンでも`layer:llm`イベントは最終的に採用したプロンプト/出力のみで1回だけ発行されること、(5)話者自身と同じ一人称を共有する他キャラクターの一人称を誤検知しないこと、を確認するテストを追加した。
  **実施内容（対応済み）**: 上記の通り実装。自己レビュー（Sonnet、`/code-review`スキル）で以下を指摘・修正した。
  - `layer:llm`イベントを再生成前後で2回発行していたため、`LogBrowser`/`exportConversationReport.ts`の`findLayerPayload`（先勝ちの`.find()`）が再生成前の口調違反出力を拾ってしまい、画面表示の`utterance`（再生成後の最終テキスト）と矛盾する不具合があった。最終的に採用したプロンプト/出力のみを1回発行するよう修正した。
  - `checkToneConsistency`のfirstPersonチェックが単純な部分一致のままだと、実際のcharacter_def（`AI-character-def`）では4体中3体（char_a/char_b/char_d）が一人称「俺」を共有しているため、話者自身の正当な一人称使用まで他キャラの口調違反として毎ターン誤検知してしまう不具合があった。話者自身と同じ一人称を持つ他キャラクターについてはfirstPersonチェックの対象から除外するよう修正した。
  - 新規テンプレート`utterance/tone_retry.md`を`class-design.md` 10.1章・`architecture.md` 8章のプロンプト一覧に追記した（implementation-rules.md 6章）。
  - `TurnResult`にリトライ回数フィールドを追加する案も検討したが、`server`側の`TurnRecord`/`turns`テーブルとのフィールド構成一致（`class-design.md`に明記）を崩すため見送り、`layer:llm`イベントのプロンプト内容（補正指示テキストの有無）で再生成の発火を確認できるようにした。
  **実行環境の制約（未実施）**: 実際のTogether AI（`api.together.xyz`）を用いたE2Eセッション実行（`e2eConversation.ts`）と会話ログレポートのArtifact公開は、本タスクを実施したサンドボックス環境のネットワークegressポリシーにより`api.together.xyz`への接続がプロキシ側で拒否される（403、組織ポリシーによるブロック。プロキシ設定やAPIキーの問題ではないことを`/root/.ccr/README.md`の手順で確認済み）ため実施できなかった。ユニットテストでロジックの正しさ（誤検知修正含む）は検証済み。Together AIへのネットワークアクセスがある環境で`node packages/server/dist/scripts/e2eConversation.js char_a char_b char_c char_d 30 --db=<path>.sqlite`を実行し`exportConversationReport.js`でレポート化することで再現・目視確認できる。

新たに必要なTODOに気づいた場合は、該当フェーズの末尾に追記してから着手する（既存の番号は変更しない。新規は次の番号を採番する）。大きく設計を変える必要が生じた場合は、実装を進める前にユーザーに確認する。
