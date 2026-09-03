# ToneReviewerの審査基準を「他キャラとの相対比較」から「話者本人の絶対評価」に変更

- 日時: 2026-09-03T00:39:49Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/5 , https://github.com/aya7712/vr-team-prottype2/pull/8

## 概要

PR #8（`ToneReviewer`、Issue #5対応・plan-e）のレビューコメント2件に対応した。

1. `packages/engine/prompts/utterance/tone_review.md`から、直前に発言していた別キャラクターの
   口調プロフィール（`{{otherCharacterName}}`/`{{otherToneSample}}`/`{{otherFirstPerson}}`）を
   完全に削除した。`ToneReviewer.ToneReviewInput`から`previousSpeaker`フィールドを削除し、
   `ConversationManager.runTurn`側の`previousSpeakerDef`解決・受け渡しの配線も削除した。
2. 審査観点を「他キャラの口調に引っ張られていないか」という相対評価から、「話者本人の
   toneSample/firstPerson/personalityと照らして、本人の口調として正しいか」という絶対評価に
   書き換えた（`tone_review.md`本文の指示文言を変更）。

## 原因・期待する効果

レビュー指摘（PR #8、`aya7712`）:
- 「別のキャラクターの情報を入れると、その口調に引っ張られるので別のキャラクターの情報は
  いれないでください」
- 「引っ張られているかどうかをレビューするのではなく、該当キャラクターの口調として正しいかを
  確認させてください」

旧実装は「他キャラに引っ張られていないか」を確認するために他キャラの口調サンプルを審査
プロンプトに含めていたが、これがレビュー指摘の通りむしろ他キャラの口調に引っ張られる原因に
なりうる設計だった。話者本人のプロフィールのみを基準にした絶対評価に変更することで、
他キャラクターの情報が審査materialに一切混入しない設計にした。

## 変更対象ファイル

- `packages/engine/prompts/utterance/tone_review.md`
- `packages/engine/src/llm/ToneReviewer.ts`
- `packages/engine/src/llm/ToneReviewer.test.ts`
- `packages/engine/src/conversationManager/ConversationManager.ts`
- `packages/engine/src/conversationManager/ConversationManager.test.ts`
- `doc/design/class-design.md`（プロンプトテンプレート一覧・10.2章ToneReviewerの記述更新）
- `doc/todo.md`（T43エントリへの追記）

## 自己レビュー

`/code-review`スキル（medium、--diff）で自己レビューを実施。指摘は1件
（`package-lock.json`にnpm/Node環境差によるlockfileの無関係な差分が混入していた）のみで、
本修正には直接関係ない差分だったため`git checkout -- package-lock.json`で取り消して対応済み。
「他キャラクターの情報が本当に一切残っていないか」については、`tone_review.md`本文・
`ToneReviewer.ts`・`ConversationManager.ts`を確認し、`previousSpeaker`/`otherCharacterName`等の
参照が完全に削除されたことをコード上および実際のE2E会話ログレポート（審査プロンプト全文の
目視確認）の両方で確認した。
