import { describe, expect, it } from 'vitest';
import { AddresseeMentionDetector } from './AddresseeMentionDetector.js';
import type { MentionCandidate } from './AddresseeMentionDetector.js';

function candidate(characterId: string, ...names: string[]): MentionCandidate {
  return { characterId, names };
}

describe('AddresseeMentionDetector', () => {
  it('Issue #15の事例: 感嘆符付きの呼びかけを名指しとして検出する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '楽'), candidate('char_c', '理久')];

    const result = detector.detect(
      'ねぇ楽！そういえばさ、今度みんなでどっか遊びに行かない？絶対楽しいじゃん！',
      candidates,
    );

    expect(result).toBe('char_b');
  });

  it('1文字の名前が別の単語の一部として出現するだけでは誤検出しない', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '楽')];

    const result = detector.detect('今日は楽しい一日だったね', candidates);

    expect(result).toBeUndefined();
  });

  it('敬称付きの呼びかけを検出する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '海斗')];

    const result = detector.detect('海斗くん、どう思う？', candidates);

    expect(result).toBe('char_b');
  });

  it('助詞（は/も）による呼びかけを検出する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '理久')];

    const result = detector.detect('理久はどう思ってるの？', candidates);

    expect(result).toBe('char_b');
  });

  it('敬称+格助詞（さんが）による第三者言及も名指しとして検出する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_d', '七崎')];

    const result = detector.detect(
      '七崎さんが釣り糸を垂らしながら寝落ちしたら、みんなで笑いそうだよね。',
      candidates,
    );

    expect(result).toBe('char_d');
  });

  it('複数名が名指しされた場合、テキスト中でより後方の呼びかけを採用する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '楽'), candidate('char_c', '理久')];

    const result = detector.detect('楽、それと理久も聞いてね', candidates);

    expect(result).toBe('char_c');
  });

  it('一人の候補が複数の呼び名（本名/あだ名）を持つ場合、いずれでも検出できる', () => {
    const detector = new AddresseeMentionDetector();
    // 実際のキャラクター定義（CharacterDefRecord.name）はフルネームだが、
    // 発話中ではrelationships[].addressのあだ名で呼ばれることが多いため、
    // 候補は複数の呼び名を持ちうる（呼び出し元ConversationManager側の責務）。
    const candidates = [candidate('char_b', '里須野楽', '楽')];

    const result = detector.detect('ねぇ楽！聞いてる？', candidates);

    expect(result).toBe('char_b');
  });

  it('ふりがな等の表記ゆれ用の呼び名でも検出できる', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '潔', 'きよし')];

    const result = detector.detect('ねぇ、きよし！聞いてる？', candidates);

    expect(result).toBe('char_b');
  });

  it('誰も名指しされていない発話ではundefinedを返す', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '楽'), candidate('char_c', '理久')];

    const result = detector.detect('今日は天気がいいね', candidates);

    expect(result).toBeUndefined();
  });

  it('候補が空配列でも例外を投げずundefinedを返す', () => {
    const detector = new AddresseeMentionDetector();

    const result = detector.detect('楽！', []);

    expect(result).toBeUndefined();
  });

  it('文末に名前だけが置かれている呼びかけも検出する', () => {
    const detector = new AddresseeMentionDetector();
    const candidates = [candidate('char_b', '楽')];

    const result = detector.detect('ねえねえ、聞いてよ、楽', candidates);

    expect(result).toBe('char_b');
  });
});
