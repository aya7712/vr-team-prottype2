import type { CharacterBrain } from '../character/CharacterBrain.js';
import type { CharacterDefRecord } from '../data/types.js';
import type { RelationshipManager } from '../relationship/RelationshipManager.js';
import { RelationshipUpdater } from '../relationship/RelationshipUpdater.js';
import type { MemoryRetriever } from '../memory/MemoryRetriever.js';
import type { PromptBuilder, LlmClient, OutputParser } from '../llm/index.js';
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
import { AddresseeMentionDetector } from './AddresseeMentionDetector.js';
import type { MentionCandidate } from './AddresseeMentionDetector.js';
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
    // Issue #15: 実際に生成された発話の中で誰が名指しされたかをresult.targetIdsへ
    // 反映するための検出器。既存の呼び出し元（テスト含む）が位置引数でeventBusまで
    // しか渡していないため、後方互換のため末尾に追加する。
    private readonly addresseeMentionDetector: AddresseeMentionDetector = new AddresseeMentionDetector(),
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
    const rawOutput = await this.llmClient.complete(prompt, {
      model: speakerLlmConfig?.model,
      temperature: speakerLlmConfig?.temperature,
    });
    const utterance = this.outputParser.extractUtterance(rawOutput);
    this.eventBus?.emit('layer:llm', { prompt, rawOutput });

    // Issue #15: 発話生成前に決めたtargetId（直前の話者、86-87行目）はあくまで
    // プロンプト構築用の「話しかける想定相手」であり、実際に生成された発話内で
    // 名指しされた相手とは限らない。生成済みutteranceを見て名指しを検出できた場合は
    // それをresult.targetIds（→次ターンのSpeakerSelector.NAMED_BONUSの入力）として
    // 採用し、検出できなければ従来通りtargetIdへフォールバックする。
    const mentionedTargetId = this.addresseeMentionDetector.detect(
      utterance,
      this.buildMentionCandidates(sessionState.participantIds, speakerId),
    );

    const result: TurnResult = {
      sessionId: sessionState.sessionId,
      turnNo: nextTurnNo,
      speakerId,
      targetIds: [mentionedTargetId ?? targetId],
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
    // Issue #15の自己レビューで発覚: RelationshipUpdaterはresult.targetIdsを見て
    // trust/intimacy・Relationship Story更新先のペアを決めるが、dialogueAct/
    // relationshipContext/promptは全てtargetId（会話上の実際の相手）を前提に
    // 計算済みである。result.targetIdsを名指し検出結果（mentionedTargetId、
    // 会話上の相手とは別の第三者を指しうる）で上書きしたまま渡すと、関係性の
    // 更新が実際にやり取りした相手ではなく無関係な第三者に誤帰属してしまう。
    // そのためRelationshipUpdaterには元のtargetId（会話上の相手）のみを渡す
    // （名指し検出結果はresult.targetIds/previousTargetIds経由で次ターンの
    // SpeakerSelector.NAMED_BONUSにのみ影響させる、という案の設計を維持する）。
    this.relationshipUpdater.applyTurnResult(this.relationshipManager.getGraph(), {
      ...result,
      targetIds: [targetId],
    });

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

  // Issue #15: CharacterDefRecord.nameはフルネーム（例:「浦々宇良」）だが、
  // 実際の発話中ではrelationships[].address（例:「宇良」「理久兄」）等の
  // 呼び名で呼び合っており、name単体では発話中の名指しをほぼ検出できない
  // （実データで確認済み）。そのため候補ごとに、name/furiganaに加えて
  // 全キャラクターのrelationships（誰から見た呼び方かは問わない）から
  // その候補宛のaddressを集め、名指し検出の対象名バリエーションとする。
  private buildMentionCandidates(participantIds: string[], speakerId: string): MentionCandidate[] {
    const allDefs = [...this.characterDefs.values()];

    return participantIds
      .filter((id) => id !== speakerId)
      .map((id) => this.characterDefs.get(id))
      .filter((def): def is CharacterDefRecord => def !== undefined)
      .map((def) => {
        const addressTerms = allDefs
          .flatMap((d) => d.relationships)
          .filter((relationship) => relationship.targetCharacterId === def.id)
          .map((relationship) => relationship.address);
        const names = [def.name, def.furigana ?? undefined, ...addressTerms].filter(
          (name): name is string => Boolean(name),
        );
        return { characterId: def.id, names: [...new Set(names)] };
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
    const speakerDef = this.characterDefs.get(speakerId);
    const targetDef = this.characterDefs.get(targetId);
    if (!speakerDef) {
      throw new Error(`ConversationManager: CharacterDefRecordが見つかりません (${speakerId})`);
    }

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
