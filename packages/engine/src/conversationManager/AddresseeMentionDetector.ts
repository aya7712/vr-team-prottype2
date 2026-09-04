// 名前の直後にこれらの敬称が続く場合も「呼びかけ/名指し」とみなす（例: 「楽さん」「海斗くん」）。
const HONORIFIC_SUFFIXES = ['さん', 'ちゃん', 'くん', '君', '様'];
// 敬称の有無に関わらず、名前の直後に格助詞・係助詞が続く場合も名指しとみなす
// （例: 「楽は」「理久も」「七崎さんが」）。日本語の格助詞・係助詞は閉じた集合であり、
// 「楽しい」のような形容詞語尾（「し」等）とは重ならないため、ここに列挙する助詞に
// 限定する限り「名前の一部が別の単語の先頭と偶然一致する」誤検出は増えない
// （実装者判断、implementation-rules.md 9章）。
const ADDRESS_PARTICLES = [
  'は',
  'も',
  'が',
  'を',
  'に',
  'で',
  'と',
  'や',
  'の',
  'か',
  'ね',
  'よ',
  'から',
  'まで',
  'より',
  'って',
  'ってば',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 名指し検出の候補1件分。呼び出し元（ConversationManager）が
 * CharacterDefRecord.name/furigana/relationships[].addressから、
 * その候補が呼ばれうる名前のバリエーションを解決して渡す。
 * どの名前が実際の発話に出現するかはキャラクター定義データ依存であり
 * （例: フルネームでなく`relationships[].address`のあだ名で呼び合う等）、
 * このクラス自体はCharacterDefRecordの形に依存しない（実装者判断、
 * implementation-rules.md 9章）。
 */
export interface MentionCandidate {
  characterId: string;
  names: string[];
}

/**
 * 発話生成直後に、生成済みutteranceテキストの中で話者以外の参加者が
 * 名指し（呼びかけ）されているかを検出する（Issue #15対応）。
 * SpeakerSelector（F6.2）のNAMED_BONUSが実際の呼びかけと無関係な値
 * （常に「直前の話者」）を見て動いていた問題への対応であり、追加のLLM呼び出しは
 * 行わない軽量な文字列/正規表現一致のみで実装する（案の説明どおり
 * ConversationManager.runTurnのtargetId決定自体は変更せず、
 * result.targetIds/SessionState.previousTargetIdsの精度向上のみを担う）。
 *
 * 「楽」のような1文字の名前が「楽しい」等の別の単語の一部として出現するだけの
 * ケースを誤検出しないよう、名前の直後が文末・句読点等の非文字・敬称・格助詞/係助詞の
 * いずれかで終わる場合のみ「呼びかけ」とみなす。この境界条件に合わないあだ名・
 * 独特な呼び方は検出できず、その場合は呼び出し元が既存のフォールバック
 * （直前の話者をtargetIdとする）を使う。
 */
export class AddresseeMentionDetector {
  /**
   * @param candidates 検出対象とする候補（呼び出し元が話者自身を除いて渡す想定）。
   * @returns 発話中で最後に名指しされた候補のcharacterId。見つからなければundefined。
   */
  detect(utterance: string, candidates: readonly MentionCandidate[]): string | undefined {
    if (!utterance) {
      return undefined;
    }

    let bestCharacterId: string | undefined;
    let bestIndex = -1;

    for (const candidate of candidates) {
      for (const name of candidate.names) {
        const index = this.lastMentionIndex(utterance, name);
        // 複数名が名指しされた発話では、テキスト中でより後方にある呼びかけの方が
        // 直近の呼びかけ相手として妥当と考え、最後方一致を採用する（実装者判断）。
        if (index > bestIndex) {
          bestIndex = index;
          bestCharacterId = candidate.characterId;
        }
      }
    }

    return bestCharacterId;
  }

  private lastMentionIndex(utterance: string, name: string): number {
    if (!name) {
      return -1;
    }
    const pattern = new RegExp(
      `${escapeRegExp(name)}(?:${HONORIFIC_SUFFIXES.join('|')})?(?:$|[^\\p{L}\\p{N}]|${ADDRESS_PARTICLES.join('|')})`,
      'gu',
    );

    let lastIndex = -1;
    for (const match of utterance.matchAll(pattern)) {
      if (match.index !== undefined) {
        lastIndex = match.index;
      }
    }
    return lastIndex;
  }
}
