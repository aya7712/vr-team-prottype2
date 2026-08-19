import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogBrowser } from './LogBrowser';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

const sessions = [
  {
    id: 's1',
    participantIds: ['char_a', 'char_b'],
    createdAt: '2026-08-13T00:00:00.000Z',
    status: 'completed' as const,
    initialTopic: '夏祭りの思い出',
  },
];

const turns = [
  {
    sessionId: 's1',
    turnNo: 1,
    speakerId: 'char_a',
    targetIds: ['char_b'],
    topicId: 't1',
    dialogueAct: 'empathy',
    utterance: 'それは大変だったね',
    createdAt: '2026-08-13T00:00:00.000Z',
  },
];

const turnDetail = {
  ...turns[0],
  layerEvents: [
    {
      sessionId: 's1',
      turnNo: 1,
      layer: 'dialoguePlanner',
      payload: {
        scores: [{ act: 'empathy', baseWeight: 1, modifiers: {}, score: 1, probability: 0.6 }],
        selectedAct: 'empathy',
        expectation: { expectedActs: [] },
      },
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    {
      sessionId: 's1',
      turnNo: 1,
      layer: 'llm',
      payload: { prompt: 'これはプロンプト', rawOutput: 'これは生出力' },
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ],
};

function mockFetchSequence(responses: { status: number; body: unknown }[]): void {
  const fn = vi.fn();
  for (const { status, body } of responses) {
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'error',
      json: async () => body,
    });
  }
  vi.stubGlobal('fetch', fn);
}

describe('LogBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('セッション一覧→ターン一覧→ターン詳細（F9.2/F9.3のコンポーネント）の順に選択できる', async () => {
    mockFetchSequence([
      { status: 200, body: sessions },
      { status: 200, body: turns },
      { status: 200, body: turnDetail },
    ]);

    render(<LogBrowser characters={characters} />);

    await waitFor(() => expect(screen.getByText('ひまり')).toBeInTheDocument());
    expect(screen.getByText('セッションを選択してください。')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ひまり/ }));

    await waitFor(() => expect(screen.getByText(/#1/)).toBeInTheDocument());
    expect(screen.getByText('ターンを選択してください。')).toBeInTheDocument();

    await userEvent.click(screen.getByText(/#1/));

    await waitFor(() => expect(screen.getByText('それは大変だったね')).toBeInTheDocument());
    expect(screen.getAllByText('empathy').length).toBeGreaterThan(0);
    expect(screen.getByText('これはプロンプト')).toBeInTheDocument();
    expect(screen.getByText('評価')).toBeInTheDocument();
    expect(screen.getByText('自然')).toBeInTheDocument();
  });

  it('セッションが無い場合はプレースホルダーを表示する', async () => {
    mockFetchSequence([{ status: 200, body: [] }]);

    render(<LogBrowser characters={characters} />);

    await waitFor(() => expect(screen.getByText('セッションがありません。')).toBeInTheDocument());
  });

  it('セッション選択後、ターンが無い場合はプレースホルダーを表示する', async () => {
    mockFetchSequence([
      { status: 200, body: sessions },
      { status: 200, body: [] },
    ]);

    render(<LogBrowser characters={characters} />);

    await waitFor(() => expect(screen.getByText('ひまり')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /ひまり/ }));

    await waitFor(() => expect(screen.getByText('ターンがありません。')).toBeInTheDocument());
  });
});
