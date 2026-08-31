import type { CharacterBrain } from '../character/CharacterBrain.js';
import type { CharacterDefRecord } from '../data/types.js';
import type { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipUpdater } from '../relationship/RelationshipUpdater.js';
import type { MemoryRetriever } from '../memory/MemoryRetriever.js';
import type {
  PromptBuilder,
  LlmClient,
  OutputParser,
  OtherCharacterToneProfile,
  ToneConsistencyCheckResult,
} from '../llm/index.js';
import type { TopicClassifier } from '../topic/TopicClassifier.js';
import type { TopicParameterUpdater } from '../topic/TopicParameterUpdater.js';
import type { TopicContinuationScorer } from '../topic/TopicContinuationScorer.js';
import type { DialoguePlanner } from '../dialoguePlanner/DialoguePlanner.js';
import type { EngineEventBus } from '../logging/EngineEventBus.js';
import type { DialogueAct } from '../types/dialogueAct.js';
import type { Topic } from '../types/topic.js';
import type { TurnResult } from '../types/turn.js';
import type { CharacterState } from '../types/character.js';
import type { RelationshipContext } from '../relationship/types.js';
import type { MemoryItem } from '../types/memory.js';
import { SpeakerSelector } from './SpeakerSelector.js';
import { EndConditionEvaluator } from './EndConditionEvaluator.js';
import { TopicBranchMerger } from './TopicBranchMerger.js';
import type { SessionState } from './types.js';

// 直前ターンのDialogueActをTopicイベントへ変換する対応表（features.md F4.3）。
// 明確な仕様が無いため実装者判断で設定した（doc/todo.md T12）。
const ACT_TO_TOPIC_EVENT: Partial<
  Record<DialogueAct, 'questioned' | 'laughed' | 'newInfo' | 'empathized' | 'denied' | 'prolonged'>
> = {
  question: 'questioned',
  joke: 'laughed',
  tsukkomi: 'laughed',
  empathy: 'empathized',
  deny: 'denied',
  story: 'newInfo',
  deepDive: 'newInfo',
  fillSilence: 'prolonged',
};

/**
 * F6全体のオーケストレーション（1ターンの実行フロー）。
 *
 * class-design.md 9章旧版から以下を実装者判断で追加している（T12、implementation-rules.md 9章）:
 * - `outputParser: OutputParser`（F7.3、LLM出力からセリフ本文を抽出する処理が
 *   本来必要だが、class-design.md 9章のコンストラクタ一覧に含まれていなかった）
 * - `characterDefs: Map<string, CharacterDefRecord>`（T04出力。CharacterState（F1）は
 *   キャラクター名等の静的情報を持たないため、プロンプト構築に必要な
 *   name/personality/toneSample/firstPerson/ngTopicsの参照用に追加した）
 *
 * T43（Issue #1、implementation-rules.md 9章）: 生成された発話が話者以外の参加キャラクターの
 * firstPerson/toneSampleの語尾パターンを含んでいないかを`OutputParser.checkToneConsistency`で
 * 検知し、違反時は口調の修正指示を追加したプロンプト（`utterance/tone_retry.md`、F7.1a）で
 * 1回だけ再生成する。プロンプト本体（`utterance/base.md`）は変更せず、生成後の検証・是正
 * という別レイヤーで対処する。
 */
export class ConversationManager {
  constructor(
    private readonly topicClassifier: TopicClassifier,
    private readonly topicUpdater: TopicParameterUpdater,
    private readonly continuationScorer: TopicContinuationScorer,
    private readonly relationshipManager: RelationshipManager,
    private readonly characterBrains: Map<string, CharacterBrain>,
    private readonly dialoguePlanner: DialoguePlanner,
    private readonly memoryRetriever: MemoryRetriever,
    private readonly promptBuilder: PromptBuilder,
    private readonly llmClient: LlmClient,
    private readonly outputParser: OutputParser,
    private readonly characterDefs: Map<string, CharacterDefRecord>,
    private readonly speakerSelector: SpeakerSelector = new SpeakerSelector(relationshipManager),
    private readonly endConditionEvaluator: EndConditionEvaluator = new EndConditionEvaluator(),
    private readonly topicBranchMerger: TopicBranchMerger = new TopicBranchMerger(),
    // T31で発見: RelationshipUpdater（F2.4、T06で実装済み）がConversationManagerの
    // ターン実行フローに一度も配線されておらず、trust/intimacyが初期値のまま更新されない
    // 不具合があった。4体・50ターンのE2E結合テスト（requirements.md 7.2）で
    // 全6ペアのtrust/intimacyが変化しないことから発覚したため、ここで配線する。
    private readonly relationshipUpdater: RelationshipUpdater = new RelationshipUpdater(),
    private readonly eventBus?: EngineEventBus,
  ) {}

