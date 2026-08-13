import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CharacterDefLoader,
  DEFAULT_EMBEDDING_MODEL,
  EmbeddingClient,
  EmbeddingService,
  EngineEventBus,
  TogetherClient,
} from '@prottype2/engine';
import { openMigratedDatabase } from './db/migrate.js';
import { CharacterCacheRepository } from './db/repositories/CharacterCacheRepository.js';
import { MemoryRepositoryImpl } from './db/repositories/MemoryRepositoryImpl.js';
import { CacheSyncService } from './services/CacheSyncService.js';
import { createApp } from './app.js';
import { attachWebSocketGateway } from './ws/gateway.js';

// dotenv非導入のため.envを簡易パースする（e2eConversation.tsと同じ方針）。
// OS環境変数を優先し、.envの値では上書きしない（architecture.md 9章）。
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

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadDotEnv(join(REPO_ROOT, '.env'));

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_MODEL = process.env.TOGETHER_MODEL ?? 'google/gemma-3n-E4B-it';
const TOGETHER_EMBEDDING_MODEL = process.env.TOGETHER_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
const CHARACTER_DEF_PATH =
  process.env.CHARACTER_DEF_PATH ?? '/home/sora_55/workspace/vr-team/character_def';
const PORT = Number(process.env.PORT ?? '3000');

if (!TOGETHER_API_KEY) {
  throw new Error('main: TOGETHER_API_KEYが設定されていません（.envを確認してください）');
}

/** `architecture.md` 10章のローカル起動手順（`npm run dev`）が指すサーバー本体。 */
async function main(): Promise<void> {
  const dataDir = join(REPO_ROOT, 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = openMigratedDatabase(join(dataDir, 'engine.sqlite'));

  const characterCacheRepository = new CharacterCacheRepository(db);
  const memoryRepository = new MemoryRepositoryImpl(db);
  const loader = new CharacterDefLoader(CHARACTER_DEF_PATH);
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
  console.log('[server] character_defからキャッシュ同期中...');
  await cacheSyncService.sync();

  const eventBus = new EngineEventBus();
  const llmClient = new TogetherClient(TOGETHER_API_KEY as string, TOGETHER_MODEL);
  const app = createApp(db, { llmClient, eventBus });
  const httpServer = createServer(app);
  attachWebSocketGateway(httpServer, eventBus);

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT} (model=${TOGETHER_MODEL})`);
  });
}

main().catch((err: unknown) => {
  console.error('[server] 起動に失敗しました:', err);
  process.exitCode = 1;
});
