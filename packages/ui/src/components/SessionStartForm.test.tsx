import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStartForm } from './SessionStartForm';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

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

describe('SessionStartForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('参加キャラクターが1体だけでは開始ボタンが無効', async () => {
    render(<SessionStartForm characters={characters} />);

    await userEvent.click(screen.getByText('ひまり'));
    await userEvent.type(screen.getByLabelText('最初のトピック'), '夏祭りの思い出');

    expect(screen.getByText('会話を開始')).toBeDisabled();
    expect(screen.getByText(/2体以上選択してください/)).toBeInTheDocument();
  });

  it('T35: 最初のトピック未入力では開始ボタンが無効', async () => {
    render(<SessionStartForm characters={characters} />);

    await userEvent.click(screen.getByText('ひまり'));
    await userEvent.click(screen.getByText('つむぎ'));

    expect(screen.getByText('会話を開始')).toBeDisabled();
    expect(screen.getByText(/最初のトピックは必須です/)).toBeInTheDocument();
  });

  it('2体選択・最初のトピックを入力してターン数を指定すると、セッション作成→開始APIを呼ぶ', async () => {
    mockFetchSequence([
      {
        status: 201,
        body: {
          id: 's1',
          scenario: null,
          participantIds: ['char_a', 'char_b'],
          createdAt: 'x',
          status: 'stopped',
          initialTopic: '夏祭りの思い出',
        },
      },
      {
        status: 202,
        body: {
          id: 's1',
          scenario: null,
          participantIds: ['char_a', 'char_b'],
          createdAt: 'x',
          status: 'running',
          initialTopic: '夏祭りの思い出',
        },
      },
    ]);
    const onStarted = vi.fn();

    render(<SessionStartForm characters={characters} onStarted={onStarted} />);

    await userEvent.click(screen.getByText('ひまり'));
    await userEvent.click(screen.getByText('つむぎ'));
    await userEvent.type(screen.getByLabelText('最初のトピック'), '夏祭りの思い出');
    const turnsInput = screen.getByLabelText('ターン数');
    await userEvent.clear(turnsInput);
    await userEvent.type(turnsInput, '10');
    await userEvent.click(screen.getByText('会話を開始'));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('s1'));
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          participantIds: ['char_a', 'char_b'],
          initialTopic: '夏祭りの思い出',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/sessions/s1/run',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ maxTurns: 10 }) }),
    );
  });

  it('セッション作成後にrun APIが失敗した場合、作成済みセッションidを含むエラーを表示する', async () => {
    const fn = vi.fn();
    fn.mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: 'ok',
      json: async () => ({
        id: 's1',
        scenario: null,
        participantIds: ['char_a', 'char_b'],
        createdAt: 'x',
        status: 'stopped',
        initialTopic: '夏祭りの思い出',
      }),
    });
    fn.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'error',
      json: async () => ({ message: 'run failed' }),
    });
    vi.stubGlobal('fetch', fn);

    render(<SessionStartForm characters={characters} />);

    await userEvent.click(screen.getByText('ひまり'));
    await userEvent.click(screen.getByText('つむぎ'));
    await userEvent.type(screen.getByLabelText('最初のトピック'), '夏祭りの思い出');
    await userEvent.click(screen.getByText('会話を開始'));

    await waitFor(() =>
      expect(screen.getByText(/セッションid: s1 は作成済みです/)).toBeInTheDocument(),
    );
  });

  it('5体目は選択できない（上限4体）', async () => {
    const fiveCharacters = [
      ...characters,
      { id: 'char_c', name: '理久', furigana: null, color: '#89c3eb' },
      { id: 'char_d', name: '奈也', furigana: null, color: '#740125' },
      { id: 'char_e', name: '五人目', furigana: null, color: '#000000' },
    ];
    render(<SessionStartForm characters={fiveCharacters} />);

    for (const character of fiveCharacters) {
      await userEvent.click(screen.getByText(character.name));
    }

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const checkedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    expect(checkedCount).toBe(4);
    expect(screen.getByLabelText('五人目')).not.toBeChecked();
  });
});
