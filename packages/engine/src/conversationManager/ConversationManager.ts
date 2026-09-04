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
import { AddresseeSelector } from './AddresseeSelector.js';
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

// Issue #15対応（plan-c、AddresseeSelector）: AddresseeSelectorが特定の相手を選んだ
// （isEveryone===false）ターンのうち、どのDialogue Actなら「名前を呼びかけてから話す」
// 指示をプロンプトに加えるかの対象集合。相手個人に向いた行為（質問・回答・否定・ツッコミ・
// 深掘り）を対象とし、話題転換・沈黙埋め・体験談等の場全体向けの行為は対象外とする
// （features.md/class-design.mdに数値・対象Actの仕様が無いため実装者判断で設定した、
// implementation-rules.md 9章）。自己レビュー（code-reviewスキル）対応: 質問への
// 回答（answer）は「誰に答えているか」が最も名指しされるべき行為であるため追加した。
const NAME_CALLOUT_ACTS = new Set<DialogueAct>([
  'question',
  'answer',
  'deny',
  'tsukkomi',
  'deepDive',
]);

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
    // Issue #15対応（plan-c）: 発話生成前に呼びかけ相手を能動的に決定する（F6.2の
    // 「誰に話すか」部分）。speakerSelectorと同様、relationshipManagerを束縛した
    // インスタンスをデフォルト値として構築する。
    private readonly addresseeSelector: AddresseeSelector = new AddresseeSelector(
      relationshipManager,
    ),
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
    // Issue #15対応（plan-c）: 発話生成前に呼びかけ相手を能動的に決定する（F6.2「誰に話すか」）。
    // T29時点までは「直前の話者」を機械的にtargetIdとするだけだったため、3人以上の会話で
    // 名指しされたはずのキャラクターではなく別のキャラクターが応答してしまう問題があった
    // （Issue #15）。AddresseeSelectorが関係性（intimacy）・直近の呼びかけ頻度バランスを
    // 考慮してスコア化し、1名（またはisEveryone=trueで「全員向け」）を決定する。
    // 生成後のresult.targetIdsはここで決定したaddresseeをそのまま採用し、発話テキストの
    // 事後解析はしない。
    const addressee = this.addresseeSelector.select({
      speakerId,
      participantIds: sessionState.participantIds,
      recentTargetIds: sessionState.recentUtterances.flatMap((u) => u.targetIds),
      previousSpeakerId: sessionState.previousSpeakerId,
      previousTargetIds: sessionState.previousTargetIds,
    });
    const targetId = addressee.targetId;

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
      addressee.isEveryone,
    );
    const speakerLlmConfig = this.characterDefs.get(speakerId)?.llm ?? null;
    const rawOutput = await this.llmClient.complete(prompt, {
      model: speakerLlmConfig?.model,
      temperature: speakerLlmConfig?.temperature,
    });
    const utterance = this.outputParser.extractUtterance(rawOutput);
    this.eventBus?.emit('layer:llm', { prompt, rawOutput });

    // isEveryone===trueの発話は参加者全員（話者以外）に向けたものとして扱う
    // （AddresseeSelectorが決定したaddresseeをそのまま採用し、事後のテキスト解析はしない）。
    const targetIds = addressee.isEveryone
      ? sessionState.participantIds.filter((id) => id !== speakerId)
      : [targetId];

    const result: TurnResult = {
      sessionId: sessionState.sessionId,
      turnNo: nextTurnNo,
      speakerId,
      targetIds,
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
      { speakerId, utterance, turnNo: nextTurnNo, targetIds },
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
    speakerId: string,
    targetId: string,
    act: DialogueAct,
    characterState: CharacterState,
    relationshipContext: RelationshipContext,
    retrievedMemories: MemoryItem[],
    topic: Topic,
    isEveryone: boolean,
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

    const targetLabel = targetDef?.name ?? targetId;
    // 自己レビュー対応（code-reviewスキル、Issue #15 plan-c）: isEveryone===trueの場合、
    // 以前は「会話相手: <代表1名>（呼び方: ...）」がaddressingInstruction（「特定の名前を
    // 呼びかけなくてよい」）と矛盾していた。全員向けターンでは代表targetIdの個人名・呼び方を
    // プロンプトに出さず「その場にいる参加者全員」とだけ伝える（内部計算上の代表targetId自体は
    // relationshipContext等の既存処理にそのまま使い続ける）。
    const targetName = isEveryone
      ? 'その場にいる参加者全員'
      : `${targetLabel}（呼び方: ${relationshipContext.addressTerm}）`;

    // Issue #15対応（plan-c）: AddresseeSelectorが特定の相手を選び、かつそれが相手個人に
    // 向いた行為（NAME_CALLOUT_ACTS）の場合は、実際に名前を呼んでから話すよう誘導する。
    // これにより次ターンのSpeakerSelector（NAMED_BONUS）が意図した相手を選びやすくなる
    // （previousTargetIdsが常に意味のある値を持つようになるため）。
    const addressingInstruction =
      !isEveryone && NAME_CALLOUT_ACTS.has(act)
        ? `「${targetLabel}」の名前を呼びかけてから話してください（例:「${targetLabel}、〜」）。`
        : '特定の名前を呼びかける必要はありません。自然に話してください。';

    return this.promptBuilder.build('utterance/base', {
      characterName: speakerDef.name,
      personality: speakerDef.personality,
      toneSample: speakerDef.toneSample ?? '',
      firstPerson: speakerDef.firstPerson ?? '',
      emotion: characterState.emotion.label,
      speakingStyle: `敬語レベル${characterState.speakingStyle.honorificLevel.toFixed(1)}/距離感${characterState.speakingStyle.distance.toFixed(1)}`,
      targetName,
      addressingInstruction,
      dialogueAct: act,
      topicLabel: topic.label,
      retrievedMemory: retrievedMemories.map((m) => m.summary).join('\n') || '(なし)',
      recentDialogue: recentDialogue || '(会話開始)',
    });
  }
}
