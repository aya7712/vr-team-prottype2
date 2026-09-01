import { describe, expect, it, vi } from 'vitest';
import { ToneReviewer } from './ToneReviewer.js';
import { PromptBuilder } from './PromptBuilder.js';
import type { PromptTemplateLoader } from './PromptTemplateLoader.js';
import type { LlmClient } from './LlmClient.js';

function makePromptBuilder(): PromptBuilder {
  const loader: PromptTemplateLoader = {
    load: vi
      .fn()
      .mockReturnValue(
        '{{characterName}}/{{personality}}/{{toneSample}}/{{firstPerson}}/' +
          '{{otherCharacterName}}/{{otherToneSample}}/{{otherFirstPerson}}/{{utterance}}',
      ),
  } as unknown as PromptTemplateLoader;
  return new PromptBuilder(loader);
}

function makeInput(utterance: string) {
  return {
    utterance,
    speaker: {
      name: '宇良',
      personality: '天真爛漫',
      toneSample: '〜だよ！',
      firstPerson: 'ぼく',
    },
    previousSpeaker: {
      name: '楽',
      personality: '冷静',
      toneSample: '〜ですね',
      firstPerson: '私',
    },
  };
}

describe('ToneReviewer', () => {
  it('口調の逸脱がある場合、LLMが返した書き換え後のセリフを採用する', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('「そうだよ！ぼくもそう思う！」'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review(makeInput('そうですね、私もそう思います'));

    expect(result.utterance).toBe('そうだよ！ぼくもそう思う！');
    expect(result.applied).toBe(true);
    expect(result.rawOutput).toBe('「そうだよ！ぼくもそう思う！」');
    expect(result.error).toBeUndefined();
  });

  it('口調の逸脱がない場合、元のセリフをそのまま返す（LLMが同一内容を返すケース）', async () => {
    const original = 'そうだよ！ぼくもそう思う！';
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue(original),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review(makeInput(original));

    expect(result.utterance).toBe(original);
    expect(result.applied).toBe(false);
  });

  it('LLM呼び出しが失敗した場合、審査前の発話にフォールバックする', async () => {
    const original = 'そうですね、私もそう思います';
    const llmClient: LlmClient = {
      complete: vi.fn().mockRejectedValue(new Error('TogetherClient: タイムアウトしました')),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review(makeInput(original));

    expect(result.utterance).toBe(original);
    expect(result.applied).toBe(false);
    expect(result.rawOutput).toBeNull();
    expect(result.error).toContain('タイムアウト');
  });

  it('previousSpeakerがnull（会話開始直後）でも例外にならずプロンプトを構築する', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('やったー！'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review({
      utterance: 'やったー！',
      speaker: {
        name: '宇良',
        personality: '天真爛漫',
        toneSample: '〜だよ！',
        firstPerson: 'ぼく',
      },
      previousSpeaker: null,
    });

    expect(result.utterance).toBe('やったー！');
    expect(result.prompt).toContain('(なし');
  });

  it('LLM呼び出しにtemperatureオプションを渡す', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('やったー！'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    await reviewer.review(makeInput('やったー！'));

    expect(llmClient.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ temperature: expect.any(Number) }),
    );
  });

  // T43のE2E確認で発見した回帰防止テスト: modelを渡さないと、TogetherClient側の
  // ハードコードされた既定モデル（Together AI側でserverless提供終了済み）にフォールバックし、
  // 審査呼び出しが常に400エラーで失敗する不具合があった。発話生成本体と同じモデルを
  // ToneReviewInput.modelとして渡せば、それがそのままllmClient.completeに転送されることを確認する。
  it('ToneReviewInput.modelを指定すると、llmClient.completeにそのまま渡される', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('やったー！'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    await reviewer.review({ ...makeInput('やったー！'), model: 'google/gemma-4-31B-it' });

    expect(llmClient.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: 'google/gemma-4-31B-it' }),
    );
  });

  // T43のE2E確認で発見した回帰防止テスト: 発話生成本体がまれに空文字列を返すケースで、
  // それをそのまま審査に回すと、LLMが「セリフが入力されていません」のような無関係な応答を
  // 返し、それをそのまま採用してしまう不具合があった。空/空白のみのutteranceはLLM呼び出し
  // 自体を行わずスキップすることを確認する。
  it('審査対象のutteranceが空文字列の場合、LLM呼び出しを行わずそのまま返す', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('無関係な応答'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review(makeInput(''));

    expect(result.utterance).toBe('');
    expect(result.applied).toBe(false);
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('審査対象のutteranceが空白のみの場合も、LLM呼び出しを行わずそのまま返す', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('無関係な応答'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    const result = await reviewer.review(makeInput('   '));

    expect(result.utterance).toBe('   ');
    expect(llmClient.complete).not.toHaveBeenCalled();
  });

  it('ToneReviewInput.modelを指定しない場合、llmClient.completeにはundefinedが渡る（TogetherClient既定にフォールバック）', async () => {
    const llmClient: LlmClient = {
      complete: vi.fn().mockResolvedValue('やったー！'),
    };
    const reviewer = new ToneReviewer(makePromptBuilder(), llmClient);

    await reviewer.review(makeInput('やったー！'));

    expect(llmClient.complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: undefined }),
    );
  });
});
