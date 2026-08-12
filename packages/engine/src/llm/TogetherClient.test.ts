import { describe, expect, it, vi, afterEach } from 'vitest';
import { TogetherClient } from './TogetherClient.js';

describe('TogetherClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('レスポンスからセリフ本文を抽出する', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'やったー！' } }] }),
    }) as unknown as typeof fetch;

    const client = new TogetherClient('test-api-key');
    const result = await client.complete('プロンプト本文');
    expect(result).toBe('やったー！');
  });

  it('APIキー・モデル名をリクエストに含める', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TogetherClient('my-key', 'my-model');
    await client.complete('prompt');

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers.Authorization).toBe('Bearer my-key');
    expect(JSON.parse(requestInit.body).model).toBe('my-model');
  });

  it('options.modelを渡すとコンストラクタのモデルより優先される', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TogetherClient('my-key', 'default-model');
    await client.complete('prompt', { model: 'override-model' });

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body).model).toBe('override-model');
  });

  it('HTTPエラー時に1回リトライしてから例外を投げる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new TogetherClient('test-api-key');
    await expect(client.complete('prompt')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // 初回 + 1回リトライ
  });

  it('レスポンス形式が不正な場合は例外を投げる', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    }) as unknown as typeof fetch;

    const client = new TogetherClient('test-api-key');
    await expect(client.complete('prompt')).rejects.toThrow();
  });
});
