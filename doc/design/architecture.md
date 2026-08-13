# AI会話エンジン システムアーキテクチャ設計（プロトタイプ版）

対象参照: `requirements.md`, `features.md`

## 1. 設計方針

本ドキュメントは**プロトタイプ**としての実装を前提とする。性能・スケーラビリティは要求しない。優先度は以下の順とする。

1. **Windows 11 + WSL2 のローカル環境だけで完結して動くこと**（外部インフラ・クラウドDB・コンテナオーケストレーション不要）
2. **実装・変更のしやすさ**（要件変更が多い設計検討フェーズのため、疎結合かつ単純な構成にする）
3. **F9（モニタリングUI）でのリアルタイム可視化のしやすさ**
4. 性能・同時実行数・耐障害性は考慮しない（単一ユーザー・単一セッションのローカル実行を想定）

将来、性能要件が発生した場合の拡張余地は「11. 将来のスケールアップ時の変更点」に記載する。

## 2. 全体構成図

```text
┌─────────────────────────── WSL2 (Ubuntu) ───────────────────────────┐
│                                                                      │
│   ┌──────────────────────┐        ┌───────────────────────────┐    │
│   │  Frontend (Vite dev)  │        │   Backend (Node.js)        │    │
│   │  http://localhost:5173│  HTTP  │   http://localhost:3000    │    │
│   │                       │ ─────► │                             │    │
│   │  React + TypeScript   │  WS    │  Express (REST)             │    │
│   │  - リアルタイム会話ビュー│ ◄────► │  ws (WebSocket)              │    │
│   │  - パラメータダッシュ   │        │                             │    │
│   │  - レイヤー別計算過程   │        │  ┌───────────────────────┐  │    │
│   │  - ログ閲覧            │        │  │ Conversation Engine   │  │    │
│   └──────────────────────┘        │  │ (F1〜F6 ロジック層)     │  │    │
│                                     │  └──────────┬────────────┘  │    │
│                                     │             │HTTPS           │    │
│                                     │  ┌──────────▼────────────┐  │    │
│                                     │  │ Together AI Client     │──┼───►│ Together AI API
│                                     │  │ (F7.2)                 │  │    │ (外部・クラウド)
│                                     │  └────────────────────────┘  │    │
│                                     │                             │    │
│                                     │  ┌────────────────────────┐ │    │
│                                     │  │ SQLite (better-sqlite3) │ │    │
│                                     │  │ ・ターンログ (F8.1)      │ │    │
│                                     │  │ ・セッション/キャラ設定   │ │    │
│                                     │  └────────────────────────┘ │    │
│                                     │                             │    │
│                                     │  プロンプトテンプレート        │    │
│                                     │  (テキストファイル, F7.1a)    │    │
│                                     └───────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

- 外部通信は **Together AI API のみ**。それ以外は WSL2内で完結する。
- フロントエンド・バックエンドは同一マシン上の別プロセスとして動作し、`localhost` 上のHTTP/WebSocketで通信する（本番用のドメイン・TLS等は不要）。

## 3. 技術スタック

| 領域 | 採用技術 | 選定理由 |
|---|---|---|
| 言語 | TypeScript（フロント・バック共通） | 型定義（CharacterState等）を共有でき、実装しやすい。requirements.md/features.mdの用語ともTS型で対応させやすい |
| 実行環境 | Node.js（WSL2上のnvm管理） | WSL2で素直に動作し、追加のランタイム導入コストが低い |
| バックエンドフレームワーク | Express | プロトタイプに十分。学習コストが低くAPI数も少数 |
| リアルタイム通信 | `ws`（WebSocketライブラリ） | F8.3のイベントストリーム配信をシンプルに実現。SSEより双方向拡張がしやすい |
| フロントエンド | React + Vite | 開発サーバーの起動が速く、WSL2上でのHMRも問題なく動作する。UIコンポーネント（チャット/ダッシュボード/ツリー表示）の実装が容易 |
| 状態管理（フロント） | Zustand または React Context（軽量なもの） | プロトタイプ規模でReduxは過剰 |
| データ永続化 | SQLite（`better-sqlite3`） | ファイル1つで完結し、WSL2上に別途DBサーバーを立てる必要がない。ターンログ・セッション・キャラクター設定の保存に十分 |
| プロンプト管理 | テキストファイル（Markdown, `prompts/` ディレクトリ）+ 簡易テンプレートエンジン（`{{変数}}`の置換のみの自前実装 or `mustache`） | F7.1aの要件どおり、コード変更なしで編集可能にする |
| LLM連携 | Together AI REST API（`fetch`による直接呼び出し） | 要件どおりTogether AIを採用。LangChain等のフレームワークは使わず薄いクライアントを自作する（既存の検討方針を踏襲） |
| プロセス管理 | なし（`npm run dev` を2プロセス、または `concurrently` で同時起動） | 単一ユーザーのプロトタイプ用途のため、PM2等は不要 |
| コンテナ化 | 使用しない | プロトタイプ段階ではDocker Desktop等の追加セットアップを避け、WSL2のNode.jsに直接依存する構成とする |

## 4. ディレクトリ構成（案）

```text
prottype2/
├── doc/
│   ├── ref/
│   └── design/
├── packages/
│   ├── engine/                 # 会話エンジン本体（F1〜F8）
│   │   ├── src/
│   │   │   ├── character/      # F1 Character Brain
│   │   │   ├── relationship/   # F2 Relationship Engine
│   │   │   ├── memory/         # F3 Memory
│   │   │   ├── topic/          # F4 Topic Analyzer / ConversationState
│   │   │   ├── dialoguePlanner/# F5 Dialogue Planner
│   │   │   ├── conversationManager/ # F6 Conversation Manager
│   │   │   ├── llm/            # F7 LLM連携（Together AIクライアント）
│   │   │   ├── logging/        # F8 ログ・イベント配信
│   │   │   └── types/          # 共有TypeScript型定義
│   │   └── prompts/            # F7.1a プロンプトテンプレート（テキスト管理）
│   │       ├── utterance/      # セリフ生成用
│   │       └── dialogueAct/    # F5.5 Act候補生成用（任意）
│   ├── server/                 # Express + WebSocket API層
│   │   └── src/
│   │       ├── routes/         # REST API（セッション開始・キャラ設定等）
│   │       ├── ws/             # F8.3 イベントストリーム配信
│   │       └── db/             # SQLiteアクセス（F8.1ログ, セッション/キャラ設定）
│   └── ui/                     # F9 モニタリングUI（React）
│       └── src/
│           ├── views/
│           │   ├── ConversationView/      # F9.1
│           │   ├── ParameterDashboard/    # F9.2
│           │   ├── LayerInspector/        # F9.3
│           │   └── LogBrowser/            # F9.4
│           └── state/
└── data/
    └── engine.sqlite            # SQLiteファイル（.gitignore対象）
