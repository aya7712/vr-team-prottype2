import { useEffect, useMemo, useState } from 'react';
import type {
  CharacterLayerPayload,
  DialoguePlannerLayerPayload,
  LlmLayerPayload,
  MemoryLayerPayload,
  RelationshipLayerPayload,
  TopicLayerPayload,
} from '@prottype2/engine';
import type {
  CharacterSummary,
  LayerEventRecord,
  Session,
  Turn,
  TurnDetail,
} from '../../api/client';
import { apiClient } from '../../api/client';
import { ChatBubble } from '../../components/ChatBubble';
import { CharacterStateCard } from '../../components/CharacterStateCard';
import { FeedbackForm } from '../../components/FeedbackForm';
import { MemoryList } from '../../components/MemoryList';
import { PromptViewer } from '../../components/PromptViewer';
import { RelationshipMatrix } from '../../components/RelationshipMatrix';
import { ScoreBreakdownTable } from '../../components/ScoreBreakdownTable';
import { SessionList } from '../../components/SessionList';
import { StatBar } from '../../components/StatBar';
import { TopicTreeGraph } from '../../components/TopicTreeGraph';

export interface LogBrowserProps {
  characters: CharacterSummary[];
}

function findLayerPayload<T>(
  layerEvents: LayerEventRecord[],
  layer: LayerEventRecord['layer'],
): T | undefined {
  return layerEvents.find((event) => event.layer === layer)?.payload as T | undefined;
}

const UNKNOWN_CHARACTER_COLOR = '#9CA3AF';

function resolveCharacter(characters: CharacterSummary[], id: string): CharacterSummary {
  return (
    characters.find((character) => character.id === id) ?? {
      id,
      name: id,
      furigana: null,
      color: UNKNOWN_CHARACTER_COLOR,
    }
  );
}

/**
 * F9.4 ログ閲覧（`class-design.md` 14章）。セッション一覧から選択したセッションの
 * 過去ターン一覧、さらに選択したターンについて、F9.2/F9.3で使ったのと同じ表示
 * コンポーネント（`CharacterStateCard`, `TopicTreeGraph`, `RelationshipMatrix`,
 * `ScoreBreakdownTable`, `PromptViewer`等）をREST経由のデータで再利用する（T33）。
 */
