import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackForm } from './FeedbackForm';

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

describe('FeedbackForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('評価未選択では送信ボタンが無効', () => {
    render(<FeedbackForm sessionId="s1" turnNo={1} />);

    expect(screen.getByText('送信')).toBeDisabled();
  });

  it('自然を選択しコメントを入力して送信するとfeedback APIを呼ぶ', async () => {
    mockFetch(200, {
      sessionId: 's1',
      turnNo: 1,
      rating: 'natural',
      comment: '良い',
      createdAt: 'x',
    });

    render(<FeedbackForm sessionId="s1" turnNo={1} />);

    await userEvent.click(screen.getByText('自然'));
    await userEvent.type(screen.getByPlaceholderText('コメント（任意）'), '良い');
    await userEvent.click(screen.getByText('送信'));

    await waitFor(() => expect(screen.getByText('送信しました')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/s1/turns/1/feedback',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ rating: 'natural', comment: '良い' }),
      }),
    );
  });

  it('turnNoが変わると入力状態がリセットされる', async () => {
    mockFetch(200, {
      sessionId: 's1',
      turnNo: 1,
      rating: 'natural',
      comment: null,
      createdAt: 'x',
    });
    const { rerender } = render(<FeedbackForm sessionId="s1" turnNo={1} />);

    await userEvent.click(screen.getByText('自然'));
    expect(screen.getByText('自然')).toHaveAttribute('aria-pressed', 'true');

    rerender(<FeedbackForm sessionId="s1" turnNo={2} />);

    expect(screen.getByText('自然')).toHaveAttribute('aria-pressed', 'false');
  });
});
