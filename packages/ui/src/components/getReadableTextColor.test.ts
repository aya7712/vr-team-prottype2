import { describe, expect, it } from 'vitest';
import { getReadableTextColor } from './getReadableTextColor';

describe('getReadableTextColor', () => {
  it('明るい背景には黒文字を返す', () => {
    expect(getReadableTextColor('#FFFFFF')).toBe('#000000');
  });

  it('暗い背景には白文字を返す', () => {
    expect(getReadableTextColor('#000000')).toBe('#FFFFFF');
  });

  it('char_a（黄色 #FFC20E）には黒文字を返す', () => {
    expect(getReadableTextColor('#FFC20E')).toBe('#000000');
  });

  it('char_c（水色 #89c3eb）には黒文字を返す', () => {
    expect(getReadableTextColor('#89c3eb')).toBe('#000000');
  });

  it('char_b（若竹色 #67be8d）には黒文字を返す', () => {
    expect(getReadableTextColor('#67be8d')).toBe('#000000');
  });

  it('char_d（深蘇芳 #740125）には白文字を返す', () => {
    expect(getReadableTextColor('#740125')).toBe('#FFFFFF');
  });
});
