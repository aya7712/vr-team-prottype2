/**
 * 次の発話者を選択する（F6.2）。
 * T12（2体会話）時点では「常に相手を返す」最小実装。3〜4体対応の本実装（名指し優先・
 * 発話頻度バランス・積極性・関係性を考慮したスコアリング）はT29で行う。
 */
export class SpeakerSelector {
  selectNext(participantIds: string[], previousSpeakerId?: string): string {
    if (participantIds.length === 0) {
      throw new Error('SpeakerSelector: participantIdsが空です');
    }
    if (!previousSpeakerId) {
      return participantIds[0];
    }

    const currentIndex = participantIds.indexOf(previousSpeakerId);
    const nextIndex = (currentIndex + 1) % participantIds.length;
    return participantIds[nextIndex];
  }
}
