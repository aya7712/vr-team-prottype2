import type { Topic } from '../types/topic.js';

// 「片方のサブ会話のenergy低下」（features.md F6.3）の閾値。明確な数値の指定が
// features.md/class-design.mdに無いため実装者判断で設定した（implementation-rules.md 9章）。
const LOW_ENERGY_MERGE_THRESHOLD = 0.3;

/**
 * 3〜4体会話における話題の分岐・合流を管理する（F6.3、T30）。
 *
 * class-design.mdではAPIの詳細が未確定だったため、以下を実装者判断で設計した:
 * - 「分岐」は、参加者全員ではなく一部のサブグループ（`Topic.participantIds`）に
 *   スコープされた子Topicとして表現する。既存の`TopicTree`（親子関係）をそのまま使い、
 *   分岐先のTopicが「誰の会話か」を`participantIds`で追加管理する。
 * - 「合流」判定は次の2条件のいずれかで検出する:
 *   1. 同じ親を持つ兄弟のサブグループTopic同士で、一方のenergyが閾値を下回った場合
 *      （features.md F6.3「片方のサブ会話のenergy低下」）。
 *   2. ある発話の話者・対象が異なるサブグループにまたがる場合（「発話による橋渡し」）。
 * - 合流後のTopicは、参加者の合併・パラメータの再結合を行った新しいTopicとして返す
 *   （呼び出し側がTopicTreeへ反映する）。
 */
export class TopicBranchMerger {
  // 親Topicから、指定した参加者サブグループにスコープした子Topic（分岐）を作る。
  branch(parentTopic: Topic, participantIds: string[], label: string): Topic {
    return {
      id: crypto.randomUUID(),
      parentTopicId: parentTopic.id,
      label,
      depth: parentTopic.depth + 1,
      energy: 0.5,
      novelty: 0.5,
      life: 0.5,
      unresolved: false,
      participantIds,
    };
  }

  // 同じ親を持つサブグループTopic同士で、一方のenergyが閾値を下回っているペアを探す。
  // 見つからない場合はnullを返す。
  findLowEnergyMergeCandidate(topics: Topic[]): [Topic, Topic] | null {
    const branches = topics.filter((topic) => topic.participantIds !== undefined);

    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const a = branches[i];
        const b = branches[j];
        if (a.parentTopicId === undefined || a.parentTopicId !== b.parentTopicId) continue;
        if (a.energy < LOW_ENERGY_MERGE_THRESHOLD || b.energy < LOW_ENERGY_MERGE_THRESHOLD) {
          return [a, b];
        }
      }
    }
    return null;
  }

  // ある発話がサブグループをまたいでいる（話者と対象が異なるサブグループに属する）場合、
  // その2つのTopicを橋渡し対象として返す。またいでいなければnullを返す。
  findBridgedTopics(
    topics: Topic[],
    speakerId: string,
    targetIds: string[],
  ): [Topic, Topic] | null {
    const speakerTopic = topics.find((topic) => topic.participantIds?.includes(speakerId) ?? false);
    const targetTopic = topics.find(
      (topic) =>
        topic.participantIds !== undefined &&
        topic.id !== speakerTopic?.id &&
        targetIds.some((id) => topic.participantIds?.includes(id)),
    );
    if (!speakerTopic || !targetTopic) return null;
    return [speakerTopic, targetTopic];
  }

  // 2つのサブグループTopicを1つに合流させる。パラメータは平均・和集合で再結合する。
  merge(a: Topic, b: Topic): Topic {
    const participantIds = [...new Set([...(a.participantIds ?? []), ...(b.participantIds ?? [])])];

    return {
      id: crypto.randomUUID(),
      parentTopicId: a.parentTopicId,
      label: `${a.label} / ${b.label}`,
      depth: Math.min(a.depth, b.depth),
      energy: (a.energy + b.energy) / 2,
      novelty: (a.novelty + b.novelty) / 2,
      // 合流は会話の勢いが再び高まる契機となるため、lifeは高い方を引き継ぐ
      // （実装者判断、implementation-rules.md 9章）。
      life: Math.max(a.life, b.life),
      unresolved: a.unresolved || b.unresolved,
      participantIds,
    };
  }
}
