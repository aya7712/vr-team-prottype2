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

- [ ] **T09. Dialogue Planner（F5）**
  `class-design.md` 8章に従い、`DialogueActCatalog`, `ScoreCalculator`, 各`ModifierResolver`, `SoftmaxSelector`, `SpeechExpectationCalculator`, `DialoguePlanner`を実装する。Modifier係数は外部設定ファイル（`implementation-rules.md`未確定事項→この時点でJSON形式に決定して進めてよい）として `dialoguePlanner/config/` に置く。
  テスト: `features.md` F5.3のスコア計算式、F5.4のSoftmax確率化、同一入力を複数回実行した際に確率的な揺らぎが出ることをユニットテストする。

- [ ] **T10. LLM連携（F7）: Together AIクライアントとプロンプト管理**
  `class-design.md` 10章に従い、`TogetherClient`（既定モデル `google/gemma-3n-E4B-it`）, `PromptTemplateLoader`, `PromptBuilder`, `OutputParser` を実装する。`packages/engine/prompts/utterance/base.md` 等、最低限のテンプレートを`implementation-rules.md` 6章のルールに沿って作成する。
  テスト: `PromptBuilder`のプレースホルダー置換をユニットテストする（LLM実呼び出しはモックする）。`.env.example`に`TOGETHER_API_KEY`, `TOGETHER_MODEL`を追加する。

- [ ] **T11. Together AI疎通確認（実APIを1回だけ呼ぶ検証）**
  `google/gemma-3n-E4B-it` に対して実際にAPIキーを使い1リクエストを送り、応答が返ることを手動確認する（自動テストにはしない。CIでAPIキーを使う自動テストは追加しない）。結果と手順を本TODOのコミットメッセージまたはPRメモに残す。
  テスト: 手動確認のみ。

- [ ] **T12. Conversation Manager（F6, 2体会話版）**
  `class-design.md` 9章に従い、`ConversationManager.runTurn` / `runSession` を実装する。`SpeakerSelector`はこの時点では「常に相手を返す」最小実装でよい（3〜4体対応はT19）。`architecture.md` 6章のシーケンス通りに各ステップでイベントを発行する。
  テスト: T05〜T10のモック/フェイクを組み合わせた統合テストとして、2体・数ターンの`runSession`が例外なく完走し、`TurnResult`が期待するフィールドを持つことを確認する。

- [ ] **T13. Turn Logger / EventBus（F8, Engine側）**
  `class-design.md` 11章に従い、`EngineEventBus`を実装し、T12の`ConversationManager`から各レイヤーイベントが発行されることを確認する。
  テスト: イベント購読時に想定した`LayerEventName`と`payload`が発行されることをユニットテストする。

---

## フェーズ2: Server（永続化・API・配信）

- [ ] **T14. SQLiteスキーマ・マイグレーション**
  `data-design.md` 5章のCREATE TABLE群を`packages/server/src/db/schema.sql`として作成し、起動時に適用する`migrate.ts`を実装する。`better-sqlite3`を導入する。
  テスト: マイグレーション実行後、全テーブルが期待通りのカラムで作成されることをテストする。

- [ ] **T15. キャッシュ同期・MemoryRepository実装・意味検索**
  `data-design.md` 4章・6章に従い、`server`起動時にT04の`CharacterDefLoader`結果を`characters_cache`/`memory_preset_cache`へ書き込む処理を実装する。`EmbeddingService`（Together AI Embeddings API）と`memory_embeddings`テーブルを実装し、`MemoryRepositoryImpl`（`MemoryRepository`の本実装、FTS5＋コサイン類似度のハイブリッド検索）を実装してT07のフェイクと差し替える。
  テスト: 実際の`character_def`データを取り込んだ状態で、キーワード検索・意味検索それぞれで期待する記憶が上位に来ることを確認するテストを書く（Embedding生成は課金が発生するため、テストではモックまたは事前計算済みベクトルを使う）。

- [ ] **T16. Session/Turn/Feedback Repository**
  `class-design.md` 13章に従い、`SessionRepository`, `TurnRepository`, `FeedbackRepository`を実装する。
  テスト: CRUD操作のユニットテスト。

- [ ] **T17. REST API（セッション管理・ターン取得）**
  `architecture.md` 7章のエンドポイント一覧に従い、`POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/turns`, `GET /api/sessions/:id/turns/:turnNo`, `POST /api/sessions/:id/turns/:turnNo/feedback`, `POST /api/sessions/:id/run`, `POST /api/sessions/:id/stop` を実装する。
  テスト: 各エンドポイントのリクエスト/レスポンスをHTTPレベルで検証する統合テストを書く。

- [ ] **T18. WebSocket Gateway・TurnOrchestrator**
  `class-design.md` 13章に従い、`TurnOrchestrator`が`ConversationManager.runSession`を実行しつつ`turns`/`turn_layer_events`へ永続化し、`ws/gateway.ts`が`EngineEventBus`のイベントをWebSocketでブロードキャストすることを実装する。
  テスト: WebSocketクライアントを模擬し、`POST /run`実行中に`architecture.md` 7章のイベント一覧が想定順序で届くことを確認する。

