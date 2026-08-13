import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import {
  EngineEventBus,
  TogetherClient,
  EmbeddingClient,
  EmbeddingService,
  CharacterDefLoader,
  DEFAULT_EMBEDDING_MODEL,
} from '@prottype2/engine';
import type { TurnResult } from '@prottype2/engine';
import { migrate } from '../db/migrate.js';
import { SessionRepository } from '../db/repositories/SessionRepository.js';
import { TurnRepository } from '../db/repositories/TurnRepository.js';
import { CharacterCacheRepository } from '../db/repositories/CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from '../db/repositories/MemoryRepositoryImpl.js';
import { TopicRepository } from '../db/repositories/TopicRepository.js';
import { SessionService } from '../services/SessionService.js';
import { CacheSyncService } from '../services/CacheSyncService.js';
import { TurnOrchestrator } from '../services/TurnOrchestrator.js';

// dotenv非導入のため.envを簡易パースする（server/tsconfig.mdでも他パッケージでdotenvを
// 使っていないことに合わせた。KEY=VALUE形式、#始まりの行・空行のみ対応）。
function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
loadDotEnv(join(REPO_ROOT, '.env'));

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_MODEL = process.env.TOGETHER_MODEL ?? 'google/gemma-3n-E4B-it';
const TOGETHER_EMBEDDING_MODEL = process.env.TOGETHER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
const CHARACTER_DEF_PATH = process.env.CHARACTER_DEF_PATH;

if (!TOGETHER_API_KEY) {
  throw new Error(
    'e2eConversation: TOGETHER_API_KEYが設定されていません（.envを確認してください）',
  );
}
if (!CHARACTER_DEF_PATH) {
  throw new Error('e2eConversation: CHARACTER_DEF_PATHが設定されていません');
}

// 実行時引数: 参加キャラクターID2〜4個（省略時char_a, char_b）、ターン数（省略時50）
// T31（4体・結合テスト）でT19のスクリプトをそのまま2〜4体に一般化して使えるようにした。
const args = process.argv.slice(2);
const maxTurns = Number(args.find((a) => /^\d+$/.test(a)) ?? '50');
const argParticipantIds = args.filter((a) => !/^\d+$/.test(a));
const participantIds =
  argParticipantIds.length >= 2 && argParticipantIds.length <= 4
    ? argParticipantIds
    : ['char_a', 'char_b'];

