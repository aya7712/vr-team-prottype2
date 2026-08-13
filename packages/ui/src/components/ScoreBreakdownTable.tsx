import type { DialogueAct, DialogueActScore } from '@prottype2/engine';

export interface ScoreBreakdownTableProps {
  scores: DialogueActScore[];
  selectedAct: DialogueAct;
}

/**
 * F9.3 Dialogue Actスコア内訳（`ui-design-rules.md` 5章）。Act名・BaseWeight・各Modifier値・
 * 最終スコア・確率を表形式で並べ、選択されたActの行をハイライトする。
 */
export function ScoreBreakdownTable({ scores, selectedAct }: ScoreBreakdownTableProps) {
  const modifierNames = [...new Set(scores.flatMap((score) => Object.keys(score.modifiers)))];

  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }} className="mono">
      <thead>
        <tr style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
          <th style={{ textAlign: 'left' }}>act</th>
          <th>baseWeight</th>
          {modifierNames.map((name) => (
            <th key={name}>{name}</th>
          ))}
          <th>score</th>
          <th>probability</th>
        </tr>
      </thead>
      <tbody>
        {scores.map((score) => (
          <tr
            key={score.act}
            style={{
              textAlign: 'right',
              background:
                score.act === selectedAct
                  ? 'color-mix(in oklab, var(--color-accent), transparent 85%)'
                  : 'transparent',
              fontWeight: score.act === selectedAct ? 'bold' : 'normal',
            }}
          >
            <td style={{ textAlign: 'left' }}>{score.act}</td>
            <td>{score.baseWeight.toFixed(2)}</td>
            {modifierNames.map((name) => (
              <td key={name}>{score.modifiers[name]?.toFixed(2) ?? '-'}</td>
            ))}
            <td>{score.score.toFixed(2)}</td>
            <td>{(score.probability * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
