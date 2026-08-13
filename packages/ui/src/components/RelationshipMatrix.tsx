import type { RelationshipEdge } from '@prottype2/engine';
import type { CharacterSummary } from '../api/client';
import { StatBar } from './StatBar';

export interface RelationshipMatrixProps {
  characters: CharacterSummary[];
  edges: RelationshipEdge[];
}

function findEdge(edges: RelationshipEdge[], a: string, b: string): RelationshipEdge | undefined {
  return edges.find(
    (edge) =>
      (edge.characterId === a && edge.targetCharacterId === b) ||
      (edge.characterId === b && edge.targetCharacterId === a),
  );
}

/**
 * F9.2 Relationship Matrix（`class-design.md` 14章）。行/列見出しにキャラクターカラー、
 * セルはtrust/intimacy/respectの強弱をデータ表現用スケール（`StatBar`）で表す
 * （`ui-design-rules.md` 2.2）。キャラクターカラーとマトリクスの中間色スケールを混同しない。
 */
export function RelationshipMatrix({ characters, edges }: RelationshipMatrixProps) {
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          <th />
          {characters.map((character) => (
            <th
              key={character.id}
              style={{ color: character.color, padding: 'var(--space-1)', textAlign: 'left' }}
            >
              {character.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {characters.map((rowCharacter) => (
          <tr key={rowCharacter.id}>
            <th style={{ color: rowCharacter.color, padding: 'var(--space-1)', textAlign: 'left' }}>
              {rowCharacter.name}
            </th>
            {characters.map((colCharacter) => {
              if (rowCharacter.id === colCharacter.id) {
                return (
                  <td key={colCharacter.id} style={{ padding: 'var(--space-1)' }}>
                    —
                  </td>
                );
              }
              const edge = findEdge(edges, rowCharacter.id, colCharacter.id);
              return (
                <td key={colCharacter.id} style={{ padding: 'var(--space-1)', minWidth: 120 }}>
                  {edge ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <StatBar label="trust" value={edge.trust} />
                      <StatBar label="intimacy" value={edge.intimacy} />
                      <StatBar label="respect" value={edge.respect} />
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
