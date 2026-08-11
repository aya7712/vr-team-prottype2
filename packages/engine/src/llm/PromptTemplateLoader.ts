import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface CacheEntry {
  content: string;
  mtimeMs: number;
}

/**
 * `prompts/**\/*.md`をmtimeキャッシュ付きで読み込む（F7.1a）。
 * ファイルの更新時刻が変わっていれば再読み込みする簡易ホットリロード
 * （architecture.md 8章: 「Node.jsプロセスの再起動なしに反映されるよう...
 * キャッシュしない、またはmtimeで無効化する」）。
 */
export class PromptTemplateLoader {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly basePath: string) {}

  load(templateName: string): string {
    const filePath = join(this.basePath, `${templateName}.md`);
    const mtimeMs = statSync(filePath).mtimeMs;

    const cached = this.cache.get(templateName);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.content;
    }

    const content = readFileSync(filePath, 'utf-8');
    this.cache.set(templateName, { content, mtimeMs });
    return content;
  }
}
