import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromptTemplateLoader } from './PromptTemplateLoader.js';

describe('PromptTemplateLoader', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('テンプレートファイルを読み込める', () => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-loader-'));
    writeFileSync(join(dir, 'greeting.md'), 'こんにちは');

    const loader = new PromptTemplateLoader(dir);
    expect(loader.load('greeting')).toBe('こんにちは');
  });

  it('存在しないテンプレートを読み込もうとすると例外を投げる', () => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-loader-'));
    const loader = new PromptTemplateLoader(dir);
    expect(() => loader.load('missing')).toThrow();
  });

  it('ファイルが更新されると再読み込みされる（mtimeキャッシュ無効化、architecture.md 8章）', () => {
    dir = mkdtempSync(join(tmpdir(), 'prompt-loader-'));
    const filePath = join(dir, 'greeting.md');
    writeFileSync(filePath, 'v1');

    const loader = new PromptTemplateLoader(dir);
    expect(loader.load('greeting')).toBe('v1');

    writeFileSync(filePath, 'v2');
    const future = new Date(Date.now() + 5000);
    utimesSync(filePath, future, future);

    expect(loader.load('greeting')).toBe('v2');
  });
});
