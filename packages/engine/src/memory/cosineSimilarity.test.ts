import { describe, expect, it } from 'vitest';
import { cosineSimilarity } from './cosineSimilarity.js';

describe('cosineSimilarity', () => {
  it('同一方向のベクトルは類似度1になる', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([2, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('直交するベクトルは類似度0になる', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('逆方向のベクトルは類似度-1になる', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('ゼロベクトルは0を返す', () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('次元数が異なると例外を投げる', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => cosineSimilarity(a, b)).toThrow();
  });
});
