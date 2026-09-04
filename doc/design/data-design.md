# AI会話エンジン データ設計（プロトタイプ版）

対象参照: `requirements.md`, `features.md`, `architecture.md`

## 1. 方針

- キャラクターの静的設定と長期記憶プリセットは、**本プロジェクト外の別リポジトリ `character_def`** が正（Source of Truth）である。本エンジンはこれらを**読み取り専用**で取り込み、書き込み・改変は行わない（`character_def` 側のバリデーション・生成フロー — `/generate-memory`, `cron_generate_memory.sh` 等 — を尊重する）。
- 会話中に発生する動的データ（感情・関係性数値の変動・会話ログ・想起履歴等）は本エンジンが所有し、**SQLite**（`data/engine.sqlite`）に保存する。
- 「長期記憶」は、`character_def/memory` のプリセット記憶と、本エンジンの会話ログ由来のデータの**両方を統合したもの**として扱う（ユーザー指示に基づく）。検索インターフェースはこの2種類を区別せず横断的に扱えるようにする。
- プロトタイプであり、外部依存を増やさない方針（`architecture.md` 1章）に従い、ベクトルDBやFTS拡張の追加導入はせず、SQLite標準機能（**FTS5**は多くのビルドで標準搭載）とアプリ側計算で完結させる。

## 2. データ種別一覧

| # | データ種別 | 所有者/正 | 保存場所 | 対応要件/機能 |
|---|---|---|---|---|
| D1 | キャラクター静的設定（メイン） | `character_def`リポジトリ | `character_def/design/main/*.yaml`（外部ファイル） | F1（性格・関係性初期値）、F2（relationships初期値） |
| D2 | キャラクター静的設定（脇役） | `character_def`リポジトリ | `character_def/design/sub/*.yaml`（外部ファイル） | Shared Memoryのparticipants解決 |
| D3 | 長期記憶プリセット | `character_def`リポジトリ | `character_def/memory/<owner>/*.md`（外部ファイル、YAML frontmatter+本文） | F3.2 Shared Memory / F3.3 長期記憶 |
| D4 | キャラクター実行時状態（emotion/energy/goal/intent） | 本エンジン | SQLite（セッション中は主にオンメモリ、ターン単位でログへ永続化） | F1 |
| D5 | 関係性の動的パラメータ（trust/intimacy/respectの変動値、Relationship Story追加分） | 本エンジン | SQLite | F2.4 |
| D6 | 会話状態（ConversationState / Topicツリー） | 本エンジン | SQLite（セッション中は主にオンメモリ、ターン単位でログへ永続化） | F4 |
| D7 | 短期記憶（直近数ターンの会話履歴） | 本エンジン | オンメモリのみ（永続化しない。ターンログD9に含まれる形で結果的に残る） | F3.3 |
| D8 | 会話ログ由来の長期記憶（セッション中に生成された特筆すべき出来事） | 本エンジン | SQLite | F3.3、本チケットの「会話ログを長期記憶に含める」要求 |
| D9 | ターンログ（各レイヤーの入出力・選択結果） | 本エンジン | SQLite | F8.1 |
| D10 | 記憶の想起履歴 | 本エンジン | SQLite | F3.4、7.1「記憶・話題の重複回避」 |
| D11 | 人手評価（自然/不自然） | 本エンジン | SQLite | F8.2 / F9.5 |
| D12 | プロンプトテンプレート | 本プロジェクト | `packages/engine/prompts/**/*.md`（テキストファイル） | F7.1a |
| D13 | Embeddingベクトル（D3・D8向け） | 本エンジン（生成キャッシュ） | SQLite（`BLOB`） | 4章「長期記憶の検索方針」 |

## 3. 保存場所の全体像

