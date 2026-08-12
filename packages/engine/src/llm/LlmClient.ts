export interface LlmClient {
  complete(prompt: string, options?: { temperature?: number; model?: string }): Promise<string>;
}
