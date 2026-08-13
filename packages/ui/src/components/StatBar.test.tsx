import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatBar } from './StatBar';

describe('StatBar', () => {
  it('ラベルと数値を表示する', () => {
    render(<StatBar label="energy" value={0.75} />);

    expect(screen.getByText('energy')).toBeInTheDocument();
    expect(screen.getByText('0.75')).toBeInTheDocument();
  });

  it('meterロールでaria-valuenowを公開する', () => {
    render(<StatBar label="trust" value={0.4} />);

    const meter = screen.getByRole('meter', { name: 'trust' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.4');
  });
});
