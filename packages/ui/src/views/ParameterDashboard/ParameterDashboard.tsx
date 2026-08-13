import { useMemo } from 'react';
import type { CharacterState, ConversationState, RelationshipEdge, Topic } from '@prottype2/engine';
import type { CharacterSummary } from '../../api/client';
import { CharacterStateCard } from '../../components/CharacterStateCard';
import { RelationshipMatrix } from '../../components/RelationshipMatrix';
import { StatBar } from '../../components/StatBar';
import { TopicTreeGraph } from '../../components/TopicTreeGraph';
import { useEngineEvents } from '../../state/useEngineEvents';

export interface ParameterDashboardProps {
  wsUrl: string;
  characters: CharacterSummary[];
}

function relationshipEdgeKey(edge: RelationshipEdge): string {
  return [edge.characterId, edge.targetCharacterId].sort().join('::');
}

/** F9.2 パラメータダッシュボード（`class-design.md` 14章）。 */
export function ParameterDashboard({ wsUrl, characters }: ParameterDashboardProps) {
  const { events } = useEngineEvents(wsUrl);

  const characterStates = useMemo(() => {
    const map = new Map<string, CharacterState>();
    for (const event of events) {
      if (event.name === 'layer:character') {
        map.set(event.payload.characterState.id, event.payload.characterState);
      }
    }
    return map;
  }, [events]);

  const relationshipEdges = useMemo(() => {
    const map = new Map<string, RelationshipEdge>();
    for (const event of events) {
      if (event.name === 'layer:relationship') {
        map.set(relationshipEdgeKey(event.payload.edge), event.payload.edge);
      }
    }
    return [...map.values()];
  }, [events]);

  const topics = useMemo(() => {
    const map = new Map<string, Topic>();
    for (const event of events) {
      if (event.name === 'layer:topic') {
        map.set(event.payload.topic.id, event.payload.topic);
      }
    }
    return [...map.values()].sort((a, b) => a.depth - b.depth);
  }, [events]);

  const conversationState: ConversationState | undefined = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.name === 'layer:topic') return event.payload.conversationState;
    }
    return undefined;
  }, [events]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <section>
        <h2 style={{ fontSize: 14 }}>Character State</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {characters.map((character) => {
            const state = characterStates.get(character.id);
            return state ? (
              <CharacterStateCard key={character.id} character={character} state={state} />
            ) : (
              <p key={character.id} style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                {character.name}: まだ状態がありません
              </p>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Conversation State</h2>
        {conversationState ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 300 }}>
            <StatBar label="atmosphere" value={conversationState.atmosphere} />
            <StatBar label="excitement" value={conversationState.excitement} />
            <StatBar label="silenceRisk" value={conversationState.silenceRisk} />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
              elapsedTurns: {conversationState.elapsedTurns} / rhythm:{' '}
              {conversationState.rhythm.join(', ') || '-'}
            </p>
          </div>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>まだデータがありません。</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Topic Tree</h2>
        <TopicTreeGraph topics={topics} currentTopicId={conversationState?.currentTopicId} />
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Relationship Matrix</h2>
        <RelationshipMatrix characters={characters} edges={relationshipEdges} />
      </section>
    </div>
  );
}
