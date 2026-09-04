const WRAPPING_QUOTE_PATTERNS: [RegExp, string, string][] = [
  [/^「([\s\S]*)」$/, '「', '」'],
  [/^"([\s\S]*)"$/, '"', '"'],
  [/^'([\s\S]*)'$/, "'", "'"],
];

// プロンプト（prompts/utterance/base.md）の指示に対応する「対象:〇〇」申告行のパターン。
// 全角/半角コロンいずれも許容する。
const TARGET_LINE_PATTERN = /^対象[:：]\s*(.*)$/;
// 「対象:なし」等、呼びかけ対象なしを表す申告値（末尾の句読点・記号はTRAILING_MARK_PATTERNで
// 別途除去したうえで比較するため、ここでは基本形のみを列挙すればよい）。
const NO_TARGET_VALUES = new Set(['なし', '無し']);
// 「対象:」の値末尾にLLMが付け足しがちな句読点・記号（全角/半角の。！？」』"'や空白等）。
const TRAILING_MARK_PATTERN = /[。.、,！!？?」』"'\s]+$/;

export interface ConsistencyCheckResult {
  ok: boolean;
  violatedTopics: string[];
}

export interface UtteranceOutput {
  /** LLM出力から抽出したセリフ本文（1行目）。 */
  utterance: string;
  /**
   * LLMが2行目以降に申告した呼びかけ対象の名前（CharacterDefRecord.name想定の生の文字列）。
   * 「対象:なし」と申告された場合・申告行自体が見つからない場合はnull
   * （呼び出し側で既存のtargetIdへのフォールバックを行うことを想定する。Issue #15）。
   */
  declaredTargetName: string | null;
}

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

  /**
   * LLM出力からセリフ本文（1行目）と、申告された呼びかけ対象（2行目以降の「対象:〇〇」行）を
   * 1回の出力からまとめて抽出する（Issue #15 plan-b）。LLMが指示通りの2行構成で出力しない
   * 場合（1行のみ・申告行の書式崩れ等）はdeclaredTargetNameがnullになるため、
   * 呼び出し側で既存のtargetId決定ロジックへフォールバックすることを想定する。
   */
  parseUtteranceOutput(rawOutput: string): UtteranceOutput {
    const utterance = this.extractUtterance(rawOutput);
    const lines = rawOutput.trim().split(/\r?\n/);

    for (const line of lines.slice(1)) {
      const match = TARGET_LINE_PATTERN.exec(line.trim());
      if (!match) continue;
      // 末尾の句読点・記号はLLMが付け足すことがあるため取り除いてから比較・返却する。
      const name = match[1].trim().replace(TRAILING_MARK_PATTERN, '');
      return {
        utterance,
        declaredTargetName: name === '' || NO_TARGET_VALUES.has(name) ? null : name,
      };
    }
    return { utterance, declaredTargetName: null };
  }

  // キャラクターのng_topicsに触れていないかの簡易チェック（キーワード部分一致）。
  checkConsistency(utterance: string, ngTopics: string[]): ConsistencyCheckResult {
    const violatedTopics = ngTopics.filter((topic) => utterance.includes(topic));
    return { ok: violatedTopics.length === 0, violatedTopics };
  }
}
