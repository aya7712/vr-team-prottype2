import { describe, expect, it, vi } from 'vitest';
import { SpeakerBalanceAdvisor } from './SpeakerBalanceAdvisor.js';
import type { SpeakerBalanceAdvisorInput } from './SpeakerBalanceAdvisor.js';
import { PromptBuilder } from './PromptBuilder.js';
import type { PromptTemplateLoader } from './PromptTemplateLoader.js';
import type { LlmClient } from './LlmClient.js';

function makePromptBuilder(): PromptBuilder {
  const loader: PromptTemplateLoader = {
    load: vi.fn().mockReturnValue('{{participantList}}/{{recentDialogue}}'),
  } as unknown as PromptTemplateLoader;
  return new PromptBuilder(loader);
}

function makeInput(overrides?: Partial<SpeakerBalanceAdvisorInput>): SpeakerBalanceAdvisorInput {
  return {
    participants: [
      { characterId: 'char_a', name: '宇良', recentSpeakCount: 3 },
      { characterId: 'char_b', name: '楽', recentSpeakCount: 1 },
      { characterId: 'char_c', name: '理久', recentSpeakCount: 0 },
    ],
    recentDialogue: '宇良: 昔の話をするよ\n宇良: あの時さ\n宇良: 楽しかったな',
    ...overrides,
  };
}

describe('SpeakerBalanceAdvisor', () => {
  it('理由のない偏りと判定された場合、推奨話者を含む結果を返す', async () => {
    const llmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValue(
          '{"justified": false, "recommendedSpeakerId": "char_c", "reason": "理久がずっと発言していない"}',
        ),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.justified).toBe(false);
    expect(result.recommendedSpeakerId).toBe('char_c');
    expect(result.reason).toBe('理久がずっと発言していない');
    expect(result.error).toBeUndefined();
  });

  it('偏りが内容的に正当化される場合、justified:trueかつrecommendedSpeakerId:nullを返す', async () => {
    const llmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValue(
          '{"justified": true, "recommendedSpeakerId": null, "reason": "宇良が自分の思い出を語っている最中のため"}',
        ),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.justified).toBe(true);
    expect(result.recommendedSpeakerId).toBeNull();
  });

  it('LLMが参加者一覧に無いIDを返した場合、recommendedSpeakerIdはnullになる（幻覚対策）', async () => {
    const llmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValue(
          '{"justified": false, "recommendedSpeakerId": "char_z", "reason": "存在しないID"}',
        ),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.recommendedSpeakerId).toBeNull();
  });

  it('LLM出力の前後に説明文が混ざっていても、JSON部分だけを抽出して解析する', async () => {
    const llmClient: LlmClient = {
      complete: vi
        .fn()
        .mockResolvedValue(
          '判定結果は以下の通りです。\n{"justified": false, "recommendedSpeakerId": "char_b", "reason": "理由"}\n以上です。',
        ),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.recommendedSpeakerId).toBe('char_b');
  });

  it('LLM呼び出しが失敗した場合、判定なし（justified:false, recommendedSpeakerId:null）にフォールバックする', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockRejectedValue(new Error('TogetherClient: タイムアウトしました')),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.justified).toBe(false);
    expect(result.recommendedSpeakerId).toBeNull();
    expect(result.rawOutput).toBeNull();
    expect(result.error).toContain('タイムアウト');
  });

  it('LLM出力がJSONとして解析できない場合も、判定なしにフォールバックする', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('特に理由はありません'),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput());

    expect(result.justified).toBe(false);
    expect(result.recommendedSpeakerId).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('recentDialogueが空文字列の場合、LLM呼び出しを行わず判定なしをそのまま返す（会話開始直後）', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('{"justified": false, "recommendedSpeakerId": "char_a"}'),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput({ recentDialogue: '   ' }));

    expect(result.justified).toBe(false);
    expect(result.recommendedSpeakerId).toBeNull();
    expect(result.rawOutput).toBeNull();
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('participantsが空の場合、LLM呼び出しを行わず判定なしをそのまま返す', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('{"justified": false}'),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    const result = await advisor.advise(makeInput({ participants: [] }));

    expect(result.justified).toBe(false);
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('inputのmodelを指定すると、llmClient.completeにそのまま渡される', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('{"justified": true}'),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    await advisor.advise(makeInput({ model: 'google/gemma-4-31B-it' }));

    expect(llmClient.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: 'google/gemma-4-31B-it' }),
    );
  });

  it('modelを指定しない場合、llmClient.completeにはundefinedが渡る（TogetherClient既定にフォールバック）', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('{"justified": true}'),
    };
    const advisor = new SpeakerBalanceAdvisor(makePromptBuilder(), llmClient);

    await advisor.advise(makeInput());

    expect(llmClient.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: undefined, temperature: expect.any(Number) }),
    );
  });
});
