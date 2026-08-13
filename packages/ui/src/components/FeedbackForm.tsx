import { useEffect, useState } from 'react';
import type { Feedback, FeedbackRating } from '../api/client';
import { apiClient } from '../api/client';

export interface FeedbackFormProps {
  sessionId: string;
  turnNo: number;
}

/**
 * F9.5 人手評価入力（F8.2連携）。表示中のターンに対して自然/不自然の評価とコメントを
 * 入力し、`POST /api/sessions/:id/turns/:turnNo/feedback`へ送信する。
 */
export function FeedbackForm({ sessionId, turnNo }: FeedbackFormProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRating(null);
    setComment('');
    setSubmitted(null);
    setError(null);
  }, [sessionId, turnNo]);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError(null);
    try {
      const feedback = await apiClient.submitFeedback(sessionId, turnNo, rating, comment || null);
      setSubmitted(feedback);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => setRating('natural')}
          aria-pressed={rating === 'natural'}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '4px 8px',
            background: rating === 'natural' ? 'var(--color-accent)' : 'transparent',
            color: rating === 'natural' ? '#FFFFFF' : 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          自然
        </button>
        <button
          type="button"
          onClick={() => setRating('unnatural')}
          aria-pressed={rating === 'unnatural'}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '4px 8px',
            background: rating === 'unnatural' ? 'var(--color-accent)' : 'transparent',
            color: rating === 'unnatural' ? '#FFFFFF' : 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          不自然
        </button>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="コメント（任意）"
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: 4,
          font: 'inherit',
        }}
      />
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!rating || submitting}
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '4px 8px',
            cursor: !rating || submitting ? 'not-allowed' : 'pointer',
          }}
        >
          送信
        </button>
        {submitted && <span style={{ color: 'var(--color-text-muted)' }}>送信しました</span>}
        {error && (
          <span style={{ color: 'var(--color-text-muted)' }}>送信に失敗しました: {error}</span>
        )}
      </div>
    </div>
  );
}
