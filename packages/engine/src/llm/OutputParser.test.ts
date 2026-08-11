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
});
