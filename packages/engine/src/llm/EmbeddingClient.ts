const ENDPOINT = 'https://api.together.xyz/v1/embeddings';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

// Together AIのembeddingsモデルはfeatures.md/architecture.mdに既定値の指定が
// 無いため実装者判断で選定した（chat completionsのgoogle/gemma-3n-E4B-itと
// 異なり、Embeddings APIは専用モデルを要求する）。
export const DEFAULT_EMBEDDING_MODEL = 'togethercomputer/m2-bert-80M-8k-retrieval';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractEmbedding(data: unknown): number[] {
  if (!isRecord(data) || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('EmbeddingClient: レスポンス形式が不正です（dataが見つかりません）');
  }
  const first: unknown = data.data[0];
  if (!isRecord(first) || !Array.isArray(first.embedding)) {
    throw new Error('EmbeddingClient: レスポンス形式が不正です（embeddingが見つかりません）');
  }
  if (!first.embedding.every((v) => typeof v === 'number')) {
    throw new Error('EmbeddingClient: embeddingに数値以外の要素が含まれています');
  }
  return first.embedding as number[];
}

/** Together AI embeddings呼び出し（F7.2、memory/EmbeddingServiceが利用）。 */
export class EmbeddingClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_EMBEDDING_MODEL,
  ) {}

  async embed(text: string): Promise<Float32Array> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.requestOnce(text);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  private async requestOnce(text: string): Promise<Float32Array> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`EmbeddingClient: リクエストが失敗しました (status=${response.status})`);
      }

      const data: unknown = await response.json();
      return new Float32Array(extractEmbedding(data));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
