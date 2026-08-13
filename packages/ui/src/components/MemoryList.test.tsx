import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryList } from './MemoryList';

const items = [
  {
    id: 'm1',
    source: 'preset' as const,
    owner: 'char_a',
    participants: ['char_a', 'char_b'],
    summary: '前に二人で旅行に行った話',
    tags: [],
    importance: 0.8,
    shareable: true,
  },
];

describe('MemoryList', () => {
  it('想起された記憶のsummaryとshareable区分を表示する', () => {
    render(<MemoryList items={items} />);

    expect(screen.getByText(/Shared/)).toBeInTheDocument();
    expect(screen.getByText(/前に二人で旅行に行った話/)).toBeInTheDocument();
  });

  it('空の場合はプレースホルダーを表示する', () => {
    render(<MemoryList items={[]} />);

    expect(screen.getByText('想起された記憶はありません。')).toBeInTheDocument();
  });
});
