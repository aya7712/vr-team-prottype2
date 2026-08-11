import { describe, expect, it, vi } from 'vitest';
import { PromptBuilder } from './PromptBuilder.js';
import type { PromptTemplateLoader } from './PromptTemplateLoader.js';

function makeLoader(template: string): PromptTemplateLoader {
  return { load: vi.fn().mockReturnValue(template) } as unknown as PromptTemplateLoader;
}

describe('PromptBuilder', () => {
  it('{{camelCase変数名}}のプレースホルダーを変数値に置換する', () => {
    const loader = makeLoader('こんにちは、{{characterName}}さん。今の感情は{{emotion}}です。');
    const builder = new PromptBuilder(loader);

    const result = builder.build('utterance/base', {
      characterName: '宇良',
      emotion: 'happy',
    });

    expect(result).toBe('こんにちは、宇良さん。今の感情はhappyです。');
  });

  it('同じプレースホルダーが複数回出現しても全て置換される', () => {
    const loader = makeLoader('{{name}}は{{name}}らしく話す。');
    const builder = new PromptBuilder(loader);
    const result = builder.build('t', { name: '楽' });
    expect(result).toBe('楽は楽らしく話す。');
  });

  it('対応する変数が渡されないプレースホルダーがあると例外を投げる', () => {
    const loader = makeLoader('{{characterName}}は{{missingVar}}。');
    const builder = new PromptBuilder(loader);
    expect(() => builder.build('t', { characterName: '宇良' })).toThrow(/missingVar/);
  });

  it('プレースホルダーが無いテンプレートはそのまま返る', () => {
    const loader = makeLoader('プレースホルダーなしの文章。');
    const builder = new PromptBuilder(loader);
    expect(builder.build('t', {})).toBe('プレースホルダーなしの文章。');
  });

  it('templateLoader.loadにtemplateNameをそのまま渡す', () => {
    const loader = makeLoader('本文');
    const builder = new PromptBuilder(loader);
    builder.build('utterance/with_shared_memory', {});
    expect(loader.load).toHaveBeenCalledWith('utterance/with_shared_memory');
  });
});
