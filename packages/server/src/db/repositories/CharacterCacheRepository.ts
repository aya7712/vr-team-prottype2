import type Database from 'better-sqlite3';
import type { CharacterDefRecord, SubCharacterRecord, MemoryItem } from '@prottype2/engine';

/**
 * `CharacterDefLoader`（T04）の出力を`characters_cache`等へ書き込む（data-design.md 4.1）。
 * 起動時に呼ばれ、キャッシュテーブルを都度洗い替える（DELETE→INSERT）。
 */
export class CharacterCacheRepository {
  constructor(private readonly db: Database.Database) {}

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM characters_cache WHERE id = ?').get(id) !== undefined;
  }

  syncCharacters(characters: CharacterDefRecord[]): void {
    const now = new Date().toISOString();
    const run = this.db.transaction((records: CharacterDefRecord[]) => {
      this.db.prepare('DELETE FROM character_relationships_cache').run();
      this.db.prepare('DELETE FROM characters_cache').run();

      const insertChar = this.db.prepare(`
        INSERT INTO characters_cache
          (id, name, furigana, color, age, gender, first_person, personality, tone_sample,
           vocabulary_json, ng_topics_json, unit_context_json, llm_json, raw_yaml_path, loaded_at)
        VALUES (@id, @name, @furigana, @color, @age, @gender, @firstPerson, @personality, @toneSample,
                @vocabularyJson, @ngTopicsJson, @unitContextJson, @llmJson, @rawYamlPath, @loadedAt)
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
