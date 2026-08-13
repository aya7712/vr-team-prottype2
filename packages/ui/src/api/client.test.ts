import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from './client';

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'error',
      json: async () => body,
    }),
  );
}

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createSessionはPOST /api/sessionsを呼びレスポンスを返す', async () => {
    const session = {
      id: 's1',
      scenario: null,
      participantIds: ['char_a', 'char_b'],
      createdAt: '2026-08-13T00:00:00.000Z',
      status: 'stopped',
    };
    mockFetch(201, session);

    const result = await apiClient.createSession({ participantIds: ['char_a', 'char_b'] });

    expect(result).toEqual(session);
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ participantIds: ['char_a', 'char_b'] }),
      }),
    );
  });

  it('getTurnはターン詳細を取得する', async () => {
    const turnDetail = {
      sessionId: 's1',
      turnNo: 1,
      speakerId: 'char_a',
      topicId: 't1',
      dialogueAct: 'ask',
      utterance: 'こんにちは',
      createdAt: '2026-08-13T00:00:00.000Z',
      layerEvents: [],
    };
    mockFetch(200, turnDetail);

    const result = await apiClient.getTurn('s1', 1);

    expect(result).toEqual(turnDetail);
    expect(fetch).toHaveBeenCalledWith('/api/sessions/s1/turns/1', expect.anything());
  });

  it('submitFeedbackはフィードバックを送信する', async () => {
    const feedback = {
      sessionId: 's1',
      turnNo: 1,
      rating: 'natural',
      comment: null,
      createdAt: '2026-08-13T00:00:00.000Z',
    };
    mockFetch(200, feedback);

    const result = await apiClient.submitFeedback('s1', 1, 'natural');

    expect(result).toEqual(feedback);
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/s1/turns/1/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ rating: 'natural', comment: null }),
      }),
    );
  });

  it('エラーレスポンスの場合はApiErrorを投げる', async () => {
    mockFetch(404, { error: 'session not found' });

    await expect(apiClient.getSession('missing')).rejects.toThrow(ApiError);
    await expect(apiClient.getSession('missing')).rejects.toThrow('session not found');
  });
});
