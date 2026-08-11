import type { PromptTemplateLoader } from './PromptTemplateLoader.js';

const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

/** テンプレート＋変数からプロンプト全文を構築する（F7.1）。 */
export class PromptBuilder {
  constructor(private readonly templateLoader: PromptTemplateLoader) {}

  build(templateName: string, vars: Record<string, string>): string {
    const template = this.templateLoader.load(templateName);

    return template.replace(PLACEHOLDER_PATTERN, (match, varName: string) => {
      if (!(varName in vars)) {
        throw new Error(
          `PromptBuilder: テンプレート "${templateName}" のプレースホルダー "{{${varName}}}" に対応する変数が渡されていません`,
        );
      }
      return vars[varName];
    });
  }
}