```text
character_def/ (別リポジトリ、読み取り専用)
├── design/main/*.yaml   ──┐
├── design/sub/*.yaml     ─┤  起動時に読み込み → キャッシュ
└── memory/<owner>/*.md   ─┘  (D1,D2,D3)
                              │
                              ▼
        ┌───────────────────────────────────┐
        │   packages/engine/src/data/         │
        │   CharacterDefLoader                │
        │   （YAML/Markdown parser, 差分検知） │
        └───────────────────┬─────────────────┘
                             │ 取り込み・Embedding生成
                             ▼
        ┌────────────────────────────────────────────┐
        │         data/engine.sqlite                   │
        │                                              │
        │  [キャッシュ]                                  │
        │   characters_cache, sub_characters_cache      │
        │   memory_preset_cache  (D3)                   │
        │                                              │
        │  [エンジン所有データ]                           │
        │   sessions, relationship_state (D5)           │
        │   topics, turns, turn_layer_events (D6,D9)    │
        │   long_term_memory (D3+D8統合ビュー)            │
        │   memory_recall_log (D10)                     │
        │   turn_feedback (D11)                         │
        │                                              │
        │  [検索用]                                      │
        │   long_term_memory_fts (FTS5仮想テーブル)       │
        │   memory_embeddings (BLOB, D13)               │
        └────────────────────────────────────────────┘

packages/engine/prompts/**/*.md   … D12（Gitでバージョン管理、SQLiteに保存しない）
```

## 4. 外部リポジトリ（character_def）由来データの取り込み方針

### 4.1 読み込みタイミング
- **エンジン起動時（プロセス起動時）に一括読み込み**し、`characters_cache` / `sub_characters_cache` / `memory_preset_cache` に反映する（フル再構築）。
- 開発中に`character_def`側のファイルを編集した場合に備え、開発モードではファイル変更監視（`chokidar`等）による再読み込みも可能にする（本番運用は考慮しないプロトタイプのため必須ではない）。
- 参照パスは環境変数 `CHARACTER_DEF_PATH`（既定値 `/home/sora_55/workspace/vr-team/character_def`）で設定可能にし、WSL2上のパス変更に対応する。

### 4.2 キャラクター静的設定（D1, D2）の取り込み
- `design/main/*.yaml` をパースし、`personality` / `tone_sample` / `vocabulary` / `ng_topics` / `relationships`（相手キャラID・呼称・関係の説明文）/ `unit_context` / `llm`（モデル・temperature推奨値）をそのまま `characters_cache` へ格納する。
- `relationships` フィールドは、F2 Relationship Graphの**初期値**として利用する（`type`は`description`から要約、または当面はdescriptionをそのままエッジのメタ情報として保持し、`trust`/`intimacy`等の数値は初期値をデフォルト値から開始し会話を通じて更新する。既存YAMLに数値の初期値定義がないため、初期値は本エンジン側で定めるコンフィグとする）。
- `design/sub/*.yaml` は、Shared Memoryの`participants`に登場する脇役の名称解決用に読み込む（脇役自身はCharacter Brainを持たず、発話もしない）。
- `tone_exemplars_json`（Issue #5「口調間違い」対応）のみ`design/main`由来ではなく、4.3のD3（長期記憶プリセット）から`ToneExemplarSelector`が導出する派生データである。`character_def`から直接取り込む他のフィールドと区別するため、ここに明記する。

### 4.3 長期記憶プリセット（D3）の取り込み
- `memory/<owner>/*.md` をYAML frontmatter + 本文としてパースし、`memory_preset_cache` へ格納する。主な列は README.md記載の項目に準拠: `id`, `owner`, `participants`, `occurred_at`, `occurred_era`, `location`, `summary`, `tags`, `importance`, `emotion`, `shareable`, `related`, 本文（`body`）。
- `shareable: false` の記憶は、**他キャラクターとの会話中の発話材料としては利用しない**（Memory Retrieverで除外する）。ただし当該キャラクター自身の内的な感情バイアス計算（例：ある話題への忌避感）には使ってよい、という区別をMemory Retriever側のフィルタ条件として持たせる。
- `related` は関連記憶同士のリンクとして保持し、1件の記憶が想起された際に関連記憶も合わせて候補に上げられるようにする。

## 5. テーブル構成（SQLite）

### 5.1 キャッシュ系（character_defの取り込み結果、起動時に洗い替え）

