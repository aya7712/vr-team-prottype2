import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PromptViewer } from './PromptViewer';

describe('PromptViewer', () => {
  it('折りたたみ状態ではプロンプト本文が非表示になる', () => {
    render(<PromptViewer prompt="これはプロンプト" rawOutput="これは生出力" />);

    const promptDetails = screen.getByText('送信プロンプト全文').closest('details');
    expect(promptDetails).not.toHaveAttribute('open');
  });

  it('プロンプトと生出力のテキストを含む', () => {
    render(<PromptViewer prompt="これはプロンプト" rawOutput="これは生出力" />);

    expect(screen.getByText('これはプロンプト')).toBeInTheDocument();
    expect(screen.getByText('これは生出力')).toBeInTheDocument();
  });
});