async function main(): Promise<void> {
  const db = new Database(':memory:');
  migrate(db);

  const characterCacheRepository = new CharacterCacheRepository(db);
  const memoryRepository = new MemoryRepositoryImpl(db);
  const sessionRepository = new SessionRepository(db);
  const turnRepository = new TurnRepository(db);
  const topicRepository = new TopicRepository(db);

  const loader = new CharacterDefLoader(CHARACTER_DEF_PATH as string);
  const embeddingService = new EmbeddingService(
    new EmbeddingClient(TOGETHER_API_KEY as string, TOGETHER_EMBEDDING_MODEL),
  );
  const cacheSyncService = new CacheSyncService(
    loader,
    characterCacheRepository,
    memoryRepository,
    embeddingService,
    TOGETHER_EMBEDDING_MODEL,
  );
  console.log('[e2e] character_defからキャッシュ同期中...');
  await cacheSyncService.sync();

  const sessionService = new SessionService(sessionRepository, characterCacheRepository);
  const session = sessionService.createSession({ participantIds });
  console.log(
    `[e2e] セッション作成: ${session.id} participants=${participantIds.join(',')} maxTurns=${maxTurns}`,
  );

  const eventBus = new EngineEventBus();
  const llmClient = new TogetherClient(TOGETHER_API_KEY as string, TOGETHER_MODEL);
  const turnOrchestrator = new TurnOrchestrator(
    sessionRepository,
    turnRepository,
    characterCacheRepository,
    memoryRepository,
    topicRepository,
    llmClient,
    eventBus,
  );

  const acts = new Set<string>();
  const topicIds: string[] = [];
  let memoryReferencedCount = 0;
  // T31（requirements.md 7.2）: 発話機会の分配・名指し誘導・関係性破綻の有無を
  // 目視確認するための集計をT19のスクリプトに追加した。
  const speakerCounts = new Map<string, number>();
  // ConversationManagerはtargetIdsを常に1件配列で埋めるため「名指しの有無」自体は
  // 全ターンで真になり指標として意味を持たない。代わりに「誰が誰に名指しされたか」の
  // 分布（被名指し回数）を集計し、特定キャラへの偏りが無いかを目視確認する。
  const targetedCounts = new Map<string, number>();
  const relationshipRanges = new Map<
    string,
    { minTrust: number; maxTrust: number; minIntimacy: number; maxIntimacy: number }
  >();

  eventBus.on('layer:memory', (payload) => {
    const { retrieved } = payload as { retrieved: unknown[] };
    if (retrieved.length > 0) memoryReferencedCount++;
  });
  eventBus.on('layer:relationship', (payload) => {
    const { speakerId, targetId, edge } = payload as {
      speakerId: string;
      targetId: string;
      edge: { trust: number; intimacy: number };
    };
    const key = [speakerId, targetId].sort().join(':');
    const range = relationshipRanges.get(key) ?? {
      minTrust: edge.trust,
      maxTrust: edge.trust,
      minIntimacy: edge.intimacy,
      maxIntimacy: edge.intimacy,
    };
    range.minTrust = Math.min(range.minTrust, edge.trust);
    range.maxTrust = Math.max(range.maxTrust, edge.trust);
    range.minIntimacy = Math.min(range.minIntimacy, edge.intimacy);
    range.maxIntimacy = Math.max(range.maxIntimacy, edge.intimacy);
    relationshipRanges.set(key, range);
  });
  eventBus.on('turn:complete', (payload) => {
    const turn = payload as TurnResult;
    acts.add(turn.dialogueAct);
    if (topicIds[topicIds.length - 1] !== turn.topicId) topicIds.push(turn.topicId);
    speakerCounts.set(turn.speakerId, (speakerCounts.get(turn.speakerId) ?? 0) + 1);
    for (const targetId of turn.targetIds ?? []) {
      targetedCounts.set(targetId, (targetedCounts.get(targetId) ?? 0) + 1);
    }
    console.log(
      `[turn ${turn.turnNo}] ${turn.speakerId}→${turn.targetIds?.join(',') ?? '(全員)'} ` +
        `(${turn.dialogueAct}, topic=${turn.topicId}): ${turn.utterance}`,
    );
  });

  const startedAt = Date.now();
  await turnOrchestrator.start(session.id, maxTurns);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n[e2e] 完了。');
  console.log(`- 経過時間: ${elapsedSec}秒`);
  console.log(`- 参加者: ${participantIds.join(', ')}`);
  console.log(`- 出現したDialogue Act種別数: ${acts.size} (${[...acts].join(', ')})`);
  console.log(`- 話題転換回数（トピック切り替わり）: ${Math.max(0, topicIds.length - 1)}`);
  console.log(`- 記憶(memory)が1件以上取得されたターン数: ${memoryReferencedCount}`);
  console.log(
    `- 発話機会の分配: ${[...speakerCounts.entries()].map(([id, n]) => `${id}=${n}`).join(', ')}`,
  );
  console.log(
    `- 被名指し（targetIds）回数の分布: ${[...targetedCounts.entries()].map(([id, n]) => `${id}=${n}`).join(', ')}`,
  );
  console.log(`- 関係性（trust/intimacy）のペアごとの推移範囲（${relationshipRanges.size}ペア）:`);
  for (const [key, range] of relationshipRanges) {
    console.log(
      `  ${key}: trust ${range.minTrust.toFixed(2)}〜${range.maxTrust.toFixed(2)} / ` +
        `intimacy ${range.minIntimacy.toFixed(2)}〜${range.maxIntimacy.toFixed(2)}`,
    );
  }

  db.close();
}

main().catch((err: unknown) => {
  console.error('[e2e] エラー:', err);
  process.exitCode = 1;
});