  async runTurn(sessionState: SessionState): Promise<TurnResult> {
    const speakerId = this.speakerSelector.selectNext({
      participantIds: sessionState.participantIds,
      previousSpeakerId: sessionState.previousSpeakerId,
      previousTargetIds: sessionState.previousTargetIds,
      recentSpeakerIds: sessionState.recentUtterances.map((u) => u.speakerId),
      characterStates: new Map(
        [...this.characterBrains.entries()].map(([id, brain]) => [id, brain.getState()]),
      ),
    });
    // 話しかける相手はT29時点では「直前の話者」をデフォルトとする（自然な返答の宛先として
    // 最も妥当なため）。3〜4体構成での話しかけ相手の高度な決定（複数人への同時発話等）は
    // F6.2の範囲外（Speaker Selectionは「誰が話すか」の決定であり「誰に話すか」は別課題）
    // として扱う（実装者判断、implementation-rules.md 9章）。
    const targetId =
      sessionState.previousSpeakerId ?? sessionState.participantIds.find((id) => id !== speakerId);
    if (!targetId) {
      throw new Error('ConversationManager: 話者と異なるtargetIdが必要です');
    }

    const nextTurnNo = sessionState.turnNo + 1;
    this.eventBus?.emit('turn:start', { turnNo: nextTurnNo, speakerCandidateIds: [speakerId] });

    const topic = await this.resolveTopic(sessionState, speakerId, targetId);
    const topicScore = this.continuationScorer.score(topic);
    this.eventBus?.emit('layer:topic', {
      topic,
      conversationState: sessionState.conversationStateManager.getState(),
    });

    const relationshipContext = this.relationshipManager.resolve(speakerId, targetId);
    this.eventBus?.emit('layer:relationship', {
      speakerId,
      targetId,
      edge: relationshipContext.edge,
    });

    const brain = this.characterBrains.get(speakerId);
    if (!brain) {
      throw new Error(`ConversationManager: CharacterBrainが見つかりません (${speakerId})`);
    }
    brain.applyRelationshipContext(relationshipContext);
    // 会話開始直後（previousActが無い）は、相手から「質問された」ことにして
    // 話を切り出す想定にする（実装者判断。features.md/class-design.mdに明記なし）。
    const characterState = brain.updateAfterTurn({
      receivedAct: sessionState.previousAct ?? 'question',
      fromCharacterId: targetId,
    });
    this.eventBus?.emit('layer:character', { characterState });

    const { act, scores, expectation } = this.dialoguePlanner.planNext({
      speaker: characterState,
      relationship: relationshipContext,
      topic,
      conversationState: sessionState.conversationStateManager.getState(),
      previousAct: sessionState.previousAct,
    });
    this.eventBus?.emit('layer:dialoguePlanner', {
      scores,
      selectedAct: act,
      expectation,
    });

    const retrievedMemories = await this.memoryRetriever.retrieve({
      sessionId: sessionState.sessionId,
      turnNo: nextTurnNo,
      speakerId,
      targetIds: [targetId],
      topicKeywords: [topic.label],
      dialogueAct: act,
    });
    this.eventBus?.emit('layer:memory', { retrieved: retrievedMemories });

    const prompt = this.buildPrompt(
      sessionState,
      speakerId,
      targetId,
      act,
      characterState,
      relationshipContext,
      retrievedMemories,
      topic,
    );
    const speakerLlmConfig = this.characterDefs.get(speakerId)?.llm ?? null;
    const llmCallOptions = {
      model: speakerLlmConfig?.model,
      temperature: speakerLlmConfig?.temperature,
    };
    let finalPrompt = prompt;
    let rawOutput = await this.llmClient.complete(prompt, llmCallOptions);
    let utterance = this.outputParser.extractUtterance(rawOutput);

    // T43（Issue #1）: 他キャラのfirstPerson/toneSampleの語尾パターンが混入していないかを
    // 検知し、違反していれば口調の修正指示を追加したプロンプトで1回だけ再生成する。
    // `layer:llm`イベント（F8.3）は最終的に採用したプロンプト/出力のみを1回発行する
    // （再生成前の一時的な出力まで残すとLogBrowser/exportConversationReportの
    // `findLayerPayload`が先勝ちで拾ってしまい、表示されるutteranceと矛盾するため。
    // 自己レビューで発見、実装者判断）。
    const toneCheck = this.outputParser.checkToneConsistency(
      utterance,
      this.otherCharacterToneProfiles(speakerId),
    );
    if (!toneCheck.ok) {
      finalPrompt = this.buildToneRetryPrompt(prompt, this.getCharacterDef(speakerId), toneCheck);
      rawOutput = await this.llmClient.complete(finalPrompt, llmCallOptions);
      utterance = this.outputParser.extractUtterance(rawOutput);
      // 再生成後も違反が残る場合はプロトタイプとして1回までのリトライに留め、そのまま採用する
      // （plan-cの「1回だけ再生成する」仕様に従う。実装者判断、implementation-rules.md 9章）。
    }
    this.eventBus?.emit('layer:llm', { prompt: finalPrompt, rawOutput });

    const result: TurnResult = {
      sessionId: sessionState.sessionId,
      turnNo: nextTurnNo,
      speakerId,
      targetIds: [targetId],
      topicId: topic.id,
      dialogueAct: act,
      utterance,
      createdAt: new Date().toISOString(),
    };

    sessionState.turnNo = nextTurnNo;
    sessionState.previousAct = act;
    sessionState.previousSpeakerId = speakerId;
    sessionState.previousTargetIds = result.targetIds;
    sessionState.recentUtterances = [
      ...sessionState.recentUtterances,
      { speakerId, utterance, turnNo: nextTurnNo },
    ].slice(-5);
    sessionState.conversationStateManager.updateAfterTurn(act, topicScore);
    this.relationshipUpdater.applyTurnResult(this.relationshipManager.getGraph(), result);

    this.eventBus?.emit('turn:complete', result);
    return result;
  }

