import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CharacterLayerPayload,
  DialoguePlannerLayerPayload,
  LlmLayerPayload,
  MemoryLayerPayload,
  RelationshipLayerPayload,
  SpeakerBalanceLayerPayload,
  TopicLayerPayload,
} from '@prottype2/engine';
import { openMigratedDatabase } from '../db/migrate.js';
import { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';
import { FeedbackRepository } from '../db/repositories/FeedbackRepository.js';
import { SessionRepository } from '../db/repositories/SessionRepository.js';
import { TurnRepository } from '../db/repositories/TurnRepository.js';
import type {
  FeedbackRating,
  LayerEventRecord,
  LayerName,
  TurnRecord,
} from '../db/repositories/types.js';

// 案の比較を人間がスマホから行うためのレポート（doc記載の自動化構想）。
// LogBrowser（F9.4）が表示する情報（ターン本文/各レイヤー/フィードバック）を、
// サーバー・DBなしで開ける単一のHTMLファイルとして書き出す。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TOKENS_CSS_PATH = join(REPO_ROOT, 'packages', 'ui', 'src', 'styles', 'tokens.css');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function findLayerPayload<T>(events: LayerEventRecord[], layer: LayerName): T | undefined {
  return events.find((event) => event.layer === layer)?.payload as T | undefined;
}

function renderCharacterState(payload: CharacterLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  const s = payload.characterState;
  return `
    <dl class="kv">
      <dt>emotion</dt><dd>${escapeHtml(s.emotion.label)} (${s.emotion.intensity.toFixed(2)})</dd>
      <dt>energy</dt><dd>${s.energy.toFixed(2)}</dd>
      <dt>curiosity</dt><dd>${s.curiosity.toFixed(2)}</dd>
      <dt>currentGoal</dt><dd>${escapeHtml(s.currentGoal)}</dd>
      <dt>conversationIntent</dt><dd>${escapeHtml(s.conversationIntent)}</dd>
    </dl>`;
}

function renderTopic(payload: TopicLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  const t = payload.topic;
  const c = payload.conversationState;
  return `
    <dl class="kv">
      <dt>topic</dt><dd>${escapeHtml(t.label)} (depth=${t.depth}, energy=${t.energy.toFixed(2)}, novelty=${t.novelty.toFixed(2)}, life=${t.life.toFixed(2)})</dd>
      <dt>atmosphere</dt><dd>${c.atmosphere.toFixed(2)}</dd>
      <dt>excitement</dt><dd>${c.excitement.toFixed(2)}</dd>
      <dt>silenceRisk</dt><dd>${c.silenceRisk.toFixed(2)}</dd>
      <dt>elapsedTurns</dt><dd>${c.elapsedTurns}</dd>
    </dl>`;
}

function renderRelationship(payload: RelationshipLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  const e = payload.edge;
  return `
    <dl class="kv">
      <dt>${escapeHtml(e.characterId)} → ${escapeHtml(e.targetCharacterId)}</dt>
      <dd>type=${escapeHtml(e.type)}, trust=${e.trust.toFixed(2)}, intimacy=${e.intimacy.toFixed(2)}, respect=${e.respect.toFixed(2)}</dd>
    </dl>`;
}

