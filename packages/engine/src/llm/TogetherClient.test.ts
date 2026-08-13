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
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new TogetherClient('test-api-key');
      const promise = client.complete('prompt');
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2); // 初回 + 1回リトライ
    } finally {
      vi.useRealTimers();
    }
  });

  it('リトライ前に5秒待機してから再送する', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new TogetherClient('test-api-key');
      const promise = client.complete('prompt');
      const assertion = expect(promise).rejects.toThrow();
      // 初回リクエストのマイクロタスクを進める。
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 5秒未満ではまだリトライされない。
      await vi.advanceTimersByTimeAsync(4_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 5秒経過でリトライが発生する。
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('レスポンス形式が不正な場合は例外を投げる', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'shape' }),
      }) as unknown as typeof fetch;

      const client = new TogetherClient('test-api-key');
      const promise = client.complete('prompt');
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
