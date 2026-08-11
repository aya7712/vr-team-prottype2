# AI会話エンジン 実装ルール（プロトタイプ版）

対象参照: `architecture.md`, `class-design.md`, `data-design.md`

本ドキュメントは実装時にチーム/AIエージェントが従うべき規約をまとめる。プロトタイプであるため「厳格さ」より「一貫性・迷わないこと」を優先する。

## 1. 全体方針

- `class-design.md`のパッケージ構成・クラス割り当てに従う。新しい責務を追加する際は、まずF1〜F9のどの機能に属するかを`features.md`で確認し、対応するディレクトリに配置する。どれにも当てはまらない場合は先にfeatures.mdへの追記を検討する（コードだけが仕様を持つ状態を避ける）。
- **Engine（`packages/engine`）はSQLite・WebSocket・Express等のI/O実装を直接importしない。** 必要な永続化・外部アクセスは`class-design.md` 6章の`MemoryRepository`のようにインターフェースを定義し、`server`層で実装して注入する。
- 迷ったときは「プロトタイプとして最も単純な実装」を選ぶ（`architecture.md` 1章の優先順位に従う）。将来の拡張性より今の実装コストを優先してよい。

## 2. 言語・型付けルール

- 全パッケージ TypeScript、`strict: true`を有効にする。`any`は原則禁止。外部API(Together AI等)のレスポンスなど型が不明な箇所は`unknown`で受けてから型ガードする。
- 共有型は`packages/engine/src/types/`に集約し、`server`/`ui`からは`@engine/types`のようなpathエイリアスで参照する（型の二重定義を避ける）。
- ドメイン用語（`CharacterState`, `DialogueAct`等）は`features.md`/`data-design.md`の用語と綴りを完全一致させる。日本語の概念に英語名を当てる際、ドキュメント側の用語一覧（`requirements.md` 6章）を正とする。

## 3. 命名規約

| 対象 | 規約 | 例 |
|---|---|---|
| クラス/型/interface | PascalCase | `DialoguePlanner`, `RelationshipEdge` |
| 関数/変数/メソッド | camelCase | `updateAfterTurn` |
| ファイル名（クラス1つ主体） | クラス名と一致（PascalCase） | `DialoguePlanner.ts` |
| ファイル名（関数群/ユーティリティ） | camelCase | `modifierWeights.ts` |
| DBテーブル/カラム | snake_case | `long_term_memory_fts`, `memory_id` |
| WebSocketイベント名 | `名詞:動詞` のnamespace形式 | `layer:topic`, `turn:complete`（`class-design.md` 11章に準拠） |
| 環境変数 | UPPER_SNAKE_CASE | `TOGETHER_API_KEY`, `CHARACTER_DEF_PATH` |

## 4. ディレクトリ・依存ルール

- `class-design.md` 2章の構成を正とする。1ファイル1クラス（またはクラスに準ずる主要exportひとつ）を基本とし、ファイルを見ればクラス名が分かる状態を保つ。
- パッケージ間の依存方向は `ui → server → engine` のみ許可する。`engine`が`server`や`ui`のコードをimportすることは禁止（`class-design.md` 15章の依存関係図に従う）。
- `engine`内の各機能ドメイン（`character/`, `relationship/`, `topic/`等）は、原則として他ドメインのフォルダを直接importせず、`ConversationManager`（F6）を介して連携する。例外的に密接な連携がある場合（例：`RelationshipManager`が`MemoryRetriever`を使う）は`class-design.md`に明記されている依存のみ許可する。

## 5. 外部I/O・非同期処理

- Together AI呼び出し（chat/embeddings）は`packages/engine/src/llm/`配下のクライアントに集約し、他の場所から直接`fetch`しない。
- 外部APIには最小限のリトライ（1回）とタイムアウト（10秒）を設定する（`architecture.md` 9章）。エラー時はプロトタイプなので複雑なフォールバックを作らず、例外をそのまま上位に伝播させてログに残す。
- SQLiteアクセスは`server/src/db/repositories/`のRepositoryクラス経由のみとし、`routes`や`services`から直接SQLを書かない。

