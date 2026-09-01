import type { CharacterBrain } from '../character/CharacterBrain.js';
import type { CharacterDefRecord } from '../data/types.js';
import type { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipUpdater } from '../relationship/RelationshipUpdater.js';
import type { MemoryRetriever } from '../memory/MemoryRetriever.js';
import type { PromptBuilder, LlmClient, OutputParser } from '../llm/index.js';
import { ToneReviewer } from '../llm/index.js';
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
 * - `toneReviewer: ToneReviewer`（Issue #5対応、plan-e、T43。生成直後の発話が話者本人の
 *   口調から逸脱していないかを追加のLLM呼び出し1回で審査・書き換えする）
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
    // 末尾に追加した理由: `eventBus`が既存呼び出し元（TurnOrchestrator等）で常に最後の
    // 実引数として明示的に渡されており（implementation-rules.md 9章のコンストラクタ一覧に
    // 準拠する既存コード）、途中に挿入すると位置引数がずれてeventBusに誤った値が渡って
    // しまう。`eventBus`の後にdefault付きで追加することで、既存呼び出し元は変更不要のまま
    // （省略時はデフォルトが使われる）新規依存を追加できる（実装者判断）。
    private readonly toneReviewer: ToneReviewer = new ToneReviewer(promptBuilder, llmClient),
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

    const speakerDef = this.characterDefs.get(speakerId);
    if (!speakerDef) {
      throw new Error(`ConversationManager: CharacterDefRecordが見つかりません (${speakerId})`);
    }
    const prompt = this.buildPrompt(
      sessionState,
      speakerDef,
      targetId,
      act,
      characterState,
      relationshipContext,
      retrievedMemories,
      topic,
    );
    const speakerLlmConfig = speakerDef.llm ?? null;
    const rawOutput = await this.llmClient.complete(prompt, {
      model: speakerLlmConfig?.model,
      temperature: speakerLlmConfig?.temperature,
    });
    const generatedUtterance = this.outputParser.extractUtterance(rawOutput);

    // Issue #5対応（plan-e、T43）: 直前に発言していた他キャラクター（今回のsessionState更新前の
    // previousSpeakerId）の口調プロフィールと共に発話を審査する。previousSpeakerIdが無い
    // （会話開始直後の1発話目）場合はnullを渡し、ToneReviewer側で審査対象なしとして扱う。
    // 上のspeakerDef（145行目付近）と異なり、previousSpeakerIdがcharacterDefsに
    // 見つからない場合もthrowしない（実装者判断、code-reviewでの指摘への対応）。
    // speakerDefはプロンプト構築に必須（欠けるとターン全体が成立しない）だが、
    // previousSpeakerDefは「他キャラの口調プロフィールを審査materialに加える」という
    // 補助的な用途のみで、欠けていてもToneReviewer.review()がpreviousSpeaker: null
    // （＝会話開始直後と同じ扱い）として安全にフォールバックできる。ToneReviewer自体が
    // 「審査品質のためにターン全体を失敗させない」設計方針（このファイル下部のtoneReview
    // 呼び出し、およびToneReviewer.review()内のフォールバック参照）のため、ここでも
    // 同じ方針を踏襲し、通常発生しない状況（前ターンの話者がcharacterDefsに存在しない）
    // で例外を投げてターンを失敗させることは避けた。
    const previousSpeakerDef = sessionState.previousSpeakerId
      ? this.characterDefs.get(sessionState.previousSpeakerId)
      : undefined;
    const toneReview = await this.toneReviewer.review({
      utterance: generatedUtterance,
      // 発話生成本体と同じモデルを審査にも使う（ToneReviewer.ToneReviewInput.model参照。
      // 未指定にするとTogetherClientの既定モデルにフォールバックし、そのモデルが
      // 利用不可の場合は審査が常に失敗する不具合をE2E確認で発見したための対応）。
      model: speakerLlmConfig?.model,
      speaker: {
        name: speakerDef.name,
        personality: speakerDef.personality,
        toneSample: speakerDef.toneSample ?? '',
        firstPerson: speakerDef.firstPerson ?? '',
      },
      previousSpeaker: previousSpeakerDef
        ? {
            name: previousSpeakerDef.name,
            personality: previousSpeakerDef.personality,
            toneSample: previousSpeakerDef.toneSample ?? '',
            firstPerson: previousSpeakerDef.firstPerson ?? '',
          }
        : null,
    });
    const utterance = toneReview.utterance;
    this.eventBus?.emit('layer:llm', {
      prompt,
      rawOutput,
      toneReview: {
        prompt: toneReview.prompt,
        rawOutput: toneReview.rawOutput,
        applied: toneReview.applied,
        error: toneReview.error,
      },
    });

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

  private buildPrompt(
    sessionState: SessionState,
    speakerDef: CharacterDefRecord,
    targetId: string,
    act: DialogueAct,
    characterState: CharacterState,
    relationshipContext: RelationshipContext,
    retrievedMemories: MemoryItem[],
    topic: Topic,
  ): string {
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
