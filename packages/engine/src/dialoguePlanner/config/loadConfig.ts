import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const CONFIG_DIR = dirname(fileURLToPath(import.meta.url));

// `import x from './y.json'`はビルド後のNode ESM実行時にimport assertion
// （`with { type: 'json' }`）を要求し環境依存の落とし穴になるため、
// readFileSync + JSON.parseで読み込む（実行時にJSON編集のみで係数調整可能な
// 要件5章チューニング性は変わらず満たされる）。
export function loadJsonConfig<T>(fileName: string): T {
  const filePath = join(CONFIG_DIR, fileName);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}
