import { describe, expect, it } from 'vitest';
import { OutputParser } from './OutputParser.js';

describe('OutputParser', () => {
  const parser = new OutputParser();

  it('前後の空白を除去する', () => {
    expect(parser.extractUtterance('  やったー！  ')).toBe('やったー！');
  });

  it('鍵括弧で囲まれた出力から本文だけを抽出する', () => {
    expect(parser.extractUtterance('「やったー！」')).toBe('やったー！');
  });

  it('ダブルクォートで囲まれた出力から本文だけを抽出する', () => {
    expect(parser.extractUtterance('"やったー！"')).toBe('やったー！');
  });

  it('複数行出力の場合は先頭行のみを採用する', () => {
    expect(parser.extractUtterance('やったー！\n（補足の説明）')).toBe('やったー！');
  });

  it('checkConsistencyはng_topicsに触れていなければokになる', () => {
    const result = parser.checkConsistency('今日は天気がいいね', ['政治', '宗教']);
    expect(result.ok).toBe(true);
    expect(result.violatedTopics).toEqual([]);
  });

  it('checkConsistencyはng_topicsに触れていればokがfalseになる', () => {
    const result = parser.checkConsistency('政治の話をしよう', ['政治', '宗教']);
    expect(result.ok).toBe(false);
    expect(result.violatedTopics).toEqual(['政治']);
  });

  describe('parseUtteranceOutput（Issue #15 plan-b: 呼びかけ対象の申告抽出）', () => {
    it('2行構成の出力からセリフ本文と申告された対象名を抽出する', () => {
      const result = parser.parseUtteranceOutput('ねぇ楽、今度みんなで遊びに行かない？\n対象:楽');
      expect(result.utterance).toBe('ねぇ楽、今度みんなで遊びに行かない？');
      expect(result.declaredTargetName).toBe('楽');
    });

    it('全角コロン表記でも対象名を抽出する', () => {
      const result = parser.parseUtteranceOutput('そうだね\n対象：理久');
      expect(result.declaredTargetName).toBe('理久');
    });

    it('鍵括弧で囲まれたセリフ＋対象申告の組み合わせも扱える', () => {
      const result = parser.parseUtteranceOutput('「やったー！」\n対象:あかり');
      expect(result.utterance).toBe('やったー！');
      expect(result.declaredTargetName).toBe('あかり');
    });

    it('「対象:なし」の場合はdeclaredTargetNameがnullになる', () => {
      const result = parser.parseUtteranceOutput('今日はいい天気だね\n対象:なし');
      expect(result.utterance).toBe('今日はいい天気だね');
      expect(result.declaredTargetName).toBeNull();
    });

    it('「対象:なし」に感嘆符等が付いた表記ゆれでもnullになる', () => {
      expect(parser.parseUtteranceOutput('そうだね\n対象:なし！').declaredTargetName).toBeNull();
      expect(parser.parseUtteranceOutput('そうだね\n対象：無し？').declaredTargetName).toBeNull();
    });

    it('対象申告行が末尾の句読点付きでも名前だけを抽出する', () => {
      const result = parser.parseUtteranceOutput('わかるよそれ\n対象:楽。');
      expect(result.declaredTargetName).toBe('楽');
    });

    it('2行目が無い（フォーマット崩れ）場合はdeclaredTargetNameがnullになる', () => {
      const result = parser.parseUtteranceOutput('一言だけ返す');
      expect(result.utterance).toBe('一言だけ返す');
      expect(result.declaredTargetName).toBeNull();
    });

    it('対象申告行の書式が崩れている（プレフィックス不一致）場合はnullになる', () => {
      const result = parser.parseUtteranceOutput('こんにちは\n宛先:楽');
      expect(result.declaredTargetName).toBeNull();
    });

    it('補足説明などの余分な行があっても2行目以降から対象申告を見つける', () => {
      const result = parser.parseUtteranceOutput('おはよう\n（補足）\n対象:楽');
      expect(result.declaredTargetName).toBe('楽');
    });
  });
});
