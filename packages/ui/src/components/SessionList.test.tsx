import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionList } from './SessionList';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

const sessions = [
  {
    id: 's1',
    participantIds: ['char_a', 'char_b'],
    createdAt: '2026-08-13T00:00:00.000Z',
    status: 'stopped' as const,
    initialTopic: '夏祭りの思い出',
  },
];

describe('SessionList', () => {
  it('セッション一覧を参加キャラクター名（キャラクターカラー付き）で表示する', () => {
    render(
      <SessionList
        sessions={sessions}
        selectedSessionId={null}
        onSelect={vi.fn()}
        characters={characters}
      />,
    );

    const nameA = screen.getByText('ひまり');
    const nameB = screen.getByText('つむぎ');
    expect(nameA).toHaveStyle({ color: '#FFC20E' });
    expect(nameB).toHaveStyle({ color: '#67be8d' });
  });

  it('T35: 各セッションの最初のトピックを表示する', () => {
    render(
      <SessionList
        sessions={sessions}
        selectedSessionId={null}
        onSelect={vi.fn()}
        characters={characters}
      />,
    );

    expect(screen.getByText('夏祭りの思い出')).toBeInTheDocument();
  });

  it('クリックするとonSelectがセッションIDで呼ばれる', async () => {
    const onSelect = vi.fn();
    render(
      <SessionList
        sessions={sessions}
        selectedSessionId={null}
        onSelect={onSelect}
        characters={characters}
      />,
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('セッションが無い場合はプレースホルダーを表示する', () => {
    render(
      <SessionList
        sessions={[]}
        selectedSessionId={null}
        onSelect={vi.fn()}
        characters={characters}
      />,
    );

    expect(screen.getByText('セッションがありません。')).toBeInTheDocument();
  });
});
