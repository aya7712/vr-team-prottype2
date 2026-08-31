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

  // T43: Issue #1（他キャラの発話に口調が引っ張られる）対応の検証。
  describe('checkToneConsistency', () => {
    const others = [
      { characterId: 'char_b', firstPerson: 'ボク', toneSample: '今日も元気いっぱいなのだ！' },
      { characterId: 'char_c', firstPerson: '拙者', toneSample: 'それがしはそう思うでござる。' },
    ];

    it('他キャラの一人称・語尾のどちらも含まなければokになる', () => {
      const result = parser.checkToneConsistency('今日は天気がいいね', others);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('他キャラのfirstPersonを含むと違反として検知する', () => {
      const result = parser.checkToneConsistency('ボクはそう思うよ', others);
      expect(result.ok).toBe(false);
      expect(result.violations).toContainEqual({ characterId: 'char_b', matchedPattern: 'ボク' });
    });

    it('他キャラのtoneSampleの語尾パターンを含むと違反として検知する', () => {
      const result = parser.checkToneConsistency('それは楽しそうでござる', others);
      expect(result.ok).toBe(false);
      expect(result.violations).toContainEqual({
        characterId: 'char_c',
        matchedPattern: 'でござる',
      });
    });

    it('複数キャラの口調が混入している場合は複数件の違反を返す', () => {
      const result = parser.checkToneConsistency('ボクはそう思うでござる', others);
      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('firstPerson/toneSampleがnullのキャラクターはチェック対象外になる', () => {
      const result = parser.checkToneConsistency('何も言わない', [
        { characterId: 'char_d', firstPerson: null, toneSample: null },
      ]);
      expect(result.ok).toBe(true);
    });

    it('語尾候補が1文字しかない場合は誤検知を避けるため無視する', () => {
      const result = parser.checkToneConsistency('のだ', [
        { characterId: 'char_e', firstPerson: null, toneSample: 'の' },
      ]);
      expect(result.ok).toBe(true);
    });
  });
});
