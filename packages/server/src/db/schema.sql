-- data-design.md 5章のCREATE TABLE群。起動時にmigrate.tsが適用する。

-- 5.1 キャッシュ系（character_defの取り込み結果、起動時に洗い替え）

CREATE TABLE IF NOT EXISTS characters_cache (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  furigana        TEXT,
  age             INTEGER,
  gender          TEXT,
  first_person    TEXT,
  personality     TEXT,
  tone_sample     TEXT,
  vocabulary_json TEXT,
  ng_topics_json  TEXT,
  unit_context_json TEXT,
  llm_json        TEXT,
  raw_yaml_path   TEXT NOT NULL,
  loaded_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_relationships_cache (
  character_id       TEXT NOT NULL REFERENCES characters_cache(id),
  target_character_id TEXT NOT NULL,
  address            TEXT,
  description        TEXT,
  PRIMARY KEY (character_id, target_character_id)
);

CREATE TABLE IF NOT EXISTS sub_characters_cache (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  raw_yaml_path   TEXT NOT NULL,
  loaded_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_preset_cache (
  id              TEXT PRIMARY KEY,
  owner           TEXT NOT NULL REFERENCES characters_cache(id),
  participants_json TEXT NOT NULL,
  occurred_at     TEXT,
  occurred_era    TEXT,
  location        TEXT,
  summary         TEXT NOT NULL,
  tags_json       TEXT NOT NULL,
  importance      INTEGER NOT NULL,
  emotion         TEXT,
  shareable       INTEGER NOT NULL,
  related_json    TEXT,
  body            TEXT NOT NULL,
  raw_md_path     TEXT NOT NULL,
  loaded_at       TEXT NOT NULL
);

-- 5.2 エンジン所有データ（セッション実行に伴い書き込まれる）

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  scenario_json     TEXT NOT NULL,
  participant_ids_json TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  status            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationship_state (
  session_id          TEXT NOT NULL REFERENCES sessions(id),
  character_id         TEXT NOT NULL,
  target_character_id  TEXT NOT NULL,
  trust                REAL NOT NULL,
  intimacy             REAL NOT NULL,
  respect              REAL NOT NULL,
  updated_at_turn       INTEGER NOT NULL,
  PRIMARY KEY (session_id, character_id, target_character_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  parent_topic_id TEXT,
  label           TEXT NOT NULL,
  depth           INTEGER NOT NULL,
  energy          REAL NOT NULL,
  novelty         REAL NOT NULL,
  life            REAL NOT NULL,
  emotionality    REAL,
  unresolved      INTEGER NOT NULL,
  last_mention_turn INTEGER,
  created_at_turn INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  turn_no         INTEGER NOT NULL,
  speaker_id      TEXT NOT NULL,
  target_ids_json TEXT,
  topic_id        TEXT REFERENCES topics(id),
  dialogue_act    TEXT NOT NULL,
  utterance       TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_no)
);

CREATE TABLE IF NOT EXISTS turn_layer_events (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  layer           TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (session_id, turn_no) REFERENCES turns(session_id, turn_no)
);

CREATE TABLE IF NOT EXISTS session_memories (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  owner             TEXT,
  participants_json TEXT NOT NULL,
  origin_turn_no    INTEGER NOT NULL,
  summary           TEXT NOT NULL,
  tags_json         TEXT NOT NULL,
  importance        INTEGER NOT NULL,
  emotion           TEXT,
  shareable         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_recall_log (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  memory_id        TEXT NOT NULL,
  memory_source     TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turn_feedback (
  session_id      TEXT NOT NULL,
  turn_no         INTEGER NOT NULL,
  rating          TEXT NOT NULL,
  comment         TEXT,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (session_id, turn_no)
);

-- 5.3 検索用テーブル

CREATE VIRTUAL TABLE IF NOT EXISTS long_term_memory_fts USING fts5(
  memory_id UNINDEXED,
  memory_source UNINDEXED,
  owner UNINDEXED,
  summary,
  tags,
  body
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id     TEXT PRIMARY KEY,
  memory_source TEXT NOT NULL,
  model         TEXT NOT NULL,
  vector        BLOB NOT NULL,
  updated_at    TEXT NOT NULL
);
