import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerEvent } from '@prottype2/engine';
import { ParameterDashboard } from './ParameterDashboard';
import * as useEngineEventsModule from '../../state/useEngineEvents';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

function mockEvents(events: LayerEvent[]) {
  vi.spyOn(useEngineEventsModule, 'useEngineEvents').mockReturnValue({
    status: 'open',
    events,
    latestByName: {},
  });
}

describe('ParameterDashboard', () => {
  it('layer:character/topic/relationshipイベントから各セクションを描画する', () => {
    mockEvents([
      {
        name: 'layer:character',
        payload: {
          characterState: {
            id: 'char_a',
            personality: 'テスト',
            emotion: { label: 'joy', intensity: 0.8 },
            energy: 0.6,
            curiosity: 0.5,
            currentGoal: '仲良くなりたい',
            conversationIntent: '共感したい',
            speakingStyle: {
              honorificLevel: 0,
              jokeTolerance: 0.5,
              distance: 0.5,
              addressTerm: '',
            },
          },
        },
      },
      {
        name: 'layer:topic',
        payload: {
          topic: {
            id: 't1',
            label: '週末の予定',
            depth: 0,
            energy: 0.7,
            novelty: 0.5,
            life: 0.6,
            unresolved: false,
          },
          conversationState: {
            currentTopicId: 't1',
            atmosphere: 0.6,
            silenceRisk: 0.1,
            excitement: 0.5,
            elapsedTurns: 3,
            unresolvedQuestions: [],
            rhythm: ['question', 'answer'],
          },
        },
      },
      {
        name: 'layer:relationship',
        payload: {
          speakerId: 'char_a',
          targetId: 'char_b',
          edge: {
            characterId: 'char_a',
            targetCharacterId: 'char_b',
            type: 'friend',
            trust: 0.7,
            intimacy: 0.6,
            respect: 0.5,
            story: [],
          },
        },
      },
    ]);

    render(<ParameterDashboard wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('仲良くなりたい')).toBeInTheDocument();
    expect(screen.getByText('週末の予定')).toBeInTheDocument();
    expect(screen.getByText(/elapsedTurns: 3/)).toBeInTheDocument();
    expect(screen.getAllByText('trust').length).toBeGreaterThan(0);
  });

  it('データが無い場合はプレースホルダーを表示する', () => {
    mockEvents([]);

    render(<ParameterDashboard wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('ひまり: まだ状態がありません')).toBeInTheDocument();
    expect(screen.getByText('Topicはまだありません。')).toBeInTheDocument();
  });
});