  async *runSession(sessionState: SessionState, maxTurns: number): AsyncGenerator<TurnResult> {
    while (
      !this.endConditionEvaluator.shouldEnd(
        sessionState.conversationStateManager.getState(),
        maxTurns,
      )
    ) {
      yield await this.runTurn(sessionState);
    }
  }

  private async resolveTopic(
    sessionState: SessionState,
    speakerId: string,
    targetId: string,
  ): Promise<Topic> {
    const lastUtterance =
      sessionState.recentUtterances.at(-1)?.utterance ?? sessionState.initialTopic;
    const classification = await this.topicClassifier.classify(
      lastUtterance,
      sessionState.topicTree,
      speakerId,
      targetId,
    );

    let topic: Topic;
    if (classification.kind === 'same') {
      const existing = sessionState.topicTree.getTopic(classification.topicId);
      if (!existing) {
        throw new Error(`ConversationManager: Topic "${classification.topicId}" が見つかりません`);
      }
      topic = existing;
    } else if (classification.kind === 'child') {
      const parentId = classification.parentTopicId;
      // F6.3（T30）は3〜4体会話向けの機能（class-design.md 9章）であり、2体会話では
      // 話者・対象のペアが常に参加者全員と一致し「サブグループへの分岐」が意味を持たない。
      // そのため参加者が3名以上の場合のみ`TopicBranchMerger.branch`でparticipantIdsを
      // 付与し、2体会話ではT12時点までと同じ（participantIds無し）Topicを作る
      // （実装者判断、implementation-rules.md 9章）。合流（merge）判定の自動実行は
      // runTurnには組み込まず、TopicBranchMerger単体の機能として提供するにとどめる。
      // merge時にTopicツリーから古いTopicを取り除く仕様がfeatures.md/class-design.mdで
      // 未確定であり、既存の複数ターンテストを不用意に変えるリスクがあるため。
      if (sessionState.participantIds.length > 2) {
        const parentTopic = sessionState.topicTree.getTopic(parentId);
        if (!parentTopic) {
          throw new Error(`ConversationManager: 親Topic "${parentId}" が見つかりません`);
        }
        topic = this.topicBranchMerger.branch(
          parentTopic,
          [speakerId, targetId],
          classification.suggestedLabel,
        );
      } else {
        topic = {
          id: crypto.randomUUID(),
          parentTopicId: parentId,
          label: classification.suggestedLabel,
          depth: sessionState.topicTree.computeDepth(parentId),
          energy: 0.5,
          novelty: 0.5,
          life: 0.5,
          unresolved: false,
        };
      }
      sessionState.topicTree.addTopic(topic);
    } else {
      topic = {
        id: crypto.randomUUID(),
        label: classification.suggestedLabel,
        depth: 0,
        energy: 0.5,
        novelty: 0.5,
        life: 0.5,
        unresolved: false,
      };
      sessionState.topicTree.addTopic(topic);
    }

    const eventType = sessionState.previousAct
      ? ACT_TO_TOPIC_EVENT[sessionState.previousAct]
      : undefined;
    if (eventType) {
      topic = this.topicUpdater.applyEvent(topic, { type: eventType });
      sessionState.topicTree.updateTopic(topic.id, topic);
    }

    return topic;
  }