```sql
CREATE TABLE characters_cache (
  id              TEXT PRIMARY KEY,     -- 'char_a' 等、design/main のファイル名由来
  name            TEXT NOT NULL,
  furigana        TEXT,
  color           TEXT NOT NULL,        -- ui-design-rules.md 2.2: キャラクター識別色の唯一の情報源。
                                         -- T15で判明した欠落を追記（design/main/*.yamlのcolorフィールド由来）
  age             INTEGER,
  gender          TEXT,
  first_person    TEXT,
  personality     TEXT,
  tone_sample     TEXT,
  tone_exemplars_json TEXT,             -- JSON配列。ToneExemplarSelector出力（Issue #5対応、
                                         -- migrate.tsのマイグレーションversion 3で追加）
  vocabulary_json TEXT,                 -- JSON配列
  ng_topics_json  TEXT,                 -- JSON配列
  unit_context_json TEXT,               -- JSON
  llm_json        TEXT,                 -- JSON（provider/model/temperature）
  raw_yaml_path   TEXT NOT NULL,        -- 参照元ファイルパス（デバッグ用）
  loaded_at       TEXT NOT NULL
);

CREATE TABLE character_relationships_cache (
  character_id       TEXT NOT NULL REFERENCES characters_cache(id),
  target_character_id TEXT NOT NULL,
  address            TEXT,              -- 相手への呼称
  description        TEXT,              -- 関係の説明文（design/main由来）
  PRIMARY KEY (character_id, target_character_id)
);

CREATE TABLE sub_characters_cache (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  raw_yaml_path   TEXT NOT NULL,
  loaded_at       TEXT NOT NULL
);

CREATE TABLE memory_preset_cache (
  id              TEXT PRIMARY KEY,     -- 'mem_a_0001' 等
  owner           TEXT NOT NULL REFERENCES characters_cache(id),
  participants_json TEXT NOT NULL,      -- JSON配列
  occurred_at     TEXT,                 -- 'YYYY-MM-DD' or NULL
  occurred_era    TEXT,
  location        TEXT,
  summary         TEXT NOT NULL,
  tags_json       TEXT NOT NULL,        -- JSON配列
  importance      INTEGER NOT NULL,     -- 1-5
  emotion         TEXT,
  shareable       INTEGER NOT NULL,     -- 0/1
  related_json    TEXT,                 -- JSON配列 or NULL
  body            TEXT NOT NULL,
  raw_md_path     TEXT NOT NULL,
  loaded_at       TEXT NOT NULL
);
```

### 5.2 エンジン所有データ（セッション実行に伴い書き込まれる）

```sql
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  participant_ids_json TEXT NOT NULL,   -- 参加キャラクターID (2〜4体)
  created_at        TEXT NOT NULL,
  status            TEXT NOT NULL,      -- running / stopped / completed
  initial_topic     TEXT NOT NULL       -- 最初のトピック（必須、F6.6、T35でALTER TABLEにより追加）
);
-- scenario_json（テーマ・制約・尺、F6.6の当初案）はT35でF6.6が「最初のトピック」に
-- スコープダウンされて以降、UI/APIから設定されることのない未使用列だったためT39でDROPした
-- （ALTER TABLE DROP COLUMNによるマイグレーション、`migrate.ts` version 2）。

CREATE TABLE relationship_state (
  session_id          TEXT NOT NULL REFERENCES sessions(id),
  character_id         TEXT NOT NULL,
  target_character_id  TEXT NOT NULL,
  trust                REAL NOT NULL,
  intimacy             REAL NOT NULL,
  respect              REAL NOT NULL,
  updated_at_turn       INTEGER NOT NULL,
  PRIMARY KEY (session_id, character_id, target_character_id)
);
-- 初期値は character_relationships_cache を元にコンフィグのデフォルト値から算出し、
-- ターンごとの更新結果のみここに保存する（初期設定自体は都度キャッシュから再構成可能なため冗長保存しない）。

CREATE TABLE topics (
  id              TEXT PRIMARY KEY,      -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  parent_topic_id TEXT,
  label           TEXT NOT NULL,
  depth           INTEGER NOT NULL,
  energy          REAL NOT NULL,
  novelty         REAL NOT NULL,
  life            REAL NOT NULL,
  emotionality    REAL,
  unresolved      INTEGER NOT NULL,      -- 0/1
  last_mention_turn INTEGER,
  created_at_turn INTEGER NOT NULL
);

CREATE TABLE turns (
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  turn_no         INTEGER NOT NULL,
  speaker_id      TEXT NOT NULL,
  target_ids_json TEXT,                  -- targetCharacterIds（3人以上向け, F6.2）
  topic_id        TEXT REFERENCES topics(id),
  dialogue_act    TEXT NOT NULL,
  utterance       TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_no)
);

CREATE TABLE turn_layer_events (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  layer           TEXT NOT NULL,         -- 'topic' | 'relationship' | 'character' | 'dialoguePlanner' | 'memory' | 'llm'
  payload_json    TEXT NOT NULL,         -- スコア内訳・プロンプト全文等、レイヤー毎に自由形式のJSON
  created_at      TEXT NOT NULL,
  FOREIGN KEY (session_id, turn_no) REFERENCES turns(session_id, turn_no)
);
-- F8.1/F9.3向け。1ターンにつきレイヤー数分（最大6行程度）のレコードが入る。

CREATE TABLE session_memories (
  id                TEXT PRIMARY KEY,     -- 'mem_session_<sessionId>_<連番>'
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  owner             TEXT,                 -- 単独の記憶ならowner、複数キャラ共有ならNULL可
  participants_json TEXT NOT NULL,
  origin_turn_no    INTEGER NOT NULL,     -- どのターンから生まれた記憶か
  summary           TEXT NOT NULL,
  tags_json         TEXT NOT NULL,
  importance        INTEGER NOT NULL,
  emotion           TEXT,
  shareable         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);
-- D8: 会話ログから生まれた長期記憶。本フェーズでは自動抽出は対象外（features.md 10章）のため、
-- 当面は空でもよいテーブルとして用意しておき、将来の自動抽出機能や手動登録の受け皿とする。

CREATE TABLE memory_recall_log (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  memory_id        TEXT NOT NULL,         -- memory_preset_cache.id または session_memories.id
  memory_source     TEXT NOT NULL,        -- 'preset' | 'session'
  created_at      TEXT NOT NULL
);
-- F3.4 / 7.1「記憶・話題の重複回避」用。直近で想起した記憶を除外・減衰させる判定に使う。

CREATE TABLE turn_feedback (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  rating          TEXT NOT NULL,          -- 'natural' | 'unnatural'
  comment         TEXT,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_no)
);
```