```

Node.jsの**npm workspaces**を用いたモノレポ構成とし、`engine` / `server` / `ui` を分離しつつ同一リポジトリで管理する（プロトタイプで別リポジトリに分ける必要はない）。

## 5. コンポーネント構成とレイヤーの対応

| コンポーネント | 実装場所 | 対応する要件/機能 |
|---|---|---|
| Character Brain | `packages/engine/src/character` | F1 |
| Relationship Engine | `packages/engine/src/relationship` | F2 |
| Memory Store / Retriever | `packages/engine/src/memory` | F3 |
| Topic Analyzer / ConversationState | `packages/engine/src/topic` | F4 |
| Dialogue Planner | `packages/engine/src/dialoguePlanner` | F5 |
| Conversation Manager（Speaker Selection含む） | `packages/engine/src/conversationManager` | F6 |
| Together AI Client / Prompt Builder | `packages/engine/src/llm` + `packages/engine/prompts` | F7 |
| Turn Logger / Event Emitter | `packages/engine/src/logging` | F8 |
| REST API（セッション管理） | `packages/server/src/routes` | シナリオ入力受付（F6.6）等 |
| WebSocket Gateway | `packages/server/src/ws` | F8.3、F9各画面へのリアルタイム配信 |
| SQLiteリポジトリ | `packages/server/src/db` | F8.1、F8.2、キャラクター/関係性設定の永続化 |
| モニタリングUI | `packages/ui` | F9 全体 |

Engineは**ステートレスな純粋ロジック + 明示的なStateオブジェクト**として実装し、ServerはEngineをラップしてHTTP/WebSocketの入出力・永続化・イベント配信を担当する。この分離により、EngineはUIやDBに依存せず単体テストしやすい構造になる。

## 6. データフロー（1ターンの処理シーケンス）

```text
[Server: Turn Trigger]
      │ (次ターンの実行要求 or 自動連続実行)
      ▼