  // T43で追加。buildPromptと再生成リトライ判定の両方で発話者のCharacterDefRecordが必要なため
  // 共通化した（存在しない場合は他の箇所と同様に例外を投げる）。
  private getCharacterDef(characterId: string): CharacterDefRecord {
    const def = this.characterDefs.get(characterId);
    if (!def) {
      throw new Error(`ConversationManager: CharacterDefRecordが見つかりません (${characterId})`);
    }
    return def;
  }

  // T43（Issue #1）: checkToneConsistencyに渡す「話者以外の参加キャラクター」の口調情報一覧。
  // sessionState.participantIdsではなくthis.characterDefs全体を対象にするのは、口調が
  // 混入しうる相手は現在のセッション参加者に限らないため（実装者判断）。
  private otherCharacterToneProfiles(speakerId: string): OtherCharacterToneProfile[] {
    const speakerFirstPerson = this.characterDefs.get(speakerId)?.firstPerson ?? null;
    return [...this.characterDefs.entries()]
      .filter(([characterId]) => characterId !== speakerId)
      .map(([characterId, def]) => ({
        characterId,
        // 話者自身と一人称が同じ他キャラクターについてはfirstPersonチェックの対象から
        // 除外する。複数キャラが同じ一人称を持つ場合（実際のcharacter_defでは4体中3体が
        // 「俺」を共有）、除外しないと話者自身の正当な一人称使用まで誤検知してしまう
        // （自己レビューで発見、実装者判断）。toneSampleの語尾パターンによる検知は
        // 引き続き行う。
        firstPerson:
          def.firstPerson && def.firstPerson !== speakerFirstPerson ? def.firstPerson : null,
        toneSample: def.toneSample,
      }));
  }

  // T43（Issue #1）: 口調逸脱が検知された際に、元のプロンプトへ修正指示を追加した再生成用
  // プロンプトを構築する。プロンプト文面はハードコードせずutterance/tone_retry.mdに外部化する
  // （implementation-rules.md 6章）。
  private buildToneRetryPrompt(
    baseInstruction: string,
    speakerDef: CharacterDefRecord,
    toneCheck: ToneConsistencyCheckResult,
  ): string {
    const violatingCharacterNames = [
      ...new Set(
        toneCheck.violations.map(
          (v) => this.characterDefs.get(v.characterId)?.name ?? v.characterId,
        ),
      ),
    ].join('、');
    const violatingPatterns = [...new Set(toneCheck.violations.map((v) => v.matchedPattern))].join(
      '、',
    );

    return this.promptBuilder.build('utterance/tone_retry', {
      baseInstruction,
      characterName: speakerDef.name,
      firstPerson: speakerDef.firstPerson ?? '',
      toneSample: speakerDef.toneSample ?? '',
      violatingCharacterNames,
      violatingPatterns,
    });
  }

  private buildPrompt(
    sessionState: SessionState,
    speakerId: string,
    targetId: string,
    act: DialogueAct,
    characterState: CharacterState,
    relationshipContext: RelationshipContext,
    retrievedMemories: MemoryItem[],
    topic: Topic,
  ): string {
    const speakerDef = this.getCharacterDef(speakerId);
    const targetDef = this.characterDefs.get(targetId);

    const recentDialogue = sessionState.recentUtterances
      .slice(-3)
      .map((u) => `${this.characterDefs.get(u.speakerId)?.name ?? u.speakerId}: ${u.utterance}`)
      .join('\n');

    return this.promptBuilder.build('utterance/base', {
      characterName: speakerDef.name,
      personality: speakerDef.personality,
      toneSample: speakerDef.toneSample ?? '',
      firstPerson: speakerDef.firstPerson ?? '',
      emotion: characterState.emotion.label,
      speakingStyle: `敬語レベル${characterState.speakingStyle.honorificLevel.toFixed(1)}/距離感${characterState.speakingStyle.distance.toFixed(1)}`,
      targetName: targetDef?.name ?? targetId,
      addressTerm: relationshipContext.addressTerm,
      dialogueAct: act,
      topicLabel: topic.label,
      retrievedMemory: retrievedMemories.map((m) => m.summary).join('\n') || '(なし)',
      recentDialogue: recentDialogue || '(会話開始)',
    });
  }
}