### 5.3 検索用テーブル（4章で詳細）

```sql
-- FTS5仮想テーブル（キーワード全文検索用）
CREATE VIRTUAL TABLE long_term_memory_fts USING fts5(
  memory_id UNINDEXED,
  memory_source UNINDEXED,   -- 'preset' | 'session'
  owner UNINDEXED,
  summary,
  tags,
  body
);

-- Embeddingキャッシュ（意味検索用）
CREATE TABLE memory_embeddings (
  memory_id     TEXT PRIMARY KEY,
  memory_source TEXT NOT NULL,     -- 'preset' | 'session'
  model         TEXT NOT NULL,     -- embedding生成に使ったモデルID
  vector        BLOB NOT NULL,     -- Float32Arrayをバイト列化したもの
  updated_at    TEXT NOT NULL
);
```

`long_term_memory_fts` と `memory_embeddings` はいずれも `memory_preset_cache`（D3, character_defの起動時同期）と `session_memories`（D8, エンジンが会話中に生成）の**両方**を対象に構築する。アプリケーション層（Memory Retriever）から見ると、この2テーブルを通じて「長期記憶」は発生源を意識せず横断的に検索できる（4章）。

## 6. 長期記憶の検索方針（全文検索・意味検索）

### 6.1 なぜベクトルDB拡張を使わないか
- 前回の検討（会話ログ参照）のとおり、想定データ規模はキャラクター4体×記憶数十〜数百件程度であり、`sqlite-vec`等のネイティブ拡張をWSL2にビルド・ロードするコストに見合わない。
- SQLiteに標準搭載されることが多い **FTS5** をキーワード全文検索に用い、意味検索（embedding類似度）はアプリケーション側（Node.js）でコサイン類似度を計算する**ハイブリッド方式**とする。
- **既知の制約（T14で判明）**: FTS5のデフォルトトークナイザ（unicode61）は日本語の分かち書きに対応しておらず、`MATCH 'ボルダリング'`のような部分文字列検索は`'ボルダリングの話'`にヒットしない（クォートしたフレーズ全体との一致検索`MATCH '"ボルダリングの話"'`は可能）。①のFTS5候補抽出を実用的なキーワード検索として機能させるには、T15でカスタムトークナイザ（例: `unicode61`のremove_diacritics設定調整、またはbigram/trigramトークナイザ）の導入要否を検討する必要がある。

### 6.2 検索フロー

