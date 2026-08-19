import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LayerEvent } from '@prottype2/engine';
import { ConversationView } from './ConversationView';
import * as useEngineEventsModule from '../../state/useEngineEvents';

const characters = [
  { id: 'char_a', name: 'ひまり', furigana: null, color: '#FFC20E' },
  { id: 'char_b', name: 'つむぎ', furigana: null, color: '#67be8d' },
];

function mockEvents(
  events: LayerEvent[],
  status: useEngineEventsModule.ConnectionStatus = 'open',
  latestByName: useEngineEventsModule.LatestLayerEventByName = {},
) {
  vi.spyOn(useEngineEventsModule, 'useEngineEvents').mockReturnValue({
    status,
    events,
    latestByName,
  });
}

describe('ConversationView', () => {
  it('turn:completeイベントをChatBubbleとして時系列表示する', () => {
    mockEvents([
      {
        name: 'turn:complete',
        payload: {
          sessionId: 's1',
          turnNo: 1,
          speakerId: 'char_a',
          targetIds: ['char_b'],
          topicId: 'topic_1',
          dialogueAct: 'empathy',
          utterance: 'わかるよ',
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      },
    ]);

    render(<ConversationView wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('ひまり')).toBeInTheDocument();
    expect(screen.getByText('わかるよ')).toBeInTheDocument();
    expect(screen.getByText('接続状態: open')).toBeInTheDocument();
  });

  it('発話がまだない場合はプレースホルダーを表示する', () => {
    mockEvents([], 'connecting');

    render(<ConversationView wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('まだ発話がありません。')).toBeInTheDocument();
  });

  it('characters一覧に無いspeakerIdはidをそのまま表示する', () => {
    mockEvents([
      {
        name: 'turn:complete',
        payload: {
          sessionId: 's1',
          turnNo: 1,
          speakerId: 'char_unknown',
          topicId: 'topic_1',
          dialogueAct: 'question',
          utterance: '?',
          createdAt: '2026-08-13T00:00:00.000Z',
        },
      },
    ]);

    render(<ConversationView wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('char_unknown')).toBeInTheDocument();
  });

  it('session:end（reason=completed）を受信すると完了メッセージを表示する（T41）', () => {
    mockEvents([], 'open', {
      'session:end': { name: 'session:end', payload: { reason: 'completed' } },
    });

    render(<ConversationView wsUrl="ws://localhost/ws" characters={characters} />);

    expect(screen.getByText('会話の生成が完了しました。')).toBeInTheDocument();
  });

  it('session:end（reason=failed）を受信するとエラーメッセージ付きで表示する（T40/T41）', () => {
    mockEvents([], 'open', {
      'session:end': {
        name: 'session:end',
        payload: { reason: 'failed', error: 'LLM呼び出しタイムアウト' },
      },
    });

    render(<ConversationView wsUrl="ws://localhost/ws" characters={characters} />);

    expect(
      screen.getByText('エラーにより会話の生成が中断されました（LLM呼び出しタイムアウト）。'),
    ).toBeInTheDocument();
  });
});
