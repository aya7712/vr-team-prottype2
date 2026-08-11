import type { EmbeddingClient } from '../llm/EmbeddingClient.js';

/** Together AI Embeddings APIラッパー（memory/EmbeddingRetrieverが利用、T15）。 */
export class EmbeddingService {
  constructor(private readonly client: EmbeddingClient) {}

  async embed(text: string): Promise<Float32Array> {
    return this.client.embed(text);
  }
}
