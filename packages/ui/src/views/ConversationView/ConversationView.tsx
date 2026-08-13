import { useMemo } from 'react';
import type { TurnResult } from '@prottype2/engine';
import type { CharacterSummary } from '../../api/client';
import { ChatBubble } from '../../components/ChatBubble';
import { useEngineEvents } from '../../state/useEngineEvents';

export interface ConversationViewProps {
  wsUrl: string;
  characters: CharacterSummary[];
}

// `getReadableTextColor`にそのまま渡せるよう、CSS変数ではなく実際の16進カラーを使う。
const UNKNOWN_CHARACTER_COLOR = '#9CA3AF';

const UNKNOWN_CHARACTER = (id: string): CharacterSummary => ({
  id,
  name: id,
  furigana: null,
  color: UNKNOWN_CHARACTER_COLOR,
});

/** F9.1 リアルタイム会話ビュー（`class-design.md` 14章）。`turn:complete`イベントを時系列表示する。 */
export function ConversationView({ wsUrl, characters }: ConversationViewProps) {
  const { status, events } = useEngineEvents(wsUrl);

  const charactersById = useMemo(() => {
    const map = new Map<string, CharacterSummary>();
    for (const character of characters) map.set(character.id, character);
    return map;
  }, [characters]);

  const resolveCharacter = (id: string): CharacterSummary =>
    charactersById.get(id) ?? UNKNOWN_CHARACTER(id);

  const turns = events
    .filter((event) => event.name === 'turn:complete')
    .map((event) => event.payload as TurnResult);

  return (
    <div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>接続状態: {status}</p>
      {turns.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>まだ発話がありません。</p>
      )}
      {turns.map((turn) => (
        <ChatBubble
          key={turn.turnNo}
          speaker={resolveCharacter(turn.speakerId)}
          targets={(turn.targetIds ?? []).map(resolveCharacter)}
          dialogueAct={turn.dialogueAct}
          utterance={turn.utterance}
        />
      ))}
    </div>
  );
}
