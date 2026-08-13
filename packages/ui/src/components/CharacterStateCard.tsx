import type { CharacterState } from '@prottype2/engine';
import type { CharacterSummary } from '../api/client';
import { StatBar } from './StatBar';

export interface CharacterStateCardProps {
  character: CharacterSummary;
  state: CharacterState;
}

/**
 * F9.2 パラメータダッシュボードのキャラクター別カード。`ui-design-rules.md` 2.2に従い、
 * カードヘッダーの下線にキャラクターカラーを使う。
 */
export function CharacterStateCard({ character, state }: CharacterStateCardProps) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        padding: 'var(--space-2)',
      }}
    >
      <h3
        style={{
          margin: 0,
          paddingBottom: 'var(--space-1)',
          borderBottom: `2px solid ${character.color}`,
          fontSize: 14,
        }}
      >
        {character.name}
      </h3>
      <dl style={{ margin: 'var(--space-1) 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>感情</dt>
          <dd style={{ margin: 0 }}>
            {state.emotion.label}（{state.emotion.intensity.toFixed(2)}）
          </dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>currentGoal</dt>
          <dd style={{ margin: 0 }}>{state.currentGoal}</dd>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <dt>conversationIntent</dt>
          <dd style={{ margin: 0 }}>{state.conversationIntent}</dd>
        </div>
      </dl>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'var(--space-1)' }}
      >
        <StatBar label="energy" value={state.energy} />
        <StatBar label="curiosity" value={state.curiosity} />
      </div>
    </div>
  );
}
