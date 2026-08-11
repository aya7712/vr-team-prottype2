import type { LlmClient } from './LlmClient.js';

const ENDPOINT = 'https://api.together.xyz/v1/chat/completions';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;
const DEFAULT_MODEL = 'google/gemma-3n-E4B-it';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Together AI chat completionsのレスポンス型は不明なunknownとして受け取り、
// 型ガードしてから中身を取り出す（implementation-rules.md 2章）。
function extractContent(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices) || data.choices.length === 0) {
    throw new Error('TogetherClient: レスポンス形式が不正です（choicesが見つかりません）');
  }
  const first: unknown = data.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') {
    throw new Error('TogetherClient: レスポンス形式が不正です（message.contentが見つかりません）');
  }
  return first.message.content;
}

/** Together AI chat completions呼び出し（F7.2）。architecture.md 9章に従い1回リトライ・10秒タイムアウト。 */
export class TogetherClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async complete(prompt: string, options?: { temperature?: number }): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.requestOnce(prompt, options);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  private async requestOnce(prompt: string, options?: { temperature?: number }): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options?.temperature ?? 0.8,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TogetherClient: リクエストが失敗しました (status=${response.status})`);
      }

      const data: unknown = await response.json();
      return extractContent(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
