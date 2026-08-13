import type { MemoryItem } from '@prottype2/engine';

export interface MemoryListProps {
  items: MemoryItem[];
}

/** F9.3 Memory Retrieverの想起結果一覧。F9.4のログ閲覧でも同じコンポーネントを再利用する。 */
export function MemoryList({ items }: MemoryListProps) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>想起された記憶はありません。</p>;
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 'var(--space-2)', fontSize: 12 }}>
      {items.map((memory) => (
        <li key={memory.id}>
          [{memory.shareable ? 'Shared' : 'Self'}] {memory.summary}（重要度{' '}
          {memory.importance.toFixed(2)}）
        </li>
      ))}
    </ul>
  );
}
