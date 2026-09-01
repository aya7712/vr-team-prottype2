import { describe, expect, it, vi, afterEach } from 'vitest';
import { EmbeddingClient } from './EmbeddingClient.js';

describe('EmbeddingClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getModelはコンストラクタに渡したモデル名を返す（T43）', () => {
    const client = new EmbeddingClient('test-api-key', 'my-embedding-model');
    expect(client.getModel()).toBe('my-embedding-model');
  });

  it('レスポンスからembeddingベクトルを抽出する', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    }) as unknown as typeof fetch;

    const client = new EmbeddingClient('test-api-key');
    const result = await client.embed('テスト文章');
    expect(result).toBeInstanceOf(Float32Array);
    expect(Array.from(result)).toEqual([Math.fround(0.1), Math.fround(0.2), Math.fround(0.3)]);
  });

  it('APIキー・モデル名・inputをリクエストに含める', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [1] }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EmbeddingClient('my-key', 'my-embedding-model');
    await client.embed('入力テキスト');

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit.headers.Authorization).toBe('Bearer my-key');
    const body = JSON.parse(requestInit.body);
    expect(body.model).toBe('my-embedding-model');
    expect(body.input).toBe('入力テキスト');
  });

  it('HTTPエラー時に1回リトライしてから例外を投げる', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new EmbeddingClient('test-api-key');
      const promise = client.embed('text');
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('リトライ前に5秒待機してから再送する', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      global.fetch = fetchMock as unknown as typeof fetch;

      const client = new EmbeddingClient('test-api-key');
      const promise = client.embed('text');
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

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

      const client = new EmbeddingClient('test-api-key');
      const promise = client.embed('text');
      const assertion = expect(promise).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
