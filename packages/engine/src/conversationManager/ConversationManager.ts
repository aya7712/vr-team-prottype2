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
    const { utterance, declaredTargetName } = this.outputParser.parseUtteranceOutput(rawOutput);
    this.eventBus?.emit('layer:llm', { prompt, rawOutput });

    // Issue #15 plan-b: LLM自身が2行目に申告した呼びかけ対象をtargetIdsとして採用する。
    // 申告が無い/書式が崩れている/参加者名と一致しない場合は、従来通り
    // 「直前の話者」をtargetIdsとするデフォルトへフォールバックする。
    const declaredTargetId = this.resolveDeclaredTargetId(
      declaredTargetName,
      speakerId,
      sessionState.participantIds,
    );
    const targetIds = declaredTargetId ? [declaredTargetId] : [targetId];

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
      { speakerId, utterance, turnNo: nextTurnNo },
    ].slice(-5);
    sessionState.conversationStateManager.updateAfterTurn(act, topicScore);
    // 独立レビューで指摘: dialogueAct/relationshipContextは「話者→targetId（直前の話者）」の
    // ペアを前提に計算済みのため、trust/intimacyの更新もそのペアに対して行う。result.targetIds
    // （LLMが申告した呼びかけ対象）をそのままRelationshipUpdaterへ渡すと、dialogueAct選定の
    // 根拠になっていない別ペアへ無関係な関係値変化を適用してしまうため、ここでは意図的に
    // 従来通りのtargetIdを使う（Issue #15 plan-bの適用範囲は「ログ/次ターンの話者選択」に限定し、
    // 関係性更新のペア決定ロジックは変更しない）。
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

    // Issue #15 plan-b: LLM自身に呼びかけ対象を申告させるため、話者以外の参加者名を
    // 一覧としてプロンプトへ渡す。「会話相手（直前の話者）」は{{targetName}}で別枠表示済み
    // のためここでは除外する（独立レビュー指摘: 除外しないと同じ相手が2箇所に重複表示される）。
    // CharacterDefRecord.nameは戸籍上のフルネーム（例:「里須野楽」）だが、実際のセリフ・
    // personality/tone_sampleでは`relationships[].address`のニックネーム（例:「楽」）で
    // 呼び合う設定になっているため、名前一覧にもニックネームを使う（実際のE2E確認で、
    // フルネームを渡すとLLMがpersonality文中のニックネームで「対象:」を申告し、
    // 一覧の表記と一致しなくなることを確認したため）。
    const participantNames = sessionState.participantIds
      .filter((id) => id !== speakerId && id !== targetId)
      .map((id) => this.resolveAddressTerm(speakerId, id))
      .join('、');

    return this.promptBuilder.build('utterance/base', {
      characterName: speakerDef.name,
      personality: speakerDef.personality,
      toneSample: speakerDef.toneSample ?? '',
      firstPerson: speakerDef.firstPerson ?? '',
      emotion: characterState.emotion.label,
      speakingStyle: `敬語レベル${characterState.speakingStyle.honorificLevel.toFixed(1)}/距離感${characterState.speakingStyle.distance.toFixed(1)}`,
      targetName: targetDef?.name ?? targetId,
      addressTerm: relationshipContext.addressTerm,
      participantNames: participantNames || '(なし)',
      dialogueAct: act,
      topicLabel: topic.label,
      retrievedMemory: retrievedMemories.map((m) => m.summary).join('\n') || '(なし)',
      recentDialogue: recentDialogue || '(会話開始)',
    });
  }

  // 話者から見た参加者idの呼び方を返す（既存のRelationshipManager.resolve().addressTermを
  // そのまま使う。独立レビュー指摘: CharacterDefRecord.relationshipsを直接読む重複実装を避け、
  // 「会話相手」欄と同じ解決経路に一本化した）。関係性データが無い相手はフルネームへ
  // フォールバックする。
  private resolveAddressTerm(speakerId: string, targetId: string): string {
    const addressTerm = this.relationshipManager.resolve(speakerId, targetId).addressTerm;
    return addressTerm || (this.characterDefs.get(targetId)?.name ?? targetId);
  }

  // Issue #15 plan-b: LLMが2行目に申告した対象名を、話者以外の参加者idへ解決する。
  // 申告が無い（null）場合はundefinedを返し、呼び出し側で既存のtargetIdへフォールバックする。
  private resolveDeclaredTargetId(
    declaredTargetName: string | null,
    speakerId: string,
    participantIds: string[],
  ): string | undefined {
    if (!declaredTargetName) return undefined;

    const candidates = participantIds.filter((id) => id !== speakerId);
    // 各候補について「フルネーム」と「話者から見た呼び方」の両方を許容表記として集める。
    const nameVariants = (id: string): string[] => {
      const fullName = this.characterDefs.get(id)?.name;
      const address = this.resolveAddressTerm(speakerId, id);
      return [fullName, address].filter((v): v is string => Boolean(v));
    };

    // 独立レビュー指摘: 一致候補が複数ある場合に先頭を無条件採用すると誤判定になりうるため、
    // 完全一致・部分一致のいずれも「一意に絞れた場合のみ」採用し、曖昧な場合はフォールバックする。
    const exactMatches = candidates.filter((id) => nameVariants(id).includes(declaredTargetName));
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return undefined;

    // 完全一致しない場合の救済策。実際のE2E確認（Issue #15 plan-b検証）で、正式な呼び方が
    // 「奈也兄」の参加者をLLMが「対象:奈也」のように略して申告するケースを確認したため、
    // どちらかがどちらかを含む部分一致で補完する。
    const partialMatches = candidates.filter((id) =>
      nameVariants(id).some(
        (variant) =>
          variant.length >= 2 &&
          (variant.includes(declaredTargetName) || declaredTargetName.includes(variant)),
      ),
    );
    return partialMatches.length === 1 ? partialMatches[0] : undefined;
  }
}