```text
Topic Analyzer / Dialogue Planner
        │  検索クエリ（現在の話題キーワード、直前発話の要約 等）
        ▼
Memory Retriever
        │
        ├─ ① キーワード候補抽出（FTS5）
        │     long_term_memory_fts に対して MATCH クエリを実行し、
        │     summary/tags/body にキーワードが含まれる記憶を上位N件（例：20件）に絞る
        │
        ├─ ② 意味的再ランキング（Embedding, アプリ側計算）
        │     ①の候補（および関連性が薄くキーワードでは拾えない候補を補うため、
        │     全件 or importance上位のみを対象に追加走査）に対し、
        │     クエリのembeddingと各記憶のembedding(memory_embeddings)との
        │     コサイン類似度を計算し、スコア順に並べ替える
        │
        ├─ ③ フィルタリング
        │     - shareable=false の除外（対話相手が異なる場合）
        │     - 現在の会話参加者が participants に含まれるか（Shared Memory判定）
        │     - memory_recall_log を参照し、直近数ターン以内に想起済みなら
        │       スコアを減衰 or 除外（7.1「記憶の重複回避」対応）
        │
        └─ ④ 上位1〜数件をMemory Retrieverの出力として採用し、
             memory_recall_log に記録
```

- ①のFTS5候補抽出は「明らかに無関係な大量の記憶をコサイン類似度計算にかけずに済ませる」ための軽量フィルタとして使う。データ件数がごく少ない場合は①を省略し全件に②を適用してもよい（実装簡易化の余地として残す）。
- Embeddingの生成タイミングは、`memory_preset_cache`／`session_memories`への書き込み時（起動時同期・会話中の記憶生成時）に一括計算し `memory_embeddings` にキャッシュする（検索の都度計算しない）。
- Embedding生成にもTogether AIのEmbeddings APIを利用する想定（`architecture.md` 9章のTogether AIクライアントに、Embeddings用エンドポイント呼び出しを追加する）。

### 6.3 Shared Memory / 自己記憶の区別
- `owner`が単一キャラクターかつ`participants`が1名のみ → 自己記憶（F3.1）
- `participants`が2名以上 → 共有記憶（F3.2）。会話中の相手が`participants`に含まれるかどうかでMemory Retrieverの検索対象を自己記憶/共有記憶で切り替える（F2.2 Relationship Managerの「共有記憶検索」と連動）。
- 同じ出来事でも`owner`ごとに別レコードとして保持される（例: `mem_a_0001`と`mem_b_0001`は同じ出来事のchar_a視点/char_b視点）。`participants`は「誰が関わった出来事か」を表すだけで「誰の視点の記憶か」は表さないため、Memory Retrieverは`participants`だけでなく`owner`＝話者（`MemoryQuery.speakerId`）でも必ず絞り込む（T43、Issue #9）。これを怠ると、`participants`に話者を含む他人視点の記憶（例: char_bの日記にchar_aが登場する記憶）がchar_aの発話材料に混入してしまう。

### 6.4 短期記憶・中期記憶の扱い（参考）
- 短期記憶（D7, 直近の会話履歴）は検索対象にせず、Topic Analyzer/Dialogue Plannerがオンメモリの会話履歴配列を直接参照する。
- 中期記憶（このセッション内の傾向、例：「映画の話が多い」）は永続テーブルを持たず、`turns`テーブルの集計（DialogueAct/Topic出現頻度）から都度算出する軽量な実装とする（プロトタイプでは専用テーブル化しない）。

## 7. 留意事項

- `character_def`はこのプロジェクトの外側で独自のGit管理・レビューフロー（`/generate-memory`, `/revise-memory`等）を持つため、本エンジンから**書き込みは行わない**。将来「会話から自動的に新しい長期記憶を`character_def`へフィードバックする」機能を検討する場合は、別途`character_def`側のバリデーションスキーマ・PRフローに従う設計が必要になる（本フェーズはスコープ外）。
- `ng_topics`（配信で扱わない話題）は`characters_cache`に取り込み済みなので、Dialogue PlannerまたはPrompt Builderの段階で当該話題を避けるフィルタとして利用できる（既存要件には明記していないため、必要であれば`features.md`への追記を検討する）。
- `memory_preset_cache`・`characters_cache`は起動時に洗い替えるキャッシュであり、`character_def`側の更新を反映するにはエンジンの再起動（または開発時のファイル監視による再読み込み）が必要。
