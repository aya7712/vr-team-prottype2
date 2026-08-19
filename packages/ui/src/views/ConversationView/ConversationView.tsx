import { useMemo } from 'react';
import type { SessionEndPayload, TurnResult } from '@prottype2/engine';
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

// T41: session:endのreasonをユーザー向け文言に変換する。
function describeSessionEnd(payload: SessionEndPayload): string {
  switch (payload.reason) {
    case 'completed':
      return '会話の生成が完了しました。';
    case 'stopped':
      return '会話の生成を停止しました。';
    case 'failed':
      return `エラーにより会話の生成が中断されました${payload.error ? `（${payload.error}）` : ''}。`;
    default: {
      // SessionEndReasonが将来拡張された場合にコンパイルエラーで気づけるようにする。
      const exhaustiveCheck: never = payload.reason;
      throw new Error(`未知のsession:end reason: ${String(exhaustiveCheck)}`);
    }
  }
}

/** F9.1 リアルタイム会話ビュー（`class-design.md` 14章）。`turn:complete`イベントを時系列表示する。 */
export function ConversationView({ wsUrl, characters }: ConversationViewProps) {
  const { status, events, latestByName } = useEngineEvents(wsUrl);
  const sessionEnd = latestByName['session:end'];

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
      {sessionEnd && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
          {describeSessionEnd(sessionEnd.payload)}
        </p>
      )}
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
