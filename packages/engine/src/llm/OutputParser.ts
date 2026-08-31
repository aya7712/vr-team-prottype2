const WRAPPING_QUOTE_PATTERNS: [RegExp, string, string][] = [
  [/^「([\s\S]*)」$/, '「', '」'],
  [/^"([\s\S]*)"$/, '"', '"'],
  [/^'([\s\S]*)'$/, "'", "'"],
];

export interface ConsistencyCheckResult {
  ok: boolean;
  violatedTopics: string[];
}

// checkToneConsistencyの入力。話者以外の参加キャラクター1人分の口調情報
// （T43、Issue #1: 他キャラの語尾・一人称に引っ張られる問題への対処）。
export interface OtherCharacterToneProfile {
  characterId: string;
  firstPerson: string | null;
  toneSample: string | null;
}

export interface ToneViolation {
  characterId: string;
  matchedPattern: string;
}

export interface ToneConsistencyCheckResult {
  ok: boolean;
  violations: ToneViolation[];
}

// toneSampleから語尾パターンとみなす末尾の最小文字数（1文字だと助詞等の誤検知が多すぎるため）。
const MIN_TONE_ENDING_LENGTH = 2;
// toneSampleの最後の文から語尾パターンとして切り出す最大文字数。
const MAX_TONE_ENDING_LENGTH = 4;

/** LLM出力からセリフ本文を抽出し、簡易整合性チェックを行う（F7.3）。 */
export class OutputParser {
  // LLM出力から先頭行のみを取り出し、前後の空白・囲み引用符を除去する。
  extractUtterance(rawOutput: string): string {
    const firstLine = rawOutput.trim().split(/\r?\n/)[0]?.trim() ?? '';

    for (const [pattern] of WRAPPING_QUOTE_PATTERNS) {
      const match = pattern.exec(firstLine);
      if (match) return match[1].trim();
    }
    return firstLine;
  }

  // キャラクターのng_topicsに触れていないかの簡易チェック（キーワード部分一致）。
  checkConsistency(utterance: string, ngTopics: string[]): ConsistencyCheckResult {
    const violatedTopics = ngTopics.filter((topic) => utterance.includes(topic));
    return { ok: violatedTopics.length === 0, violatedTopics };
  }

  // 生成された発話に、話者以外の参加キャラクターのfirstPerson・toneSampleの語尾パターンが
  // 混入していないかの簡易チェック（T43、Issue #1）。checkConsistencyと同様、
  // キーワード部分一致による簡易実装（誤検知・検知漏れがあり得ることは許容する。
  // 詳細はdoc/todo.md T43参照）。
  checkToneConsistency(
    utterance: string,
    otherCharacters: OtherCharacterToneProfile[],
  ): ToneConsistencyCheckResult {
    const violations: ToneViolation[] = [];

    for (const other of otherCharacters) {
      if (other.firstPerson && utterance.includes(other.firstPerson)) {
        violations.push({ characterId: other.characterId, matchedPattern: other.firstPerson });
      }

      const toneEnding = this.extractToneEnding(other.toneSample);
      if (toneEnding && utterance.includes(toneEnding)) {
        violations.push({ characterId: other.characterId, matchedPattern: toneEnding });
      }
    }

    return { ok: violations.length === 0, violations };
  }

  // toneSample（自由記述の例文）から「特徴的な語尾」を抽出する簡易ヒューリスティック。
  // data-design.mdにtoneSampleを語尾のみに構造化したフィールドは無いため、句読点・改行で
  // 区切った最後の文の末尾数文字を語尾パターンとみなす（実装者判断、implementation-rules.md 9章）。
  private extractToneEnding(toneSample: string | null): string | null {
    if (!toneSample) return null;

    const sentences = toneSample
      .trim()
      .split(/[。！？\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const lastSentence = sentences.at(-1) ?? toneSample.trim();
    const ending = lastSentence.slice(-MAX_TONE_ENDING_LENGTH);

    return ending.length >= MIN_TONE_ENDING_LENGTH ? ending : null;
  }
}