export function LogBrowser({ characters }: LogBrowserProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedTurnNo, setSelectedTurnNo] = useState<number | null>(null);
  const [detail, setDetail] = useState<TurnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listSessions()
      .then(setSessions)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (sessionId === null) {
      setTurns([]);
      return;
    }
    setTurns([]);
    setSelectedTurnNo(null);
    setDetail(null);
    apiClient
      .listTurns(sessionId)
      .then(setTurns)
      .catch((err: unknown) => setError(String(err)));
  }, [sessionId]);

  useEffect(() => {
    if (sessionId === null || selectedTurnNo === null) {
      setDetail(null);
      return;
    }
    apiClient
      .getTurn(sessionId, selectedTurnNo)
      .then(setDetail)
      .catch((err: unknown) => setError(String(err)));
  }, [sessionId, selectedTurnNo]);

  const speaker = useMemo(
    () => (detail ? resolveCharacter(characters, detail.speakerId) : undefined),
    [characters, detail],
  );
  const targets = useMemo(
    () => (detail?.targetIds ?? []).map((id) => resolveCharacter(characters, id)),
    [characters, detail],
  );

  if (error) {
    return <p style={{ color: 'var(--color-text-muted)' }}>読み込みに失敗しました: {error}</p>;
  }

  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 180 }}>
        <h2 style={{ fontSize: 14 }}>セッション一覧</h2>
        <SessionList
          sessions={sessions}
          selectedSessionId={sessionId}
          onSelect={setSessionId}
          characters={characters}
        />
      </div>

      <div style={{ minWidth: 160 }}>
        <h2 style={{ fontSize: 14 }}>ターン一覧</h2>
        {sessionId === null ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            セッションを選択してください。
          </p>
        ) : turns.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>ターンがありません。</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 12 }}>
            {turns.map((turn) => (
              <li key={turn.turnNo}>
                <button
                  type="button"
                  onClick={() => setSelectedTurnNo(turn.turnNo)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-1)',
                    marginBottom: 4,
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    background:
                      turn.turnNo === selectedTurnNo ? 'var(--color-surface)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--color-text)',
                  }}
                >
                  #{turn.turnNo}{' '}
                  <span style={{ color: resolveCharacter(characters, turn.speakerId).color }}>
                    {resolveCharacter(characters, turn.speakerId).name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!detail || !speaker ? (
          <p style={{ color: 'var(--color-text-muted)' }}>ターンを選択してください。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <ChatBubble
              speaker={speaker}
              targets={targets}
              dialogueAct={detail.dialogueAct}
              utterance={detail.utterance}
            />

            <section>
              <h2 style={{ fontSize: 14 }}>評価</h2>
              <FeedbackForm sessionId={detail.sessionId} turnNo={detail.turnNo} />
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>Character State</h2>
              {(() => {
                const characterPayload = findLayerPayload<CharacterLayerPayload>(
                  detail.layerEvents,
                  'character',
                );
                return characterPayload ? (
                  <CharacterStateCard character={speaker} state={characterPayload.characterState} />
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>データがありません。</p>
                );
              })()}
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>Topic</h2>
              {(() => {
                const topicPayload = findLayerPayload<TopicLayerPayload>(
                  detail.layerEvents,
                  'topic',
                );
                return topicPayload ? (
                  <>
                    <TopicTreeGraph
                      topics={[topicPayload.topic]}
                      currentTopicId={topicPayload.conversationState.currentTopicId}
                    />
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        maxWidth: 300,
                        marginTop: 4,
                      }}
                    >
                      <StatBar
                        label="atmosphere"
                        value={topicPayload.conversationState.atmosphere}
                      />
                      <StatBar
                        label="excitement"
                        value={topicPayload.conversationState.excitement}
                      />
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>データがありません。</p>
                );
              })()}
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>Relationship</h2>
              {(() => {
                const relationshipPayload = findLayerPayload<RelationshipLayerPayload>(
                  detail.layerEvents,
                  'relationship',
                );
                return relationshipPayload ? (
                  <RelationshipMatrix characters={characters} edges={[relationshipPayload.edge]} />
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>データがありません。</p>
                );
              })()}
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>Dialogue Planner</h2>
              {(() => {
                const plannerPayload = findLayerPayload<DialoguePlannerLayerPayload>(
                  detail.layerEvents,
                  'dialoguePlanner',
                );
                return plannerPayload ? (
                  <ScoreBreakdownTable
                    scores={plannerPayload.scores}
                    selectedAct={plannerPayload.selectedAct}
                  />
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>データがありません。</p>
                );
              })()}
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>Memory Retriever</h2>
              <MemoryList
                items={
                  findLayerPayload<MemoryLayerPayload>(detail.layerEvents, 'memory')?.retrieved ??
                  []
                }
              />
            </section>

            <section>
              <h2 style={{ fontSize: 14 }}>LLM</h2>
              {(() => {
                const llmPayload = findLayerPayload<LlmLayerPayload>(detail.layerEvents, 'llm');
                // Issue #5 plan-h: 発話生成は「内容決定（stage1）」→「口調整形（stage2）」の
                // 2段階。stage2に他キャラクターの情報が混入していないかをここでも目視確認
                // できるよう、両段を分けて表示する。
                return llmPayload ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div>
                      <h3
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                          margin: '0 0 4px',
                        }}
                      >
                        Stage 1: 内容決定
                      </h3>
                      <PromptViewer
                        prompt={llmPayload.contentStage.prompt}
                        rawOutput={llmPayload.contentStage.rawOutput}
                      />
                    </div>
                    <div>
                      <h3
                        style={{
                          fontSize: 12,
                          color: 'var(--color-text-muted)',
                          margin: '0 0 4px',
                        }}
                      >
                        Stage 2: 口調整形（他キャラクターの情報は含まれない）
                      </h3>
                      <PromptViewer prompt={llmPayload.prompt} rawOutput={llmPayload.rawOutput} />
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-muted)' }}>データがありません。</p>
                );
              })()}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
