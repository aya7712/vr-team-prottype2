import type { PromptBuilder } from './PromptBuilder.js';
import type { LlmClient } from './LlmClient.js';
import type { OutputParser } from './OutputParser.js';
import type { DialogueAct } from '../types/dialogueAct.js';

export interface ToneStylistInput {
  contentIntent: string;
  characterName: string;
  personality: string;
  toneSample: string;
  firstPerson: string;
  emotion: string;
  speakingStyle: string;
  dialogueAct: DialogueAct;
}

export interface ToneStylistOptions {
  temperature?: number;
  model?: string;
}

export interface ToneStylistResult {
  prompt: string;
  rawOutput: string;
  utterance: string;
}

/**
 * 2段階生成パイプライン（Issue #5 plan-h）の後段。内容決定LLM（`ConversationManager`側、
 * F7.1）が決めた「話したい内容」を、話者本人のtoneSample/speakingStyle等だけを使って
 * 口調に整形する。
 *
 * PR #8のレビュー指摘（「別のキャラクターの情報を入れると口調に引っ張られるので入れないで
 * ください」「引っ張られているかを見るのではなく該当キャラの口調として正しいかを確認させて
 * ください」）、およびIssue #5コメントの「口調を整えるLLMは話したい事とキャラクターの
 * 口調サンプルだけを見て口調を整える」という指示を踏まえ、`ToneStylistInput`は話者本人の
 * 情報と`contentIntent`のみで構成する。`recentDialogue`はもちろん、話し相手の名前や
 * 呼び方（`targetName`/`addressTerm`）すら意図的に含めていない（型として受け取れないため
 * 呼び出し元も渡しようがない）。
 */
export class ToneStylist {
  constructor(
    private readonly promptBuilder: PromptBuilder,
    private readonly llmClient: LlmClient,
    private readonly outputParser: OutputParser,
  ) {}

  async stylize(
    input: ToneStylistInput,
    options: ToneStylistOptions = {},
  ): Promise<ToneStylistResult> {
    const prompt = this.promptBuilder.build('utterance/tone_style', {
      characterName: input.characterName,
      personality: input.personality,
      toneSample: input.toneSample,
      firstPerson: input.firstPerson,
      emotion: input.emotion,
      speakingStyle: input.speakingStyle,
      dialogueAct: input.dialogueAct,
      contentIntent: input.contentIntent,
    });
    const rawOutput = await this.llmClient.complete(prompt, options);
    const utterance = this.outputParser.extractUtterance(rawOutput);
    return { prompt, rawOutput, utterance };
  }
}
