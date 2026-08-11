import { parse } from 'yaml';
import type { MemoryItem } from '../types/memory.js';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

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

function requireStringArray(record: Record<string, unknown>, key: string, filePath: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${filePath}: 必須フィールド "${key}" が欠落または不正です`);
  }
  return value;
}

function requireNumber(record: Record<string, unknown>, key: string, filePath: string): number {
  const value = record[key];
  if (typeof value !== 'number') {
    throw new Error(`${filePath}: 必須フィールド "${key}" が欠落または不正です`);
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string, filePath: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${filePath}: 必須フィールド "${key}" が欠落または不正です`);
  }
  return value;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function nullableStringArray(record: Record<string, unknown>, key: string): string[] | null {
  const value = record[key];
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

/** `memory/<owner>/*.md` のYAML frontmatter + 本文をパースする（`class-design.md` 12章、data-design.md 4.3）。 */
export class MarkdownMemoryParser {
  parse(content: string, filePath: string): MemoryItem {
    const match = FRONTMATTER_PATTERN.exec(content);
    if (!match) {
      throw new Error(`${filePath}: YAML frontmatter（--- ... ---）が見つかりません`);
    }

    const [, frontmatterText, body] = match;
    const frontmatter: unknown = parse(frontmatterText);
    if (!isRecord(frontmatter)) {
      throw new Error(`${filePath}: frontmatterのルートがオブジェクトではありません`);
    }

    return {
      id: requireString(frontmatter, 'id', filePath),
      source: 'preset',
      owner: requireString(frontmatter, 'owner', filePath),
      participants: requireStringArray(frontmatter, 'participants', filePath),
      occurredAt: nullableString(frontmatter, 'occurred_at'),
      occurredEra: nullableString(frontmatter, 'occurred_era'),
      location: nullableString(frontmatter, 'location'),
      summary: requireString(frontmatter, 'summary', filePath),
      tags: requireStringArray(frontmatter, 'tags', filePath),
      importance: requireNumber(frontmatter, 'importance', filePath),
      emotion: nullableString(frontmatter, 'emotion'),
      shareable: requireBoolean(frontmatter, 'shareable', filePath),
      related: nullableStringArray(frontmatter, 'related'),
      body: body.trim(),
    };
  }
}
