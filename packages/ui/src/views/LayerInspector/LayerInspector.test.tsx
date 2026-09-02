import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerEvent } from '@prottype2/engine';
import { LayerInspector } from './LayerInspector';
import * as useEngineEventsModule from '../../state/useEngineEvents';

function mockLatest(events: LayerEvent[]) {
  const latestByName: Partial<Record<LayerEvent['name'], LayerEvent>> = {};
  for (const event of events) latestByName[event.name] = event;
  vi.spyOn(useEngineEventsModule, 'useEngineEvents').mockReturnValue({
    status: 'open',
    events,
    latestByName,
  });
}

describe('LayerInspector', () => {
  it('各レイヤーの直近データを表示する', () => {
    mockLatest([
      {
        name: 'layer:topic',
        payload: {
          topic: {
            id: 't1',
            label: '週末の予定',
            depth: 0,
            energy: 0.5,
            novelty: 0.5,
            life: 0.5,
            unresolved: false,
          },
          conversationState: {
            currentTopicId: 't1',
            atmosphere: 0.5,
            silenceRisk: 0.1,
            excitement: 0.5,
            elapsedTurns: 1,
            unresolvedQuestions: [],
            rhythm: [],
          },
        },
      },
      {
        name: 'layer:dialoguePlanner',
        payload: {
          scores: [
            { act: 'empathy', baseWeight: 1, modifiers: {}, score: 1, probability: 0.7 },
            { act: 'question', baseWeight: 0.5, modifiers: {}, score: 0.5, probability: 0.3 },
          ],
          selectedAct: 'empathy',
          expectation: { expectedActs: [] },
        },
      },
      {
        name: 'layer:memory',
        payload: {
          retrieved: [
            {
              id: 'm1',
              source: 'preset',
              owner: 'char_a',
              participants: ['char_a'],
              summary: '前に旅行した話',
              tags: [],
              importance: 0.8,
              shareable: true,
            },
          ],
          filteredOutCount: 0,
        },
      },
      {
        name: 'layer:llm',
        payload: { prompt: 'これはプロンプト', rawOutput: 'これは生出力' },
      },
    ]);

    render(<LayerInspector wsUrl="ws://localhost/ws" />);

    expect(screen.getByText('週末の予定')).toBeInTheDocument();
    expect(screen.getAllByText('empathy').length).toBeGreaterThan(0);
    expect(screen.getByText(/前に旅行した話/)).toBeInTheDocument();
    expect(screen.getByText('これはプロンプト')).toBeInTheDocument();
  });

  it('データが無い場合は各セクションにプレースホルダーを表示する', () => {
    mockLatest([]);

    render(<LayerInspector wsUrl="ws://localhost/ws" />);

    expect(screen.getAllByText('まだデータがありません。').length).toBeGreaterThan(0);
    expect(screen.getByText('想起された記憶はありません。')).toBeInTheDocument();
  });
});
