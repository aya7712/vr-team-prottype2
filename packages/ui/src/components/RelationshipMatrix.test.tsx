import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RelationshipMatrix } from './RelationshipMatrix';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

const edges = [
  {
    characterId: 'char_a',
    targetCharacterId: 'char_b',
    type: 'friend',
    trust: 0.7,
    intimacy: 0.6,
    respect: 0.5,
    story: [],
  },
];

describe('RelationshipMatrix', () => {
  it('行/列見出しにキャラクターカラーを使う', () => {
    render(<RelationshipMatrix characters={characters} edges={edges} />);

    const headers = screen.getAllByText('ひまり');
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((el) => expect(el).toHaveStyle({ color: '#FFC20E' }));
  });

  it('対角セルは "—" を表示する', () => {
    render(<RelationshipMatrix characters={characters} edges={edges} />);

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('エッジがあるセルはtrust/intimacy/respectのStatBarを表示する', () => {
    render(<RelationshipMatrix characters={characters} edges={edges} />);

    expect(screen.getAllByText('trust').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.70').length).toBeGreaterThan(0);
  });
});
