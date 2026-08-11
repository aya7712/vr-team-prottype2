const WRAPPING_QUOTE_PATTERNS: [RegExp, string, string][] = [
  [/^「([\s\S]*)」$/, '「', '」'],
  [/^"([\s\S]*)"$/, '"', '"'],
  [/^'([\s\S]*)'$/, "'", "'"],
];

export interface ConsistencyCheckResult {
  ok: boolean;
  violatedTopics: string[];
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

  // キャラクターのng_topicsに触れていないかの簡易チェック（キーワード部分一致）。
  checkConsistency(utterance: string, ngTopics: string[]): ConsistencyCheckResult {
    const violatedTopics = ngTopics.filter((topic) => utterance.includes(topic));
    return { ok: violatedTopics.length === 0, violatedTopics };
  }
}
