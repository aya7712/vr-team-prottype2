import type Database from 'better-sqlite3';
import type { CharacterDefRecord, SubCharacterRecord, MemoryItem } from '@prottype2/engine';

export interface CharacterSummary {
  id: string;
  name: string;
  furigana: string | null;
  color: string;
}

/**
 * `CharacterDefLoader`（T04）の出力を`characters_cache`等へ書き込む（data-design.md 4.1）。
 * 起動時に呼ばれ、キャッシュテーブルを都度洗い替える（DELETE→INSERT）。
 */
export class CharacterCacheRepository {
  constructor(private readonly db: Database.Database) {}

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM characters_cache WHERE id = ?').get(id) !== undefined;
  }

  // UIのキャラクター一覧表示（F9.1〜F9.4、`ui-design-rules.md` 2.2の`color`取得元）向けの
  // 最小projection。フルレコードはfindByIdsを使う。
  listSummaries(): CharacterSummary[] {
    return this.db
      .prepare('SELECT id, name, furigana, color FROM characters_cache ORDER BY id')
      .all() as CharacterSummary[];
  }

  // characters_cache/character_relationships_cacheからCharacterDefRecordを再構成する
  // （T18、TurnOrchestratorがConversationManagerを組み立てる際に使用）。
  findByIds(ids: string[]): CharacterDefRecord[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM characters_cache WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{
      id: string;
      name: string;
      furigana: string | null;
      color: string;
      age: number | null;
      gender: string | null;
      first_person: string | null;
      personality: string;
      tone_sample: string | null;
      vocabulary_json: string;
      ng_topics_json: string;
      unit_context_json: string | null;
      llm_json: string | null;
      raw_yaml_path: string;
    }>;

    const relRows = this.db
      .prepare(
        `SELECT * FROM character_relationships_cache WHERE character_id IN (${placeholders})`,
      )
      .all(...ids) as Array<{
      character_id: string;
      target_character_id: string;
      address: string | null;
      description: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      furigana: row.furigana,
      color: row.color,
      age: row.age,
      gender: row.gender,
      firstPerson: row.first_person,
      personality: row.personality,
      toneSample: row.tone_sample,
      vocabulary: JSON.parse(row.vocabulary_json) as string[],
      ngTopics: JSON.parse(row.ng_topics_json) as string[],
      relationships: relRows
        .filter((rel) => rel.character_id === row.id)
        .map((rel) => ({
          characterId: rel.character_id,
          targetCharacterId: rel.target_character_id,
          address: rel.address ?? '',
          description: rel.description ?? '',
        })),
      unitContext: row.unit_context_json
        ? (JSON.parse(row.unit_context_json) as Record<string, unknown>)
        : null,
      llm: row.llm_json ? (JSON.parse(row.llm_json) as CharacterDefRecord['llm']) : null,
      rawYamlPath: row.raw_yaml_path,
    }));
  }

  syncCharacters(characters: CharacterDefRecord[]): void {
    const now = new Date().toISOString();
    const run = this.db.transaction((records: CharacterDefRecord[]) => {
      this.db.prepare('DELETE FROM character_relationships_cache').run();
      // characters_cacheはmemory_preset_cache.ownerから外部キー参照されており、
      // memory_preset_cacheの洗い替えはsyncMemoryPresets（別トランザクション、
      // このメソッドの後に呼ばれる）が担う。確認用データを永続化する運用（2026-08-13〜）
      // ではmemory_preset_cacheが前回起動時のデータを保持したまま次回起動を迎えるため、
      // DELETE FROM characters_cacheを先に行うと外部キー制約違反になる。
      // そのためDELETE→INSERTではなくUPSERTに変更し、削除を伴わずに洗い替える。
      // 既存データセットに含まれなくなったID（character_defから削除された等）のみ
      // DELETEする。records.length===0の場合は「NOT IN ()」が書けないため無条件DELETEに
      // フォールバックする（SQLiteの`NOT IN (NULL)`は常にUNKNOWN評価となり1件も削除
      // されないため、意図せず古いキャッシュが残り続けるのを防ぐ）。
      // 既知の制約: 削除対象のIDがまだmemory_preset_cacheから参照されている場合、
      // このDELETEも外部キー制約違反になりうる（新規追加・更新のみを想定した
      // 洗い替えであり、character_defからのキャラクター削除は現状未対応）。
      if (records.length > 0) {
        this.db
          .prepare(
            `DELETE FROM characters_cache WHERE id NOT IN (${records.map(() => '?').join(',')})`,
          )
          .run(...records.map((r) => r.id));
      } else {
        this.db.prepare('DELETE FROM characters_cache').run();
      }

      const insertChar = this.db.prepare(`
        INSERT INTO characters_cache
          (id, name, furigana, color, age, gender, first_person, personality, tone_sample,
           vocabulary_json, ng_topics_json, unit_context_json, llm_json, raw_yaml_path, loaded_at)
        VALUES (@id, @name, @furigana, @color, @age, @gender, @firstPerson, @personality, @toneSample,
                @vocabularyJson, @ngTopicsJson, @unitContextJson, @llmJson, @rawYamlPath, @loadedAt)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          furigana = excluded.furigana,
          color = excluded.color,
          age = excluded.age,
          gender = excluded.gender,
          first_person = excluded.first_person,
          personality = excluded.personality,
          tone_sample = excluded.tone_sample,
          vocabulary_json = excluded.vocabulary_json,
          ng_topics_json = excluded.ng_topics_json,
          unit_context_json = excluded.unit_context_json,
          llm_json = excluded.llm_json,
          raw_yaml_path = excluded.raw_yaml_path,
          loaded_at = excluded.loaded_at
      `);
      const insertRel = this.db.prepare(`
        INSERT INTO character_relationships_cache
          (character_id, target_character_id, address, description)
        VALUES (@characterId, @targetCharacterId, @address, @description)
      `);

      for (const record of records) {
        insertChar.run({
          id: record.id,
          name: record.name,
          furigana: record.furigana,
          color: record.color,
          age: record.age,
          gender: record.gender,
          firstPerson: record.firstPerson,
          personality: record.personality,
          toneSample: record.toneSample,
          vocabularyJson: JSON.stringify(record.vocabulary),
          ngTopicsJson: JSON.stringify(record.ngTopics),
          unitContextJson: record.unitContext ? JSON.stringify(record.unitContext) : null,
          llmJson: record.llm ? JSON.stringify(record.llm) : null,
          rawYamlPath: record.rawYamlPath,
          loadedAt: now,
        });

        for (const rel of record.relationships) {
          insertRel.run({
            characterId: rel.characterId,
            targetCharacterId: rel.targetCharacterId,
            address: rel.address,
            description: rel.description,
          });
        }
      }
    });

    run(characters);
  }

  syncSubCharacters(subCharacters: SubCharacterRecord[]): void {
    const now = new Date().toISOString();
    const run = this.db.transaction((records: SubCharacterRecord[]) => {
      this.db.prepare('DELETE FROM sub_characters_cache').run();
      const insert = this.db.prepare(`
        INSERT INTO sub_characters_cache (id, name, raw_yaml_path, loaded_at)
        VALUES (@id, @name, @rawYamlPath, @loadedAt)
      `);
      for (const record of records) {
        insert.run({
          id: record.id,
          name: record.name,
          rawYamlPath: record.rawYamlPath,
          loadedAt: now,
        });
      }
    });

    run(subCharacters);
  }

  syncMemoryPresets(memories: MemoryItem[]): void {
    const now = new Date().toISOString();
    const run = this.db.transaction((records: MemoryItem[]) => {
      this.db.prepare("DELETE FROM long_term_memory_fts WHERE memory_source = 'preset'").run();
      this.db.prepare('DELETE FROM memory_preset_cache').run();

      const insert = this.db.prepare(`
        INSERT INTO memory_preset_cache
          (id, owner, participants_json, occurred_at, occurred_era, location, summary,
           tags_json, importance, emotion, shareable, related_json, body, raw_md_path, loaded_at)
        VALUES (@id, @owner, @participantsJson, @occurredAt, @occurredEra, @location, @summary,
                @tagsJson, @importance, @emotion, @shareable, @relatedJson, @body, @rawMdPath, @loadedAt)
      `);
      const insertFts = this.db.prepare(`
        INSERT INTO long_term_memory_fts (memory_id, memory_source, owner, summary, tags, body)
        VALUES (@id, 'preset', @owner, @summary, @tags, @body)
      `);

      for (const memory of records) {
        insert.run({
          id: memory.id,
          owner: memory.owner,
          participantsJson: JSON.stringify(memory.participants),
          occurredAt: memory.occurredAt ?? null,
          occurredEra: memory.occurredEra ?? null,
          location: memory.location ?? null,
          summary: memory.summary,
          tagsJson: JSON.stringify(memory.tags),
          importance: memory.importance,
          emotion: memory.emotion ?? null,
          shareable: memory.shareable ? 1 : 0,
          relatedJson: memory.related ? JSON.stringify(memory.related) : null,
          body: memory.body ?? '',
          rawMdPath: memory.sourcePath ?? memory.id,
          loadedAt: now,
        });
        insertFts.run({
          id: memory.id,
          owner: memory.owner,
          summary: memory.summary,
          tags: memory.tags.join(' '),
          body: memory.body ?? '',
        });
      }
    });

    run(memories);
  }
}
