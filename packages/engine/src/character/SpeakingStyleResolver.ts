import type { SpeakingStyleModifier } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';

/** RelationshipContextをSpeakingStyleModifierへ適用するだけの薄いクラス（F1.3）。 */
export class SpeakingStyleResolver {
  resolve(relCtx: RelationshipContext): SpeakingStyleModifier {
    return {
      honorificLevel: relCtx.honorificLevel,
      jokeTolerance: relCtx.jokeTolerance,
      distance: relCtx.distance,
      addressTerm: relCtx.addressTerm,
    };
  }

  /**
   * SpeakingStyleModifierの数値（honorificLevel/jokeTolerance/distance/addressTerm）を
   * 自然言語の口調説明に変換する（Issue #1 plan-b）。
   *
   * 現状は数値をそのままプロンプトへ埋め込んでいるため、toneSample（口調サンプル文）との
   * 結びつきが弱く、キャラクター固有の話し方が十分に強調されていなかった。
   * ここで生成した説明文をConversationManager.buildPromptがtoneSampleと並べて渡すことで、
   * 他キャラの発言（recentDialogue）とは独立に自キャラの口調情報の密度を上げる。
   */
  describe(style: SpeakingStyleModifier): string {
    const parts = [
      this.describeHonorific(style.honorificLevel),
      this.describeDistance(style.distance),
      this.describeJoke(style.jokeTolerance),
    ];
    if (style.addressTerm) {
      parts.push(`相手を「${style.addressTerm}」と呼ぶ`);
    }
    return parts.join('。') + '。';
  }

  // 敬語レベル: 1に近いほど丁寧、0に近いほどタメ口寄り。
  private describeHonorific(level: number): string {
    if (level >= 0.75) return '丁寧語・敬語を崩さずに話す';
    if (level >= 0.45) return 'ややかしこまった、丁寧寄りの言葉遣いで話す';
    if (level >= 0.2) return 'フランクだが最低限の礼儀は残した言葉遣いで話す';
    return 'タメ口中心のくだけた言葉遣いで話す';
  }

  // 距離感: 1に近いほど他人行儀、0に近いほど近しい。
  private describeDistance(distance: number): string {
    if (distance >= 0.75) return '相手とは一定の距離を保った他人行儀な態度を取る';
    if (distance >= 0.45) return '礼儀は保ちつつ、まだ少し距離のある態度を取る';
    if (distance >= 0.2) return '親しみのある、距離の近い態度を取る';
    return '遠慮のない、とても近い距離感で接する';
  }

  // 冗談許容度: 1に近いほど軽口を歓迎、0に近いほど控えめ。
  private describeJoke(tolerance: number): string {
    if (tolerance >= 0.75) return '軽口や冗談を積極的に交える';
    if (tolerance >= 0.45) return '時々軽い冗談を挟む程度に留める';
    return '冗談はほとんど交えず落ち着いて話す';
  }
}
