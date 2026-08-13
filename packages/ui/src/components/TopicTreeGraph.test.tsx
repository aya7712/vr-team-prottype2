import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopicTreeGraph } from './TopicTreeGraph';

const topics = [
  {
    id: 't1',
    label: '週末の予定',
    depth: 0,
    energy: 0.8,
    novelty: 0.6,
    life: 0.9,
    unresolved: false,
  },
  {
    id: 't2',
    parentTopicId: 't1',
    label: '旅行先の候補',
    depth: 1,
    energy: 0.4,
    novelty: 0.9,
    life: 0.3,
    unresolved: true,
  },
];

describe('TopicTreeGraph', () => {
  it('Topicのラベルとenergy/novelty/lifeを表示する', () => {
    render(<TopicTreeGraph topics={topics} currentTopicId="t2" />);

    expect(screen.getByText('週末の予定')).toBeInTheDocument();
    expect(screen.getByText(/旅行先の候補/)).toBeInTheDocument();
    expect(screen.getByText('(未解決)')).toBeInTheDocument();
  });

  it('Topicが無い場合はプレースホルダーを表示する', () => {
    render(<TopicTreeGraph topics={[]} />);

    expect(screen.getByText('Topicはまだありません。')).toBeInTheDocument();
  });
});
