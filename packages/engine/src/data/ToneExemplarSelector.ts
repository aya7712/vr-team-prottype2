import type { MemoryItem } from '../types/memory.js';

const MAX_EXEMPLARS = 4;
const MAX_EXCERPT_LENGTH = 90;
const MIN_EXCERPT_LENGTH = 8;
// 文末記号（。！？）の直後、または改行で分割する。会話文特有の「」等は思い出ファイルの
// 本文が地の文中心（一人称の体験談）のため前提にしない（実装者判断）。
const SENTENCE_SPLIT_PATTERN = /(?<=[。！？])|\n+/;

function splitIntoSentences(body: string): string[] {
  return body
    .split(SENTENCE_SPLIT_PATTERN)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * `character_def/memory/<owner>/*.md`の本文（`CharacterDefLoader`が読み込み専用で
 * 取り込んだ`MemoryItem.body`）から、話者自身が語り手（`owner === characterId`）の記憶を
 * 抜粋し、口調の実例としてプロンプトに提示できる短文へ整形する。
 *
 * Issue #5コメントの案1「口調サンプル数を増やす」対応。コメント原文は
 * character_def側（`design/main`）への書き込みを求めているが、`data-design.md` 7章・
 * `implementation-rules.md` 9章の「character_defへの書き込みは行わない」方針を優先し、
 * character_def側を変更せず実行時に読み込み専用のまま抽出する形に読み替えている
 * （PR本文参照）。
 */
export class ToneExemplarSelector {
  select(memoryPresets: MemoryItem[], characterId: string, maxExemplars = MAX_EXEMPLARS): string[] {
    const ownMemories = memoryPresets
      .filter((memory) => memory.owner === characterId && (memory.body ?? '').length > 0)
      // より印象的な（importanceが高い）記憶を優先的に採用する。同点は読み込み順を維持する
      // （Array.prototype.sortの安定ソートに依存、Node.js/V8では保証されている）。
      .sort((a, b) => b.importance - a.importance);

    const exemplars: string[] = [];
    for (const memory of ownMemories) {
      if (exemplars.length >= maxExemplars) break;
      const excerpt = this.pickExcerpt(memory.body ?? '');
      if (excerpt && !exemplars.includes(excerpt)) {
        exemplars.push(excerpt);
      }
    }
    return exemplars;
  }

  private pickExcerpt(body: string): string | null {
    const sentences = splitIntoSentences(body).filter(
      (sentence) => sentence.length >= MIN_EXCERPT_LENGTH,
    );
    if (sentences.length === 0) return null;

    // 記憶本文の最初の一文は「〜した日のことだ」のような状況説明になりがちで、
    // 語尾・一人称・テンションが乗った文は中盤以降に多い傾向があるため、
    // 先頭ではなく中央付近の一文を採用する（実装者判断、doc/design未規定）。
    const picked = sentences[Math.floor(sentences.length / 2)];
    if (picked.length <= MAX_EXCERPT_LENGTH) return picked;

    // Array.fromでコードポイント単位に分解してから切り詰める。String.prototype.sliceは
    // UTF-16コードユニット単位のため、絵文字等のサロゲートペアの境界で分割すると
    // 後段（DB保存・LLM送信）で文字化けする恐れがある（自己レビューで指摘、対応済み）。
    return `${Array.from(picked).slice(0, MAX_EXCERPT_LENGTH).join('')}…`;
  }
}
