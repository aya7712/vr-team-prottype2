import { parse } from 'yaml';
import type { CharacterDefRecord, CharacterRelationshipRecord, SubCharacterRecord } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, filePath: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${filePath}: 必須フィールド "${key}" が欠落または不正です`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseRelationships(
  record: Record<string, unknown>,
  ownCharacterId: string,
  filePath: string,
): CharacterRelationshipRecord[] {
  const value = record['relationships'];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`${filePath}: relationships の要素が不正です`);
    }
    return {
      characterId: ownCharacterId,
      targetCharacterId: requireString(entry, 'character_id', filePath),
      address: optionalString(entry, 'address') ?? '',
      description: optionalString(entry, 'description') ?? '',
    };
  });
}

/** design/main, design/sub のYAML定義をパースする（`class-design.md` 12章）。 */
export class YamlCharacterParser {
  parseMain(content: string, filePath: string): CharacterDefRecord {
    const doc: unknown = parse(content);
    if (!isRecord(doc)) {
      throw new Error(`${filePath}: YAMLのルートがオブジェクトではありません`);
    }

    const llmRaw = doc['llm'];
    const llm = isRecord(llmRaw)
      ? {
          provider: requireString(llmRaw, 'provider', filePath),
          model: requireString(llmRaw, 'model', filePath),
          temperature: optionalNumber(llmRaw, 'temperature') ?? 0.8,
        }
      : null;

    const unitContextRaw = doc['unit_context'];
    const id = requireString(doc, 'id', filePath);

    return {
      id,
      name: requireString(doc, 'name', filePath),
      furigana: optionalString(doc, 'furigana'),
      color: requireString(doc, 'color', filePath),
      age: optionalNumber(doc, 'age'),
      gender: optionalString(doc, 'gender'),
      firstPerson: optionalString(doc, 'first_person'),
      personality: requireString(doc, 'personality', filePath),
      toneSample: optionalString(doc, 'tone_sample'),
      vocabulary: optionalStringArray(doc, 'vocabulary'),
      ngTopics: optionalStringArray(doc, 'ng_topics'),
      relationships: parseRelationships(doc, id, filePath),
      unitContext: isRecord(unitContextRaw) ? unitContextRaw : null,
      llm,
      rawYamlPath: filePath,
    };
  }

  parseSub(content: string, filePath: string): SubCharacterRecord {
    const doc: unknown = parse(content);
    if (!isRecord(doc)) {
      throw new Error(`${filePath}: YAMLのルートがオブジェクトではありません`);
    }

    return {
      id: requireString(doc, 'id', filePath),
      name: requireString(doc, 'name', filePath),
      rawYamlPath: filePath,
    };
  }
}
