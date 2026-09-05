import type { PromptBuilder } from './PromptBuilder.js';
import type { LlmClient } from './LlmClient.js';

// 判定を安定させたいタスクのため、通常の発話生成（既定0.8）より低いtemperatureを既定にする
// （ToneReviewer、PR #8と同じ実装者判断。features.md/class-design.mdに明記なし）。
const DEFAULT_ADVISOR_TEMPERATURE = 0.2;

export interface SpeakerBalanceParticipant {
  characterId: string;
  name: string;
  // 直近の会話履歴（SessionState.recentUtterances）内でのこのキャラクターの発話回数。
  recentSpeakCount: number;
}

export interface SpeakerBalanceAdvisorInput {
  participants: SpeakerBalanceParticipant[];
  // 直近の会話を"名前: 発話"の行に整形し改行で連結したもの。空文字列（会話開始直後で
  // まだ発話履歴が無い等）の場合は判定材料が無いためLLM呼び出し自体を行わない。
  recentDialogue: string;
  // 直前の話者のCharacterDefRecord.llm.model（存在する場合）。ToneReviewer（PR #8）と
  // 同じ理由（TogetherClientのハードコードされた既定モデルがTogether AI側で
  // serverless提供終了済みのため、未指定だと呼び出しが常に失敗しうる）で、
  // 呼び出し元（ConversationManager）から明示的に渡す。
  model?: string;
}

export interface SpeakerBalanceAdvice {
  // 現在の発話の偏りが内容（進行中の自分語り・二人の思い出話等）によって正当化されるか。
  // 判定なし（呼び出し失敗・判定材料なし）の場合はfalse（＝頻度バランス補正への影響なし）。
  justified: boolean;
  // 理由のない偏りがあると判定された場合に次に話すべきキャラクターのID。
  // 参加者一覧に無いIDが返った場合・判定なしの場合はnull。
  recommendedSpeakerId: string | null;
  reason: string;
  prompt: string;
  // 判定材料が無い/呼び出し自体が失敗した場合はnull。
  rawOutput: string | null;
  error?: string;
}

// 呼び出しをスキップ、または失敗した場合の既定値（＝SpeakerSelector側の補正に
// 一切影響を与えない、既存挙動のままのフォールバック）。
const NO_ADVICE: Omit<SpeakerBalanceAdvice, 'prompt'> = {
  justified: false,
  recommendedSpeakerId: null,
  reason: '',
  rawOutput: null,
};

/**
 * 発話者選択の直前に、直近の発話バランスが内容的に正当化されるかを追加のLLM呼び出し1回で
 * 判定する（Issue #16対応、plan-c）。ヒューリスティック（頻度カウント・Act種別等）では
 * 「自然な会話の流れかどうか」という意味的な判断が難しいため、LLMに1回の呼び出しで
 * 判定・次話者提案を同時に行わせる（判定用・提案用で2回呼ばない）。
 *
 * ToneReviewer（PR #8、Issue #5対応）と同じ設計パターンを踏襲している: 呼び出し失敗時は
 * 判定なし（既存のSpeakerSelectorの頻度バランス補正のみが働く、既存挙動のまま）に
 * フォールバックする。
 */
export class SpeakerBalanceAdvisor {
  constructor(
    private readonly promptBuilder: PromptBuilder,
    private readonly llmClient: LlmClient,
  ) {}

  async advise(input: SpeakerBalanceAdvisorInput): Promise<SpeakerBalanceAdvice> {
    if (input.participants.length === 0 || input.recentDialogue.trim().length === 0) {
      return { ...NO_ADVICE, prompt: '' };
    }

    // implementation-rules.md 5章は「外部APIのエラーは複雑なフォールバックを作らず
    // 上位に伝播させる」を原則とするが、この判定はターンの進行自体には必須ではない
    // 追加の補助情報であり、ここで例外を伝播させると、判定前には成立していたはずの
    // ターン全体（発話生成含む）が丸ごと失敗扱いになってしまう。ToneReviewer（PR #8）と
    // 同じ理由により、本クラスに限りプロンプト構築〜LLM呼び出し〜JSON解析のいずれが
    // 失敗しても「判定なし」にフォールバックする。
    let prompt = '';
    try {
      prompt = this.promptBuilder.build('speakerBalance/advisor', {
        participantList: input.participants
          .map((p) => `- ${p.characterId}（${p.name}）: 直近${p.recentSpeakCount}回`)
          .join('\n'),
        recentDialogue: input.recentDialogue,
      });
      const rawOutput = await this.llmClient.complete(prompt, {
        model: input.model,
        temperature: DEFAULT_ADVISOR_TEMPERATURE,
      });
      const judgement = this.parseJudgement(
        rawOutput,
        input.participants.map((p) => p.characterId),
      );
      return { ...judgement, prompt, rawOutput };
    } catch (err) {
      return {
        ...NO_ADVICE,
        prompt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // LLM出力から判定用JSONを抽出する。プロンプトで「1行のJSONだけ」を指示しているが、
  // モデルが指示に従わず前後に説明文を付け足す場合に備え、最初の"{"から最後の"}"までを
  // 抜き出してからパースする。
  private parseJudgement(
    rawOutput: string,
    validCharacterIds: string[],
  ): Pick<SpeakerBalanceAdvice, 'justified' | 'recommendedSpeakerId' | 'reason'> {
    const start = rawOutput.indexOf('{');
    const end = rawOutput.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('SpeakerBalanceAdvisor: LLM出力からJSONオブジェクトが見つかりません');
    }
    const parsed = JSON.parse(rawOutput.slice(start, end + 1)) as {
      justified?: unknown;
      recommendedSpeakerId?: unknown;
      reason?: unknown;
    };

    // 参加者一覧に無いID（LLMの幻覚）が返った場合は、SpeakerSelector側で存在しない候補への
    // ボーナス付与が起きないようnullに落とす。
    const recommendedSpeakerId =
      typeof parsed.recommendedSpeakerId === 'string' &&
      validCharacterIds.includes(parsed.recommendedSpeakerId)
        ? parsed.recommendedSpeakerId
        : null;

    return {
      justified: parsed.justified === true,
      recommendedSpeakerId,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  }
}
