import type { DialogueAct } from '@prottype2/engine';
import type { CharacterSummary } from '../api/client';
import { getReadableTextColor } from './getReadableTextColor';

export interface ChatBubbleProps {
  speaker: CharacterSummary;
  targets: CharacterSummary[];
  dialogueAct: DialogueAct;
  utterance: string;
}

/**
 * F9.1 リアルタイム会話ビューのチャットバブル。`ui-design-rules.md` 2.2に従い、
 * バブル背景はニュートラルのまま、左端ボーダーと発言者名にのみキャラクターカラーを使う。
 */
export function ChatBubble({ speaker, targets, dialogueAct, utterance }: ChatBubbleProps) {
  const initial = speaker.name.slice(0, 1);

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        padding: 'var(--space-2)',
        alignItems: 'flex-start',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 'bold',
          backgroundColor: speaker.color,
          color: getReadableTextColor(speaker.color),
        }}
      >
        {initial}
      </div>
      <div
        style={{
          borderLeft: `4px solid ${speaker.color}`,
          backgroundColor: 'var(--color-surface)',
          borderRadius: 4,
          padding: 'var(--space-1) var(--space-2)',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-1)',
            alignItems: 'baseline',
            fontSize: 12,
            color: 'var(--color-text-muted)',
          }}
        >
          <span style={{ color: speaker.color, fontWeight: 'bold' }}>{speaker.name}</span>
          {targets.length > 0 && <span>→ {targets.map((target) => target.name).join(', ')}</span>}
          <span className="mono">[{dialogueAct}]</span>
        </div>
        <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--color-text)' }}>{utterance}</p>
      </div>
    </div>
  );
}
