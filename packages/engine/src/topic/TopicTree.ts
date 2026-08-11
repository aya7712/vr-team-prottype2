import type { Topic } from '../types/topic.js';

/** Topicのツリー構造を保持する（F4.1）。 */
export class TopicTree {
  private readonly topics = new Map<string, Topic>();

  addTopic(topic: Topic): void {
    this.topics.set(topic.id, topic);
  }

  getTopic(id: string): Topic | undefined {
    return this.topics.get(id);
  }

  updateTopic(id: string, patch: Partial<Topic>): Topic {
    const current = this.topics.get(id);
    if (!current) {
      throw new Error(`TopicTree: topic "${id}" が見つかりません`);
    }
    const updated = { ...current, ...patch };
    this.topics.set(id, updated);
    return updated;
  }

  getChildren(parentId: string): Topic[] {
    return [...this.topics.values()].filter((topic) => topic.parentTopicId === parentId);
  }

  getRootTopics(): Topic[] {
    return [...this.topics.values()].filter((topic) => topic.parentTopicId === undefined);
  }

  getAllTopics(): Topic[] {
    return [...this.topics.values()];
  }

  // F4.1: depthはTopicツリーの階層から機械的に算出する（parent.depth + 1）。
  computeDepth(parentTopicId: string | undefined): number {
    if (!parentTopicId) return 0;
    const parent = this.topics.get(parentTopicId);
    if (!parent) {
      throw new Error(`TopicTree: parentTopic "${parentTopicId}" が見つかりません`);
    }
    return parent.depth + 1;
  }
}