## 6. プロンプトテンプレート運用ルール（F7.1a関連）

- プロンプト文面はコードにハードコードせず、必ず`packages/engine/prompts/**/*.md`に置く。
- プレースホルダーは`{{camelCase変数名}}`で統一し、`PromptBuilder`が受け取る変数名と1対1で一致させる。
- テンプレートを追加・変更したら、`class-design.md`の対応するプロンプト一覧（該当箇所がなければ本ファイルまたは`data-design.md`）に追記する。

## 7. ログ・イベント命名ルール（F8関連）

- `EngineEventBus`で発行するイベントは`class-design.md` 11章の`LayerEventName`型に定義されたものだけを使う。新しいレイヤーイベントを増やす場合は型定義を先に更新する。
- ログに個人情報・APIキー等の機密情報を含めない（`.env`の値をログ出力しない）。

## 8. テスト方針

- `engine`パッケージは外部I/Oを持たないため、Vitest等でのユニットテストを主体とする。特に`ScoreCalculator`（F5.3）、`TopicParameterUpdater`（F4.3）、`RelationshipUpdater`（F2.4）のような数値計算ロジックは、代表的な入力パターンに対する期待値をテストする。
- Together AI呼び出しはテストでは`LlmClient`インターフェースのモック実装に差し替える（実APIを叩くテストはCIに含めない）。
- UIの自動テストはプロトタイプ段階では必須としない。手動確認（`run`スキルでのブラウザ確認）で代替してよい。

## 9. コミット・変更管理ルール

- ドキュメント（`doc/design/*.md`）と実装が乖離した場合、実装を正とせずドキュメントを更新するか実装をドキュメントに合わせるかをその都度判断し、**必ずどちらかを更新してから次の作業に進む**（サイレントな乖離を残さない）。
- `character_def`リポジトリのファイルは本プロジェクトから変更しない（`data-design.md` 7章）。誤って書き込むコードを追加しないよう、`CharacterDefLoader`は読み込み専用のfs API（`readFile`）のみを使用する。

### 9.1 pre-commitフックによる品質・自己レビュー実施の検証

`packages/`配下（実装コード）の変更を含むコミットに対して、Huskyの`pre-commit`（コミットメッセージ関連の検証は`commit-msg`）フックで以下を**すべて**検証し、**いずれか1つでも失敗した場合はコミットを拒否する**。

1. **フォーマットチェック**: `npm run format:check`（Prettier等の`--check`相当）
2. **Lint**: `npm run lint`
3. **型チェック**: `npm run typecheck`（`tsc --noEmit`、各パッケージへ委譲）
4. **テスト**: `npm run test`
5. **自己レビューtrailerの存在確認**: `doc/todo.md`の運用ルールでは、実装後に必ずサブエージェント（Sonnet固定）へ自己レビューを行わせ、コミットメッセージに以下のtrailerを残すことにしている。
   ```
   Self-Review: <model>, TODO=<TODO番号>, findings=<件数-対応状況>
   ```
   このtrailerが含まれていなければコミットを拒否する。

補足:
- `doc/`のみの変更（設計ドキュメント更新等）は、上記1〜5のすべてを検証対象外とする（フォーマット/lint/typecheck/testはコード変更が無ければ実行する意味が薄く、trailerも実装が無い以上不要なため）。
- 4のtrailerチェックはあくまで「trailerが存在するか」という形式的な検証であり、**レビューの中身の妥当性までは保証しない**。実際にレビューを実施したかどうかは運用（`doc/todo.md`の手順順守）に依存する点に留意する。
- フックの実装は`T03a`（`doc/todo.md`）で行う。

## 10. コードコメント方針

- 「WHYが非自明な場合のみ」コメントを書く（実装の意図・ハマりどころ・仕様上の制約など）。「何をしているか」の説明コメントは書かない（既存のプロジェクト全体方針を踏襲）。