- [ ] **T19. 2体・50ターン結合テスト**
  実際に`google/gemma-3n-E4B-it`を使い、2キャラクターで50ターンの会話を生成するE2Eスクリプトを作成する（自動テストではなく手動実行スクリプトでよい）。`requirements.md` 7.1の成功基準（Dialogue Actの多様性、共有記憶の参照、話題転換が3回以上、後半のドリフトがないこと等）を目視確認し、結果をメモとして残す。
  テスト: スクリプト実行と結果目視確認。問題があれば該当TODOへ差し戻して修正する。

---

## フェーズ3: UI（モニタリング画面）

- [ ] **T20. UI基盤・デザイントークン**
  `ui-design-rules.md` 2〜3章に従い、Vite+Reactプロジェクトを`packages/ui`に構築し、CSS変数によるニュートラルカラーパレット（ライト/ダーク対応）とタイポグラフィの基本スタイルを定義する。`getReadableTextColor`ユーティリティ関数を実装する。
  テスト: `getReadableTextColor`のユニットテスト（複数の背景色パターンでのコントラスト判定）。ビルドが通ることを確認する。

- [ ] **T21. WebSocket購読フック・REST APIクライアント**
  `class-design.md` 14章に従い、`useEngineEvents`フックと`api/client.ts`を実装する。
  テスト: モックWebSocketサーバーに対する接続・イベント受信のユニットテストを書く。

- [ ] **T22. リアルタイム会話ビュー（F9.1）**
  `features.md` F9.1、`ui-design-rules.md` 2.2の「チャットバブル」ルールに従い実装する。発話者のキャラクターカラーをバブル左ボーダー・発言者名に適用する。
  テスト: モックデータでのコンポーネントテスト（スナップショットまたはRTLでの表示確認）。`npm run dev`で実際にブラウザ表示を確認する。

- [ ] **T23. パラメータダッシュボード（F9.2）**
  `features.md` F9.2、`ui-design-rules.md` 2.2の該当ルールに従い、キャラクター別状態カード・ConversationState表示・Topicツリー・Relationship Matrixを実装する。
  テスト: モックデータでのコンポーネントテスト。ブラウザでの目視確認。

- [ ] **T24. レイヤー別計算過程ビュー（F9.3）**
  `features.md` F9.3、`ui-design-rules.md` 5章に従い、Dialogue Actスコア内訳テーブル・選択Actのハイライト・折りたたみ式プロンプトビューアを実装する。
  テスト: モックデータでのコンポーネントテスト。ブラウザでの目視確認。

- [ ] **T25. ログ閲覧（F9.4）**
  `features.md` F9.4（検索機能なし）に従い、過去ターンの一覧とターン選択時のF9.2/F9.3再利用表示を実装する。
  テスト: モックデータでのコンポーネントテスト。

- [ ] **T26. 人手評価入力（F9.5）**
  `features.md` F9.5に従い、表示中ターンへの自然/不自然評価とコメント入力UIを実装し、`POST /api/sessions/:id/turns/:turnNo/feedback`と接続する。
  テスト: フォーム送信のコンポーネントテスト、APIモックでの送信確認。

- [ ] **T27. UI結合確認（2体会話）**
  T19の50ターン会話をUIに接続した状態で実行し、F9.1〜F9.5が一通り機能することをブラウザで確認する（`run`スキルを使用）。
  テスト: 手動確認。問題点があれば該当TODOに差し戻す。

---

## フェーズ4: 多人数会話（3〜4体）拡張

- [ ] **T28. Relationship Graphの4体全ペア対応確認**
  T06のグラフ構築が4体・6ペアで初期化漏れなく動作することを確認し、不足があれば修正する（`features.md` F2.1）。
  テスト: 4体構成でのユニットテスト追加。

- [ ] **T29. Speaker Selection（F6.2）本実装**
  `class-design.md` 9章、`features.md` F6.2に従い、`SpeakerSelector`を本実装する（名指し優先・発話頻度バランス・積極性・関係性を考慮したスコアリングと確率選択）。
  テスト: 4体構成で、特定キャラだけが発話し続けない（`requirements.md` 7.2の基準）ことを複数回試行で確認するテストを書く。

- [ ] **T30. 話題の分岐・合流（F6.3）**
  `class-design.md` 9章、`features.md` F6.3に従い、`TopicBranchMerger`を実装する。
  テスト: サブグループでの話題分岐が発生するケース、合流条件を満たした際にマージされるケースをユニットテストする。

- [ ] **T31. 4体・結合テスト**
  4キャラクターでの会話生成をE2Eスクリプトで実行し、`requirements.md` 7.2の成功基準（発話機会の分配、名指し誘導、6ペア関係の破綻なし、話題の分岐/合流）を確認する。
  テスト: スクリプト実行と結果目視確認。

- [ ] **T32. UIの4体対応確認**
  F9.1〜F9.4が4体構成でも破綻なく表示されること（キャラクターカラー4色の同時表示、Relationship Matrixの6ペア表示等）をブラウザで確認する。
  テスト: 手動確認。

---

## 未着手事項の追加について

新たに必要なTODOに気づいた場合は、該当フェーズの末尾に追記してから着手する（既存の番号は変更しない。新規は次の番号を採番する）。大きく設計を変える必要が生じた場合は、実装を進める前にユーザーに確認する。
