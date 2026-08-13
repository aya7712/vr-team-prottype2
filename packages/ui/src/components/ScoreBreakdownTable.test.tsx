import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreBreakdownTable } from './ScoreBreakdownTable';

const scores = [
  {
    act: 'empathy',
    baseWeight: 1,
    modifiers: { rhythm: 0.1, emotion: 0.2 },
    score: 1.3,
    probability: 0.6,
  },
  {
    act: 'question',
    baseWeight: 0.8,
    modifiers: { rhythm: -0.1, emotion: 0.0 },
    score: 0.7,
    probability: 0.4,
  },
] as const;

describe('ScoreBreakdownTable', () => {
  it('各Actのbaseweight/modifier/score/probabilityを表示する', () => {
    render(<ScoreBreakdownTable scores={[...scores]} selectedAct="empathy" />);

    expect(screen.getByText('empathy')).toBeInTheDocument();
    expect(screen.getByText('question')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getAllByText('rhythm').length).toBeGreaterThan(0);
  });

  it('選択されたActの行をハイライトする', () => {
    render(<ScoreBreakdownTable scores={[...scores]} selectedAct="empathy" />);

    const selectedRow = screen.getByText('empathy').closest('tr');
    expect(selectedRow).toHaveStyle({ fontWeight: 'bold' });
    const otherRow = screen.getByText('question').closest('tr');
    expect(otherRow).toHaveStyle({ fontWeight: 'normal' });
  });
});
