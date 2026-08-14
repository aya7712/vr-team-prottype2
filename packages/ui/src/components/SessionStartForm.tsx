import { useState } from 'react';
import type { CharacterSummary } from '../api/client';
import { apiClient } from '../api/client';

export interface SessionStartFormProps {
  characters: CharacterSummary[];
  onStarted?: (sessionId: string) => void;
}

const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 4;
const DEFAULT_MAX_TURNS = 50;

/**
 * F6.6 シナリオ入力（T34）。リアルタイム画面から参加キャラクター・ターン数を指定して
 * セッションを作成し（`POST /api/sessions`）、そのまま連続生成を開始する
 * （`POST /api/sessions/:id/run`）。
 */
export function SessionStartForm({ characters, onStarted }: SessionStartFormProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [maxTurns, setMaxTurns] = useState(DEFAULT_MAX_TURNS);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((existing) => existing !== id)
        : prev.length < MAX_PARTICIPANTS
          ? [...prev, id]
          : prev,
    );
  };

  const canStart =
    selectedIds.length >= MIN_PARTICIPANTS &&
    selectedIds.length <= MAX_PARTICIPANTS &&
    maxTurns >= 1 &&
    !starting;

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    setError(null);
    let createdSessionId: string | null = null;
    try {
      const session = await apiClient.createSession({ participantIds: selectedIds });
      createdSessionId = session.id;
      await apiClient.runSession(session.id, maxTurns);
      onStarted?.(session.id);
    } catch (err) {
      setError(
        createdSessionId
          ? `${String(err)}（セッションid: ${createdSessionId} は作成済みです）`
          : String(err),
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        padding: 'var(--space-2)',
        marginBottom: 'var(--space-2)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 4 }}>
        {characters.map((character) => (
          <label key={character.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(character.id)}
              onChange={() => toggle(character.id)}
            />
            <span style={{ color: character.color }}>{character.name}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          ターン数
          <input
            type="number"
            min={1}
            value={maxTurns}
            onChange={(e) => setMaxTurns(Number(e.target.value))}
            style={{ width: 64 }}
          />
        </label>
        <button type="button" onClick={handleStart} disabled={!canStart}>
          {starting ? '開始中…' : '会話を開始'}
        </button>
        {error && <span style={{ color: 'var(--color-text-muted)' }}>失敗しました: {error}</span>}
      </div>
      {selectedIds.length > 0 && selectedIds.length < MIN_PARTICIPANTS && (
        <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
          参加キャラクターは{MIN_PARTICIPANTS}体以上選択してください。
        </p>
      )}
    </div>
  );
}
