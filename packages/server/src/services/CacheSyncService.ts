import { DEFAULT_EMBEDDING_MODEL } from '@prottype2/engine';
import type { CharacterDefLoader, EmbeddingService } from '@prottype2/engine';
import type { CharacterCacheRepository, MemoryRepositoryImpl } from '../db/repositories/index.js';

/**
 * server起動時に`CharacterDefLoader`の結果を`characters_cache`/`memory_preset_cache`等へ
 * 同期する（data-design.md 4.1）。記憶プリセットのembeddingも同時に計算しキャッシュする
 * （data-design.md 6.2: 「書き込み時に一括計算しmemory_embeddingsにキャッシュする」）。
 */
export class CacheSyncService {
  constructor(
    private readonly loader: CharacterDefLoader,
    private readonly characterCacheRepository: CharacterCacheRepository,
    private readonly memoryRepository: MemoryRepositoryImpl,
    private readonly embeddingService?: EmbeddingService,
    private readonly embeddingModel: string = DEFAULT_EMBEDDING_MODEL,
  ) {}

  async sync(): Promise<void> {
    const { characters, subCharacters, memoryPresets } = await this.loader.loadAll();

    this.characterCacheRepository.syncCharacters(characters);
    this.characterCacheRepository.syncSubCharacters(subCharacters);
    this.characterCacheRepository.syncMemoryPresets(memoryPresets);

    if (!this.embeddingService) return;

    for (const memory of memoryPresets) {
      const vector = await this.embeddingService.embed(memory.summary);
      this.memoryRepository.saveEmbedding(memory.id, 'preset', this.embeddingModel, vector);
    }
  }
}