Conversation Manager
      │ Speaker Selection（3人以上の場合）
      ▼
Topic Analyzer          ── イベント発行 ──► WebSocket ──► UI(F9.3)
      │ 話題継続/転換判定・パラメータ更新
      ▼
Relationship Engine       ── イベント発行 ──► WebSocket ──► UI(F9.2/F9.3)
      │ 話者ペアの関係性取得・補正値算出
      ▼
Character Brain            ── イベント発行 ──► WebSocket ──► UI(F9.2)
      │ 感情/目標/意図更新
      ▼
Dialogue Planner            ── イベント発行 ──► WebSocket ──► UI(F9.3)
      │ Act候補スコア計算 → Softmax → 確率選択
      ▼
Memory Retriever              ── イベント発行 ──► WebSocket ──► UI(F9.3)
      │ 関連する自己記憶/共有記憶を検索
      ▼
Prompt Builder（テキストテンプレート読込 + 変数埋め込み）
      ▼
Together AI Client（google/gemma-3n-E4B-it 等）
      │ セリフ生成                        ── イベント発行 ──► WebSocket ──► UI(F9.1/F9.3)
      ▼
Turn Logger（SQLiteへ書き込み: F8.1）
      ▼
[次ターンへ]
```

- 各ステップの完了時に、Serverの WebSocket Gateway がその中間結果（スコア内訳・状態値・プロンプト全文など）をイベントとしてUIへプッシュする（F8.3/可観測性の非機能要件に対応）。
- Engine自体は同期的にステップを実行してよい（プロトタイプであり並行処理・キューイングは不要）。1ターンあたりの処理時間はTogether AI呼び出しのレイテンシが支配的で、体感数百ms〜数秒を許容する。

## 7. API / インターフェース概要（プロトタイプ最小構成）

### REST（Express）
| メソッド/パス | 用途 |
|---|---|
| `GET /api/characters` | キャラクター一覧（id/name/furigana/color）取得。`ui-design-rules.md` 2.2のキャラクターカラー取得元としてUIが利用する（T22で追加） |
| `POST /api/sessions` | 新規会話セッション作成（参加キャラクター2〜4体、シナリオ設定を受付：F6.6） |
| `GET /api/sessions/:id` | セッション情報取得 |
| `GET /api/sessions/:id/turns` | 過去ターンログ一覧取得（F9.4） |
| `GET /api/sessions/:id/turns/:turnNo` | 特定ターンの詳細（各レイヤー計算内訳含む：F9.3） |
| `POST /api/sessions/:id/turns/:turnNo/feedback` | 人手評価（自然/不自然）の登録（F8.2/F9.5） |
| `POST /api/sessions/:id/run` | 会話の自動連続生成を開始（指定ターン数、例：50） |
| `POST /api/sessions/:id/stop` | 連続生成の停止 |

### WebSocket（`ws`）
| イベント名 | ペイロード概要 |
|---|---|
| `turn:start` | ターン番号、話者候補 |
| `layer:topic` | Topic Analyzerの計算結果 |
| `layer:relationship` | Relationship Engineの計算結果 |
| `layer:character` | Character Brainの更新後状態 |
| `layer:dialoguePlanner` | Act候補スコア内訳・確率分布・選択結果 |
| `layer:memory` | 想起された記憶一覧 |
| `layer:llm` | 送信プロンプト全文・LLM生出力 |
| `turn:complete` | 最終セリフ、ターンサマリ |

UIはWebSocket接続時に直近セッションのイベントをそのまま購読し、F9.1〜F9.3をリアルタイム更新する。F9.4（ログ閲覧）はRESTのターン取得APIを用いて過去ログを表示し、同じUIコンポーネントで再描画する。

## 8. プロンプト管理の実装方針（F7.1a対応）

```text
packages/engine/prompts/
├── utterance/
│   ├── base.md              # 共通の指示文（キャラクター設定・関係性・Dialogue Actを踏まえて一言だけ話す、等）
│   ├── with_shared_memory.md# 共有記憶を参照させたい場合の追加テンプレート
│   └── ...
└── dialogueAct/
    └── candidate_selection.md  # F5.5 小型LLMによるAct候補提案用（任意機能）
