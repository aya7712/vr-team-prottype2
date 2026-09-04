# 話者本人の記憶から口調実例を抽出しプロンプトに追加する

- 日時: 2026-09-03T00:48:33Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/5

## 概要

`character_def/memory/<owner>/*.md`（話者自身が語り手の記憶）の本文から代表的な一文を数件抜粋し、
`utterance/base.md`のプロンプトに「口調の実例」として複数行追加する。従来の1行要約的な`toneSample`に
加え、実際の語尾・一人称・テンションが伝わる実例を複数提示することで、キャラクターごとの口調の
一貫性を高める。

## 原因・期待する効果

Issue #5「口調が前の発言に引っ張られる」問題について、プロンプトが渡す口調の手がかりが
`toneSample`の1文（自己紹介・リアクション程度）のみと薄く、直前の会話（他キャラクターの発話）の
分量のほうが圧倒的に多いため、LLMが直近の話者の語尾・言い回しに引きずられやすい状況にあると考えた。
話者自身の記憶から抽出した複数の実例（語尾・一人称・テンションが乗った実際の文）を追加提示し、
あわせてプロンプト末尾に「直前の会話に引きずられず自分の口調で話す」旨の明示的な指示を加えることで、
LLMが自分の口調を模倣しやすくなり、キャラクター交代時の口調の乱れが減ることを期待する。

## AI-character-defへの書き込み制約について

Issueコメントの案1原文は、抽出した口調サンプルを`character_def`リポジトリの`design/main`へ
書き込むことを求めている。しかし`data-design.md` 7章・`implementation-rules.md` 9章が明記する
「`character_def`リポジトリのファイルは本プロジェクトから変更しない」方針（`CharacterDefLoader`が
読み込み専用のfs APIのみを使う設計）と、本タスクの実行環境上の制約（`AI-character-def`への書き込み
禁止）の両方から、`character_def`側への書き込みは行わない。代わりに`ToneExemplarSelector`が
`CharacterDefLoader.loadAll()`実行時に`memoryPresets`（読み込み済み・読み取り専用のまま）を解析し、
実行時に口調実例を導出する形に読み替えて実装した。

## 変更対象ファイル

- `packages/engine/src/data/ToneExemplarSelector.ts`（新規）
- `packages/engine/src/data/CharacterDefLoader.ts`
- `packages/engine/src/data/types.ts`（`CharacterDefRecord.toneExemplars`追加）
- `packages/engine/src/data/YamlCharacterParser.ts`
- `packages/engine/src/conversationManager/ConversationManager.ts`（buildPromptでの配線）
- `packages/engine/prompts/utterance/base.md`（`{{toneExemplars}}`セクション追加）
- `packages/server/src/db/schema.sql` / `migrate.ts`（`characters_cache.tone_exemplars_json`列追加、version 3）
- `packages/server/src/db/repositories/CharacterCacheRepository.ts`
- `doc/design/class-design.md` / `doc/design/data-design.md`（ドキュメント同期）
- 上記に対応するテスト各種

## 会話ログと見解

https://claude.ai/code/artifact/1f722f53-c217-4a48-929f-944259512c75

char_a/char_b/char_c/char_dの4人・20ターンの会話ログを生成した。各ターンの`layer:llm`プロンプトに
話者本人の記憶から抽出した口調実例（3〜4件）が正しく含まれていることを確認した。生成された発話を
通読した限り、char_a（宇良、一人称「俺」「マジ」「じゃん」口調）、char_b（楽、一人称「俺」で
ぶっきらぼう）、char_c（理久、一人称「僕」で穏やか）のそれぞれの口調が話者交代を挟んでも大きく崩れず
維持されていた。ただし1回・20ターンの観察であり、変更前（旧toneSampleのみ）との定量的な比較は
行っていないため、口調の乱れの発生頻度が実際にどの程度改善したかまでは検証できていない。

## 自己レビュー

Self-Review: code-review（この実行環境では独立した`Agent`ツール呼び出しが利用できなかったため、
`/code-review`スキルによる独立フォーク実行のレビューにフォールバックした）

指摘3件、うち2件対応済み・1件は許容と判断:
1. `pickExcerpt`の`String.prototype.slice`によるUTF-16コードユニット単位の切り詰めがサロゲート
   ペアを分断しうる → `Array.from`によるコードポイント単位の切り詰めに修正（対応済み）。
2. `npm install`実行によって`package-lock.json`に本変更と無関係な差分（`libc`フィールド等、
   npmバージョン差由来）が発生 → `git checkout -- package-lock.json`で復元し差分から除外（対応済み）。
3. `CharacterDefLoader.loadAll()`がキャラクターごとに`memoryPresets`全体をフィルタ・ソートしており
   若干非効率（O(C・N log N)） → プロトタイプ規模（登場人物・記憶数とも数十件程度）では実害がないと
   判断し、`implementation-rules.md` 1章の「プロトタイプとして最も単純な実装を選ぶ」方針に従い許容。
