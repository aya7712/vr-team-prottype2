export interface LlmClient {
  complete(prompt: string, options?: { temperature?: number }): Promise<string>;
}
