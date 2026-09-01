import type { EmbeddingClient } from '../llm/EmbeddingClient.js';

/** Together AI Embeddings APIラッパー（memory/EmbeddingRetrieverが利用、T15）。 */
export class EmbeddingService {
  constructor(private readonly client: EmbeddingClient) {}

  async embed(text: string): Promise<Float32Array> {
    return this.client.embed(text);
  }

  // T43: MemoryRetriever.recordSelfUtterance()がmemory_embeddings保存時に
  // 使用モデル名を記録するために必要（EmbeddingClient.getModelへの委譲）。
  getModel(): string {
    return this.client.getModel();
  }
}
