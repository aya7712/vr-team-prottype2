import type { CharacterSummary, Session } from '../api/client';

export interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  characters: CharacterSummary[];
}

function resolveCharacter(characters: CharacterSummary[], id: string): CharacterSummary {
  return (
    characters.find((character) => character.id === id) ?? {
      id,
      name: id,
      furigana: null,
      color: 'var(--color-text)',
    }
  );
}

/** F9.4 ログ閲覧のセッション一覧（`class-design.md` 14章、T33）。クリックで選択する。 */
export function SessionList({
  sessions,
  selectedSessionId,
  onSelect,
  characters,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>セッションがありません。</p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 12 }}>
      {sessions.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            onClick={() => onSelect(session.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 'var(--space-1)',
              marginBottom: 4,
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: session.id === selectedSessionId ? 'var(--color-surface)' : 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text)',
            }}
          >
            <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {session.id.slice(0, 8)}…
            </div>
            <div>
              {session.participantIds.map((id, index) => {
                const character = resolveCharacter(characters, id);
                return (
                  <span key={id}>
                    {index > 0 && ', '}
                    <span style={{ color: character.color }}>{character.name}</span>
                  </span>
                );
              })}
            </div>
            <div>{session.initialTopic}</div>
            <div style={{ color: 'var(--color-text-muted)' }}>
              {session.status} / {new Date(session.createdAt).toLocaleString('ja-JP')}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
