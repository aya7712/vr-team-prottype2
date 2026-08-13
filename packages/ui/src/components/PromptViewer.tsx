export interface PromptViewerProps {
  prompt: string;
  rawOutput: string;
}

/**
 * F9.3 LLM送信プロンプト全文・生出力の表示（`ui-design-rules.md` 5章）。折りたたみ可能な
 * コードブロックとし、常時全文表示はしない。
 */
export function PromptViewer({ prompt, rawOutput }: PromptViewerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}>
          送信プロンプト全文
        </summary>
        <pre
          className="mono"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: 'var(--space-1)',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
          }}
        >
          {prompt}
        </pre>
      </details>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-text-muted)' }}>
          LLM生出力
        </summary>
        <pre
          className="mono"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: 'var(--space-1)',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
          }}
        >
          {rawOutput}
        </pre>
      </details>
    </div>
  );
}
