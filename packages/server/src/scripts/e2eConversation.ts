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

// 実行時引数: 参加キャラクターID2つ（省略時char_a, char_b）、ターン数（省略時50）
const args = process.argv.slice(2);
const maxTurns = Number(args.find((a) => /^\d+$/.test(a)) ?? '50');
const participantIds = args.filter((a) => !/^\d+$/.test(a));
const [charA, charB] = participantIds.length === 2 ? participantIds : ['char_a', 'char_b'];

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
  const session = sessionService.createSession({ participantIds: [charA, charB] });
  console.log(
    `[e2e] セッション作成: ${session.id} participants=${charA},${charB} maxTurns=${maxTurns}`,
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

  eventBus.on('layer:memory', (payload) => {
    const { retrieved } = payload as { retrieved: unknown[] };
    if (retrieved.length > 0) memoryReferencedCount++;
  });
  eventBus.on('turn:complete', (payload) => {
    const turn = payload as TurnResult;
    acts.add(turn.dialogueAct);
    if (topicIds[topicIds.length - 1] !== turn.topicId) topicIds.push(turn.topicId);
    console.log(
      `[turn ${turn.turnNo}] ${turn.speakerId} (${turn.dialogueAct}, topic=${turn.topicId}): ${turn.utterance}`,
    );
  });

  const startedAt = Date.now();
  await turnOrchestrator.start(session.id, maxTurns);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n[e2e] 完了。');
  console.log(`- 経過時間: ${elapsedSec}秒`);
  console.log(`- 出現したDialogue Act種別数: ${acts.size} (${[...acts].join(', ')})`);
  console.log(`- 話題転換回数（トピック切り替わり）: ${Math.max(0, topicIds.length - 1)}`);
  console.log(`- 記憶(memory)が1件以上取得されたターン数: ${memoryReferencedCount}`);

  db.close();
}

main().catch((err: unknown) => {
  console.error('[e2e] エラー:', err);
  process.exitCode = 1;
});
