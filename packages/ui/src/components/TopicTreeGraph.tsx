import type { Topic } from '@prottype2/engine';
import { StatBar } from './StatBar';

export interface TopicTreeGraphProps {
  topics: Topic[];
  currentTopicId?: string;
}

/**
 * F9.2 Topicツリー表示。`class-design.md` 14章のTopicTreeGraph。親子関係の深さをインデントで
 * 表し、energy/novelty/lifeを`StatBar`（データ表現用スケール）で表示する。
 */
export function TopicTreeGraph({ topics, currentTopicId }: TopicTreeGraphProps) {
  if (topics.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Topicはまだありません。</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {topics.map((topic) => (
        <li
          key={topic.id}
          style={{
            marginLeft: topic.depth * 16,
            padding: 'var(--space-1)',
            borderRadius: 4,
            borderLeft:
              topic.id === currentTopicId
                ? '3px solid var(--color-accent)'
                : '3px solid transparent',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--color-text)',
              fontSize: 13,
              fontWeight: topic.id === currentTopicId ? 'bold' : 'normal',
            }}
          >
            <span>
              {topic.label}
              {topic.unresolved && <span> (未解決)</span>}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 2 }}>
            <StatBar label="energy" value={topic.energy} />
            <StatBar label="novelty" value={topic.novelty} />
            <StatBar label="life" value={topic.life} />
          </div>
        </li>
      ))}
    </ul>
  );
}
