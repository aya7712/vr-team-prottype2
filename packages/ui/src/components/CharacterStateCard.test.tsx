import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CharacterStateCard } from './CharacterStateCard';

const character = { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' };
const state = {
  id: 'char_a',
  personality: 'テスト',
  emotion: { label: 'joy', intensity: 0.8 },
  energy: 0.6,
  curiosity: 0.5,
  currentGoal: '仲良くなりたい',
  conversationIntent: '共感したい',
  speakingStyle: { honorificLevel: 0, jokeTolerance: 0.5, distance: 0.5, addressTerm: 'ちゃん' },
};

describe('CharacterStateCard', () => {
  it('キャラクター名・感情・Goal・Intentを表示する', () => {
    render(<CharacterStateCard character={character} state={state} />);

    expect(screen.getByText('ひまり')).toBeInTheDocument();
    expect(screen.getByText('joy（0.80）')).toBeInTheDocument();
    expect(screen.getByText('仲良くなりたい')).toBeInTheDocument();
    expect(screen.getByText('共感したい')).toBeInTheDocument();
  });

  it('ヘッダー下線にキャラクターカラーを使う', () => {
    render(<CharacterStateCard character={character} state={state} />);

    const heading = screen.getByRole('heading', { name: 'ひまり' });
    expect(heading).toHaveStyle({ borderBottom: '2px solid #FFC20E' });
  });
});
