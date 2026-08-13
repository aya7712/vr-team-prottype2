import { PromptViewer } from '../../components/PromptViewer';
import { ScoreBreakdownTable } from '../../components/ScoreBreakdownTable';
import { useEngineEvents } from '../../state/useEngineEvents';

export interface LayerInspectorProps {
  wsUrl: string;
}

/**
 * F9.3 レイヤー別計算過程ビュー（`class-design.md` 14章）。直近ターンで各レイヤーが
 * 行った計算の内訳を段階的に表示し、「なぜこの発話行為が選ばれたか」を追跡できるようにする。
 */
export function LayerInspector({ wsUrl }: LayerInspectorProps) {
  const { latestByName } = useEngineEvents(wsUrl);

  const topicEvent = latestByName['layer:topic'];
  const dialoguePlannerEvent = latestByName['layer:dialoguePlanner'];
  const memoryEvent = latestByName['layer:memory'];
  const llmEvent = latestByName['layer:llm'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <section>
        <h2 style={{ fontSize: 14 }}>Topic Analyzer</h2>
        {topicEvent ? (
          <p style={{ fontSize: 12 }}>
            現在のTopic: <strong>{topicEvent.payload.topic.label}</strong>（
            {topicEvent.payload.topic.id}） / unresolved:{' '}
            {topicEvent.payload.topic.unresolved ? 'true' : 'false'}
          </p>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>まだデータがありません。</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Dialogue Planner</h2>
        {dialoguePlannerEvent ? (
          <>
            <ScoreBreakdownTable
              scores={dialoguePlannerEvent.payload.scores}
              selectedAct={dialoguePlannerEvent.payload.selectedAct}
            />
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginTop: 'var(--space-1)',
              }}
            >
              選択されたAct: <strong>{dialoguePlannerEvent.payload.selectedAct}</strong>
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>まだデータがありません。</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Memory Retriever</h2>
        {memoryEvent && memoryEvent.payload.retrieved.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 'var(--space-2)', fontSize: 12 }}>
            {memoryEvent.payload.retrieved.map((memory) => (
              <li key={memory.id}>
                [{memory.shareable ? 'Shared' : 'Self'}] {memory.summary}（重要度{' '}
                {memory.importance.toFixed(2)}）
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>想起された記憶はありません。</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>LLM</h2>
        {llmEvent ? (
          <PromptViewer prompt={llmEvent.payload.prompt} rawOutput={llmEvent.payload.rawOutput} />
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>まだデータがありません。</p>
        )}
      </section>
    </div>
  );
}
