import type { MemoryItem } from '@prottype2/engine';

export interface MemoryListProps {
  items: MemoryItem[];
  // Issue #9対応: 指定するとowner !== speakerIdのitem（ConversationManagerの最終ガードで
  // 除外されLLMには渡らなかった記憶）を取り消し線付きで区別表示する。省略時は従来通り区別しない
  // （呼び出し側がspeakerIdを持たない場面向けの後方互換）。
  speakerId?: string;
  filteredOutCount?: number;
}

/** F9.3 Memory Retrieverの想起結果一覧。F9.4のログ閲覧でも同じコンポーネントを再利用する。 */
export function MemoryList({ items, speakerId, filteredOutCount = 0 }: MemoryListProps) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>想起された記憶はありません。</p>;
  }

  return (
    <>
      {filteredOutCount > 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 4px' }}>
          除外された記憶（owner不一致、LLMには渡していません）: {filteredOutCount}件
        </p>
      )}
      <ul style={{ margin: 0, paddingLeft: 'var(--space-2)', fontSize: 12 }}>
        {items.map((memory) => {
          const excluded = speakerId !== undefined && memory.owner !== speakerId;
          return (
            <li
              key={memory.id}
              style={
                excluded
                  ? { color: 'var(--color-text-muted)', textDecoration: 'line-through' }
                  : undefined
              }
            >
              [{excluded ? `除外: owner=${memory.owner}` : memory.shareable ? 'Shared' : 'Self'}]{' '}
              {memory.summary}（重要度 {memory.importance.toFixed(2)}）
            </li>
          );
        })}
      </ul>
    </>
  );
}
