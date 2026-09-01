import { describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from './EmbeddingService.js';
import type { EmbeddingClient } from '../llm/EmbeddingClient.js';

describe('EmbeddingService', () => {
  it('embedはEmbeddingClient.embedへ委譲する', async () => {
    const vector = new Float32Array([0.1, 0.2]);
    const client = { embed: vi.fn().mockResolvedValue(vector) } as unknown as EmbeddingClient;
    const service = new EmbeddingService(client);

    const result = await service.embed('テスト');
    expect(result).toBe(vector);
    expect(client.embed).toHaveBeenCalledWith('テスト');
  });

  it('getModelはEmbeddingClient.getModelへ委譲する（T43）', () => {
    const client = {
      getModel: vi.fn().mockReturnValue('my-embedding-model'),
    } as unknown as EmbeddingClient;
    const service = new EmbeddingService(client);

    expect(service.getModel()).toBe('my-embedding-model');
  });
});