function renderDialoguePlanner(payload: DialoguePlannerLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  const modifierNames = [...new Set(payload.scores.flatMap((s) => Object.keys(s.modifiers)))];
  const rows = payload.scores
    .map(
      (s) => `
      <tr class="${s.act === payload.selectedAct ? 'selected' : ''}">
        <td>${escapeHtml(s.act)}</td>
        <td>${s.baseWeight.toFixed(2)}</td>
        ${modifierNames.map((n) => `<td>${(s.modifiers[n] ?? 0).toFixed(2)}</td>`).join('')}
        <td>${s.score.toFixed(2)}</td>
        <td>${s.probability.toFixed(2)}</td>
      </tr>`,
    )
    .join('');
  return `
    <table class="mono scores">
      <thead><tr><th>act</th><th>baseWeight</th>${modifierNames.map((n) => `<th>${escapeHtml(n)}</th>`).join('')}<th>score</th><th>probability</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderMemory(payload: MemoryLayerPayload | undefined): string {
  if (!payload || payload.retrieved.length === 0) {
    return '<p class="muted">想起された記憶はありません。</p>';
  }
  return `
    <ul class="memory-list">
      ${payload.retrieved
        .map(
          (m) =>
            `<li>[${m.shareable ? 'Shared' : 'Self'}] ${escapeHtml(m.summary)}（重要度 ${m.importance.toFixed(2)}）</li>`,
        )
        .join('')}
    </ul>`;
}

// Issue #16対応（plan-c、T44）: SpeakerBalanceAdvisorの判定結果（正当化されたか・
// 推奨話者・判定理由・審査プロンプト/生出力）を目視確認できるようにする。旧セッションの
// ログには`speakerBalance`レイヤー自体が存在しないため、その場合は何も表示しない
// （既存レポートとの互換性を保つ、renderToneReview相当のガードと同じ考え方）。
function renderSpeakerBalance(payload: SpeakerBalanceLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  const statusLabel = payload.error
    ? `判定エラー（補正なしにフォールバック）: ${escapeHtml(payload.error)}`
    : payload.rawOutput === null
      ? '判定材料なし（会話開始直後等、判定スキップ）'
      : payload.justified
        ? '偏りは内容的に正当（頻度バランス補正を緩和）'
        : payload.recommendedSpeakerId
          ? `理由のない偏り: ${escapeHtml(payload.recommendedSpeakerId)}を推奨`
          : '偏りなし、または推奨話者なし';
  return `
    <p class="speaker-balance-status ${payload.justified ? 'speaker-balance-justified' : ''}">${statusLabel}</p>
    ${payload.reason ? `<p class="speaker-balance-reason">判定理由: ${escapeHtml(payload.reason)}</p>` : ''}
    <details><summary>審査プロンプト全文</summary><pre class="mono">${escapeHtml(payload.prompt)}</pre></details>
    <details><summary>審査LLM生出力</summary><pre class="mono">${escapeHtml(payload.rawOutput ?? '(なし)')}</pre></details>`;
}

function renderLlm(payload: LlmLayerPayload | undefined): string {
  if (!payload) return '<p class="muted">データがありません。</p>';
  return `
    <details><summary>送信プロンプト全文</summary><pre class="mono">${escapeHtml(payload.prompt)}</pre></details>
    <details><summary>LLM生出力</summary><pre class="mono">${escapeHtml(payload.rawOutput)}</pre></details>`;
}

export interface ReportTurn {
  turn: TurnRecord;
  layerEvents: LayerEventRecord[];
  feedback?: { rating: FeedbackRating; comment: string | null };
}

export function renderConversationReportHtml(params: {
  title: string;
  sessionId: string;
  initialTopic: string;
  characters: Map<string, { name: string; color: string }>;
  turns: ReportTurn[];
}): string {
  const tokensCss = readFileSync(TOKENS_CSS_PATH, 'utf-8');
  const characterName = (id: string) => params.characters.get(id)?.name ?? id;
  const characterColor = (id: string) => params.characters.get(id)?.color ?? '#9CA3AF';

  const turnsHtml = params.turns
    .map(({ turn, layerEvents, feedback }) => {
      const character = findLayerPayload<CharacterLayerPayload>(layerEvents, 'character');
      const topic = findLayerPayload<TopicLayerPayload>(layerEvents, 'topic');
      const relationship = findLayerPayload<RelationshipLayerPayload>(layerEvents, 'relationship');
      const planner = findLayerPayload<DialoguePlannerLayerPayload>(layerEvents, 'dialoguePlanner');
      const memory = findLayerPayload<MemoryLayerPayload>(layerEvents, 'memory');
      const llm = findLayerPayload<LlmLayerPayload>(layerEvents, 'llm');
      const speakerBalance = findLayerPayload<SpeakerBalanceLayerPayload>(
        layerEvents,
        'speakerBalance',
      );

      return `
      <article class="turn" id="turn-${turn.turnNo}">
        <header>
          <span class="turn-no">#${turn.turnNo}</span>
          <span class="speaker" style="color:${characterColor(turn.speakerId)}">${escapeHtml(characterName(turn.speakerId))}</span>
          <span class="dialogue-act">${escapeHtml(turn.dialogueAct)}</span>
          ${speakerBalance?.recommendedSpeakerId && !speakerBalance.justified ? `<span class="speaker-balance-badge" title="SpeakerBalanceAdvisorが${escapeHtml(characterName(speakerBalance.recommendedSpeakerId))}を推奨">⚖️次話者提案あり</span>` : ''}
          ${feedback ? `<span class="feedback feedback-${feedback.rating}">${feedback.rating === 'natural' ? '👍 自然' : '👎 不自然'}</span>` : ''}
        </header>
        <p class="utterance">${escapeHtml(turn.utterance)}</p>
        ${feedback?.comment ? `<p class="feedback-comment">コメント: ${escapeHtml(feedback.comment)}</p>` : ''}
        <details class="layer-details">
          <summary>詳細レイヤーを見る</summary>
          <section><h3>Speaker Balance（発話バランス判定）</h3>${renderSpeakerBalance(speakerBalance)}</section>
          <section><h3>Character State</h3>${renderCharacterState(character)}</section>
          <section><h3>Topic</h3>${renderTopic(topic)}</section>
          <section><h3>Relationship</h3>${renderRelationship(relationship)}</section>
          <section><h3>Dialogue Planner</h3>${renderDialoguePlanner(planner)}</section>
          <section><h3>Memory Retriever</h3>${renderMemory(memory)}</section>
          <section><h3>LLM</h3>${renderLlm(llm)}</section>
        </details>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
<style>
${tokensCss}
/* tokens.cssはprefers-color-schemeのみに対応している。Artifactとして公開する場合、
   ビューア側の明示的なテーマ切り替え（data-theme属性）にも追従できるよう、
   同じダーク値をここで補う（tokens.css自体はpackages/uiの共有資産のため変更しない）。 */
:root[data-theme='dark'] {
  --color-bg: #1a1a1e;
  --color-surface: #232327;
  --color-border: #3a3a40;
  --color-text: #f0f0f2;
  --color-text-muted: #a2a2a8;
  --color-accent: #6ea0ff;
  --data-scale-low: #123a63;
  --data-scale-high: #8fc2ff;
}
:root[data-theme='light'] {
  --color-bg: #f7f7f8;
  --color-surface: #ffffff;
  --color-border: #d9d9dc;
  --color-text: #1a1a1e;
  --color-text-muted: #6b6b70;
  --color-accent: #2f6fed;
  --data-scale-low: #cde2fb;
  --data-scale-high: #0d366b;
}
.report-header { padding: var(--space-3); border-bottom: 1px solid var(--color-border); }
.report-header h1 { font-size: 18px; margin: 0 0 4px; }
.report-header p { margin: 0; color: var(--color-text-muted); font-size: 12px; }
.turn { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); }
.turn header { display: flex; gap: var(--space-1); align-items: baseline; font-size: 12px; }
.turn-no { color: var(--color-text-muted); }
.speaker { font-weight: bold; }
.dialogue-act { color: var(--color-text-muted); }
.feedback-natural { color: #2e8b57; }
.feedback-unnatural { color: #c0392b; }
.speaker-balance-badge { color: #b8860b; }
.speaker-balance-status { font-size: 12px; margin: 0 0 4px; }
.speaker-balance-justified { color: #2e8b57; }
.speaker-balance-reason { font-size: 12px; color: var(--color-text-muted); margin: 0 0 4px; }
.utterance { font-size: 15px; margin: var(--space-1) 0; }
.feedback-comment { font-size: 12px; color: var(--color-text-muted); }
.layer-details summary { cursor: pointer; font-size: 12px; color: var(--color-accent); margin-top: 4px; }
.layer-details section { margin: var(--space-1) 0; }
.layer-details h3 { font-size: 12px; margin: 0 0 4px; color: var(--color-text-muted); }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: 2px var(--space-1); font-size: 12px; margin: 0; }
.kv dt { color: var(--color-text-muted); }
table.scores { border-collapse: collapse; font-size: 12px; width: 100%; }
table.scores th, table.scores td { text-align: right; padding: 2px 6px; }
table.scores th:first-child, table.scores td:first-child { text-align: left; }
table.scores tr.selected { background: color-mix(in oklab, var(--color-accent), transparent 85%); font-weight: bold; }
.memory-list { margin: 0; padding-left: var(--space-2); font-size: 12px; }
pre.mono { white-space: pre-wrap; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; padding: var(--space-1); font-size: 12px; }
.muted { color: var(--color-text-muted); }
</style>
</head>
<body>
<div class="report-header">
  <h1>${escapeHtml(params.title)}</h1>
  <p>session: ${escapeHtml(params.sessionId)} / initialTopic: ${escapeHtml(params.initialTopic)} / turns: ${params.turns.length}</p>
</div>
${turnsHtml}
</body>
</html>`;
}

function main(): void {
  const [, , sessionId, outPath, dbPathArg, titleArg] = process.argv;
  if (!sessionId || !outPath) {
    console.error('usage: exportConversationReport.js <sessionId> <outPath> [dbPath] [title]');
    process.exit(1);
  }

  const dbPath = dbPathArg ?? join(REPO_ROOT, 'data', 'engine.sqlite');
  const db = openMigratedDatabase(dbPath);

  const sessionRepository = new SessionRepository(db);
  const turnRepository = new TurnRepository(db);
  const feedbackRepository = new FeedbackRepository(db);
  const characterCacheRepository = new CharacterCacheRepository(db);

  const session = sessionRepository.findById(sessionId);
  if (!session) {
    console.error(`session not found: ${sessionId}`);
    process.exit(1);
  }

  const turns = turnRepository.listBySession(sessionId);
  const feedbacks = new Map(feedbackRepository.listBySession(sessionId).map((f) => [f.turnNo, f]));
  const characters = new Map(
    characterCacheRepository.listSummaries().map((c) => [c.id, { name: c.name, color: c.color }]),
  );

  const html = renderConversationReportHtml({
    title: titleArg ?? `会話ログレポート: ${sessionId}`,
    sessionId,
    initialTopic: session.initialTopic,
    characters,
    turns: turns.map((turn) => ({
      turn,
      layerEvents: turnRepository.listLayerEvents(sessionId, turn.turnNo),
      feedback: feedbacks.get(turn.turnNo),
    })),
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf-8');
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
