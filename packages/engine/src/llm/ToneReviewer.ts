import type { PromptBuilder } from './PromptBuilder.js';
import type { LlmClient } from './LlmClient.js';
import { OutputParser } from './OutputParser.js';

// 審査・書き換えは「判定を安定させたい」タスクのため、通常の発話生成（既定0.8）より
// 低いtemperatureを既定にする（実装者判断。features.md/class-design.mdに明記なし）。
const DEFAULT_REVIEW_TEMPERATURE = 0.2;

export interface ToneReviewCharacterProfile {
  name: string;
  personality: string;
  toneSample: string;
  firstPerson: string;
}

export interface ToneReviewInput {
  utterance: string;
  speaker: ToneReviewCharacterProfile;
  // 直前に発言していた別のキャラクター。会話開始直後（1発話目）はnull。
  previousSpeaker: ToneReviewCharacterProfile | null;
  // 話者のCharacterDefRecord.llm.model（存在する場合）。E2E確認（T43）で、未指定時に
  // TogetherClientのハードコードされた既定モデル（`google/gemma-3n-E4B-it`）が
  // Together AI側でserverless提供終了済みのため全審査呼び出しが400エラーで失敗する
  // 不具合が発覚した。発話生成本体（ConversationManager.buildPrompt/llmClient.complete）が
  // 使うのと同じモデルを審査にも使うことで、キャラクターごとに動作確認済みのモデルを
  // 確実に使う（実装者判断）。
  model?: string;
}

export interface ToneReviewResult {
  // 審査後、採用すべきセリフ本文（逸脱なし/審査失敗時は元のutteranceと同じ値）。
  utterance: string;
  // 実際にセリフが書き換わったか（ログ・目視確認用。判定自体は常にLLMの出力をそのまま採用するため
  // このフラグは付随情報であり、書き換えの要否判断そのものには使わない）。完全一致比較のため、
  // 意味的には無変更でも句読点等の表記だけ変わった場合はtrueになりうる（review()実装コメント参照）。
  applied: boolean;
  prompt: string;
  // 審査呼び出しが失敗した場合はnull。
  rawOutput: string | null;
  error?: string;
}

/**
 * 生成済みの発話が話者本人の口調（語尾・一人称・敬語レベル）から逸脱していないかを、
 * 追加のLLM呼び出し1回で判定・書き換えする（Issue #5対応、plan-e）。
 *
 * plan-c（文字列一致ヒューリスティックでの逸脱検知＋同一プロンプトでの再生成）とは異なり、
 * 判定自体もLLMに委ね、「逸脱していれば書き直し、なければそのまま出力せよ」という
 * 1回の呼び出しで検知と書き換えを同時に行う（判定用・書き換え用で2回呼ばない）。
 */
export class ToneReviewer {
  constructor(
    private readonly promptBuilder: PromptBuilder,
    private readonly llmClient: LlmClient,
    private readonly outputParser: OutputParser = new OutputParser(),
  ) {}

  async review(input: ToneReviewInput): Promise<ToneReviewResult> {
    // T43のE2E確認で発見: 発話生成本体（llmClient.complete）が空文字列を返すことが稀にあり
    // （Together AI側の応答が空になるケース。本Issueのスコープ外の既存のリスクで、
    // ここでは対処しない）、そのまま審査に回すと「審査対象のセリフが入力されていません」
    // のような、意味の異なる応答をそのまま採用してしまう不具合があった。審査対象が
    // 空/空白のみの場合は、審査してもLLMに判断材料が無く有害無益なためLLM呼び出し自体を
    // 行わず、そのまま（空の）utteranceを採用する。
    if (input.utterance.trim().length === 0) {
      return { utterance: input.utterance, applied: false, prompt: '', rawOutput: null };
    }

    // implementation-rules.md 5章は「外部APIのエラーは複雑なフォールバックを作らず
    // 上位に伝播させる」を原則とするが、ToneReviewerは既に確定した発話に対する追加の
    // 品質チェックであり、ここで例外を伝播させると審査前には成立していたターンが
    // 丸ごと失敗扱いになってしまう。そのため本クラスに限り、プロンプト構築〜LLM呼び出し
    // 全体を通じて何が起きても審査前のutteranceをそのまま採用するフォールバックを
    // 明示的に実装する（Issueのplan-e案の"risks"に明記された要求）。
    let prompt = '';
    try {
      prompt = this.promptBuilder.build('utterance/tone_review', {
        characterName: input.speaker.name,
        personality: input.speaker.personality,
        toneSample: input.speaker.toneSample,
        firstPerson: input.speaker.firstPerson,
        otherCharacterName: input.previousSpeaker?.name ?? '(なし。会話開始直後)',
        otherToneSample: input.previousSpeaker?.toneSample ?? '(なし)',
        otherFirstPerson: input.previousSpeaker?.firstPerson ?? '(なし)',
        utterance: input.utterance,
      });
      const rawOutput = await this.llmClient.complete(prompt, {
        model: input.model,
        temperature: DEFAULT_REVIEW_TEMPERATURE,
      });
      const reviewed = this.outputParser.extractUtterance(rawOutput);
      const finalUtterance = reviewed.length > 0 ? reviewed : input.utterance;
      // code-reviewでの指摘（既知の限界、対応は見送り）: appliedは完全一致比較のため、
      // LLMが「逸脱なし」のつもりで句読点や引用符の付け方だけ変えて返した場合も
      // trueになりうる（意味的な書き換えの有無を厳密には表さない）。実際に採用する
      // utterance自体はどちらの場合も同じ（LLMの出力をそのまま採用）であり誤りではないため、
      // このappliedはあくまで目視確認用の付随情報（ログ・レポート上のバッジ表示等）と割り切り、
      // 意味解析による厳密な差分検知（過剰な実装になるためプロトタイプでは見送り）は行わない。
      return {
        utterance: finalUtterance,
        applied: finalUtterance !== input.utterance,
        prompt,
        rawOutput,
      };
    } catch (err) {
      return {
        utterance: input.utterance,
        applied: false,
        prompt,
        rawOutput: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
