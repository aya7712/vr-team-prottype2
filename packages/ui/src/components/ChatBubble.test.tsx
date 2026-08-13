import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatBubble } from './ChatBubble';

const charA = { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' };
const charB = { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' };

describe('ChatBubble', () => {
  it('発言者名・対象・Dialogue Act・セリフを表示する', () => {
    render(
      <ChatBubble speaker={charA} targets={[charB]} dialogueAct="empathy" utterance="わかるよ" />,
    );

    expect(screen.getByText('ひまり')).toBeInTheDocument();
    expect(screen.getByText('→ つむぎ')).toBeInTheDocument();
    expect(screen.getByText('[empathy]')).toBeInTheDocument();
    expect(screen.getByText('わかるよ')).toBeInTheDocument();
  });

  it('発言者名のテキスト色にキャラクターカラーを使う', () => {
    render(<ChatBubble speaker={charA} targets={[]} dialogueAct="question" utterance="元気?" />);

    const name = screen.getByText('ひまり');
    expect(name).toHaveStyle({ color: '#FFC20E' });
  });

  it('対象がいない場合は矢印を表示しない', () => {
    render(<ChatBubble speaker={charA} targets={[]} dialogueAct="fillSilence" utterance="…" />);

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});