```

- テンプレートは `{{characterName}}`, `{{emotion}}`, `{{dialogueAct}}`, `{{retrievedMemory}}` 等のプレースホルダーを含むテキストファイルとして管理する。
- 実行時に`Prompt Builder`がテンプレートを読み込み、Character Brain/Dialogue Planner/Memory Retrieverの出力を差し込んで最終プロンプトを構築する。
- テンプレートファイルの変更はNode.jsプロセスの再起動なしに反映されるよう、開発時はファイル変更を都度読み込む（キャッシュしない、またはmtimeで無効化する）簡易ホットリロードとする。

## 9. Together AI連携（F7.2対応）

- 環境変数 `TOGETHER_API_KEY` をローカルの `.env`（`.gitignore`対象）で管理する。**このプロトタイプの開発環境（WSL2）では `TOGETHER_API_KEY` はOS環境変数として既に設定済み**であり、`.env`に値を書かなくても`process.env.TOGETHER_API_KEY`から取得できる。実装は`.env`の存在有無に関わらず、まずOS環境変数を参照する（`dotenv`等で読み込む場合も、既存のOS環境変数を上書きしない設定にする）。他の環境（CI等）に持ち出す場合のために`.env.example`には`TOGETHER_API_KEY=`のキー名のみ記載し、値は書かない。
- モデルIDを環境変数 `TOGETHER_MODEL`（既定値 `google/gemma-3n-E4B-it`）で切り替え可能にする。
- 呼び出しは `packages/engine/src/llm/togetherClient.ts` に集約し、Together AI REST API (`POST https://api.together.xyz/v1/chat/completions` 相当) を `fetch` で直接呼び出す薄いラッパーとする（LangChain等は使用しない）。
- リトライ・タイムアウトはプロトタイプのため最小限とする（1回リトライ、60秒タイムアウト、リトライ前5秒待機。当初10秒タイムアウト・待機なしとしていたが、T19のE2E確認で一部モデル（例: google/gemma-4-31B-it）の応答が14〜38秒程度と不安定・低速であること、およびTogether AI側の一時的な500エラーが連続し待機なしのリトライでは回復を待てないことが判明したため、60秒タイムアウト・5秒待機に変更した）。

## 10. ローカル起動手順（想定）

```bash
# WSL2 (Ubuntu) 上で実行
git clone <repo>
cd prottype2
npm install                # npm workspaces で engine/server/ui 一括インストール

cp .env.example .env       # TOGETHER_API_KEY を設定

npm run dev                # concurrently で server(3000) と ui(5173) を同時起動
```

- `data/engine.sqlite` は初回起動時にマイグレーションスクリプトで自動作成する。
- ブラウザ（WindowsホストのChrome等）から `http://localhost:5173` にアクセスすればUIを閲覧できる（WSL2 + Windowsのlocalhostフォワーディングは標準で機能する）。

## 11. 将来のスケールアップ時の変更点（本フェーズでは対応不要）

プロトタイプ後に性能・多人数同時利用が必要になった場合の変更方針を参考として記載する（現時点では実装しない）。

- SQLite → PostgreSQL等への移行
- Express単体構成 → 複数プロセス/コンテナ化（Docker）
- WebSocket Gateway のスケールアウト（Redis Pub/Sub等でのイベント配信の水平分散）
- Together AI呼び出しのキューイング・並列制御（複数セッション同時実行時のレート制御）

## 12. 未決事項・要確認事項

- フロントエンドの状態管理ライブラリ（Zustand想定）は実装時に確定する
- プロンプトテンプレートエンジンを自前の`{{}}`置換のみにするか、`mustache`等の軽量ライブラリを使うかは実装時に決定する
- Speaker Selection（F6.2）やTopicの分岐・合流（F6.3）は3〜4体フェーズでの実装であり、本アーキテクチャのAPI/イベント設計は2体フェーズの範囲で最小限とし、拡張時にイベントペイロードへ`targetCharacterIds`等を追加する形で対応する
