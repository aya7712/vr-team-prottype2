// energy/novelty/life更新のトリガーとなるイベント種別（features.md F4.3）。
export type TopicEventType =
  'questioned' | 'laughed' | 'newInfo' | 'empathized' | 'repeated' | 'denied' | 'prolonged';

export interface TopicEvent {
  type: TopicEventType;
}

// TopicClassifier.classify()の判定結果（F4.2の3段階判定）。
// 実際のTopicノード生成・TopicTreeへの追加は呼び出し側（ConversationManager等）が行う。
export type TopicClassificationResult =
  | { kind: 'same'; topicId: string }
  | { kind: 'child'; parentTopicId: string; suggestedLabel: string }
  | { kind: 'new'; suggestedLabel: string };
