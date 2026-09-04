# LLM自身に呼びかけ相手を構造化出力として申告させる（Issue #15 plan-b）

- 日時: 2026-09-04T01:17:10Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/15

## 概要

発話生成プロンプト（`packages/engine/prompts/utterance/base.md`）を拡張し、セリフ本文（1行目）に加えて「このセリフが参加者の誰かへの名指し・呼びかけであれば、対象者名を2行目に『対象:〇〇』の形式で明記せよ（該当者なしなら『対象:なし』）」という指示を追加した。あわせて話者以外の参加者名一覧（`{{participantNames}}`）もプロンプトに渡す。`OutputParser`に発話本文と申告された呼びかけ対象を1回のLLM出力からまとめて抽出する`parseUtteranceOutput`を追加し、`ConversationManager`がその申告内容を`TurnResult.targetIds`として採用する（申告なし・書式崩れ・参加者名と不一致の場合は既存の「直前の話者」targetIdへフォールバック）。追加のLLM呼び出しは発生しない。

## 原因・期待する効果

Issue #15は、名指しで話しかけられたキャラクターではなく別のキャラクターが返答してしまう問題を指摘している。既存実装（T29のSpeaker Selector）は`previousTargetIds`に含まれる相手にNAMED_BONUSを与えて次話者選択を補正する仕組みを持っていたが、`targetIds`自体は常に「直前の話者」に固定されており、実際の発話内容が誰に向けられているかを一切見ていなかった。正規表現による名指し検出（別案）は代名詞や婉曲的な呼びかけに弱いという限界があるため、本案ではLLM自身の自然言語理解を使い、発話生成と同じ1回の呼び出しの中で呼びかけ対象を自己申告させることにした。

実装中に、実際のcharacter_defデータ（`design/main/*.yaml`）で検証したところ、`CharacterDefRecord.name`が戸籍上のフルネーム（例:「里須野楽」）である一方、実際のセリフや`personality`/`tone_sample`ではキャラクター同士が`relationships[].address`のニックネーム（例:「楽」「奈也兄」「奈也さん」）で呼び合う設定になっており、フルネームでの完全一致だけでは「対象:」の申告がほぼ常にマッチしない（＝機能が実質的に働かない）ことが判明した。そのため、参加者名一覧・対象解決の双方を`RelationshipManager.resolve().addressTerm`（呼び方）ベースに変更し、さらにLLMが正式な呼び方を省略・敬称違いで申告するケース（例:「奈也兄」→「奈也」）に備えて、一意に絞り込める場合に限り部分一致でも解決できるようにした。

独立レビュー（`/code-review`スキル、フォーク実行）でも、(1) `participantNames`が「会話相手」と重複表示される、(2) 呼びかけ対象解決の完全一致判定が複数候補時に無条件で先頭を採用してしまう、(3) 呼びかけ対象の申告をそのまま`RelationshipUpdater`のtrust/intimacy更新ペアに使うと、dialogueAct選定の根拠になっていない相手に無関係な関係値変化を適用してしまう、(4) 呼び方解決ロジックが`RelationshipManager`と重複実装、(5) 「対象:なし」の表記ゆれ（感嘆符等）を一部吸収できない、(6) `class-design.md`のプレースホルダー一覧が未更新、の指摘を受け、いずれも対応した。特に(3)への対応として、関係性更新は従来通り「話者→直前の話者」のペアに対して行い、`targetIds`の上書きは「ログ表示・次ターンの話者選択」の範囲に限定するよう明確化した。

E2E確認では、Together AIの不安定さ（タイムアウト）により20ターンの完走には至らなかったが（後述）、生成できた範囲で「対象:」申告行が期待通り出力され、参加者名一覧・呼び方解決（ニックネーム・部分一致）が意図通りに機能していることを確認した。

## 変更対象ファイル
- packages/engine/prompts/utterance/base.md
- packages/engine/src/llm/OutputParser.ts
- packages/engine/src/llm/OutputParser.test.ts
- packages/engine/src/conversationManager/ConversationManager.ts
- packages/engine/src/conversationManager/ConversationManager.test.ts
- doc/design/class-design.md（`utterance/base.md`のプレースホルダー一覧を更新）

## E2E検証について

`char_a/char_b/char_c/char_d`の4体構成・20ターンを目標に実行したが、Together AIのタイムアウトにより3回試行してもすべて10ターン未満だった（0ターン、5ターン、0ターン）。方針に従い、最もターン数の多かった試行（5ターン、セッションID `34e725dd-280e-4c0e-9acb-9a10550397b3`）を成果物として採用した。

## 自己レビュー
Self-Review: sonnet（`/code-review`スキルのフォーク実行）, findings=6件-対応済み
