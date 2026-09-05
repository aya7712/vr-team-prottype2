# LLMによる発話バランス判定（SpeakerBalanceAdvisor）を新設する

- 日時: 2026-09-05T00:51:17Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/16

## 対応するIssue

Issue #16「発言するキャラクターが偏っている」への対応（plan-c: LLMによる発話バランス判定）。

## 概要

`llm/`層に新規クラス`SpeakerBalanceAdvisor`を追加した。`ConversationManager.runTurn`が話者選択（`speakerSelector.selectNext`）の直前に、直近の会話履歴・参加者一覧・各キャラクターの直近発話回数を渡し、専用プロンプト（`prompts/speakerBalance/advisor.md`）で「現在の発話の偏りは内容（進行中の自分語り・二人の思い出話等）によって正当化されるか、それとも理由のないものか。理由がなければ次に話すべきキャラクターを1名提案せよ」という判定・提案を1回のLLM呼び出しで行わせる。結果（`justified`/`recommendedSpeakerId`）は`SpeakerSelector.SpeakerSelectionContext`の新しい任意フィールド`speakerBalanceAdvice`として渡され、推奨話者にはスコアのボーナスを、正当化された偏りには既存の頻度バランス補正の緩和を行う。判定結果は新規レイヤーイベント`layer:speakerBalance`としてログに記録し、`exportConversationReport.ts`のレポートでも判定理由・審査プロンプト・提案の有無を目視確認できるようにした。呼び出し失敗時は判定なし（既存挙動のまま）にフォールバックする（PR #8の`ToneReviewer`と同じ設計パターン）。

なお自己レビュー（`/code-review`）の指摘を受け、参加者が2名以下の場合は`SpeakerSelector.selectNext`が直前の話者以外の候補1名を即座に返しスコアリング自体を経由しない（＝`speakerBalanceAdvice`が結果に一切影響しえない）ため、`ConversationManager.runTurn`は参加者が3名以上の場合のみ`SpeakerBalanceAdvisor.advise()`を呼び出すようにした（無駄な追加LLM呼び出しを避けるガード）。

## 原因・期待する効果

既存の`SpeakerSelector`は発話頻度カウント（直近ウィンドウでの出現回数）等のヒューリスティックのみでスコアリングしており、「自然な会話の流れとして偏りが生じているのか、理由のない偏りなのか」という意味的な判断ができなかった。Issue #16が指摘する「自身の思い出を長く語る、二人だけの思い出を長く語る、といった偏りが自然なシチュエーションでは許容し、そうでない場合は偏らないようにする」という要件は、内容の意味理解を要するためヒューリスティックだけでは限界がある。

`SpeakerBalanceAdvisor`がLLMに1回の追加呼び出しで内容面の妥当性判断を委ね、正当化されない偏りには推奨話者へのスコアボーナスを、正当化される偏りには頻度バランス補正の緩和を行うことで、頻度カウントだけでは区別できなかった「内容的に自然な偏り」と「理由のない偏り」を分けて扱えるようにした。

## 会話ログと見解

Artifact（会話ログレポート）: https://claude.ai/code/artifact/614670a1-5d7c-4661-aee7-7b6258ac0d5c

**正直な報告**: 動作確認のE2E実行（`char_a char_b char_c char_d`、20ターン指定）を3回試みたが、いずれもTogether AI側の503エラー（`TogetherClient: リクエストが失敗しました (status=503)`）により早期に停止した（run1=3ターン、run2=1ターン、run3=1ターン、いずれも10ターン未満）。手順書に従い、最もターン数が多かったrun1（3ターン、セッションID`b3a7ad40-66c4-446c-853b-f7a04418c33b`）を成果物として採用したが、3ターン中`char_c`/`char_d`は一度も発言しておらず（`char_a`と`char_b`の交互発話のみ）、Issue本来の検証観点である「3〜4体会話での発話者の偏り」の是正効果そのものは、このログでは実質的に検証できていない。

ただし`SpeakerBalanceAdvisor`自体の動作（LLM呼び出し・判定・ログ記録）は3ターン中2回実行されており、想定通りの挙動を確認できた：
- 1ターン目: 直近の会話履歴が無い（会話開始直後）ため判定自体をスキップ（`layer:speakerBalance`は「判定材料なし」として記録）。
- 2ターン目: 「浦々宇良が楽に直接的に話しかけており、返答を求める内容であるため」と判定し`justified: false`・`recommendedSpeakerId: char_b`を提案。
- 3ターム目: 「直近の発話はAとBが交互に行われており、特定のキャラへの偏りが見られないため」と判定し`justified: true`（頻度バランス補正を緩和）。

judged出力自体はプロンプトの意図通りの形式・内容で得られており、`SpeakerBalanceAdvisor`のLLM呼び出し・JSON解析・ログ記録の配線は機能していると確認できる。一方で、3〜4体構成での実際の発話者バランス是正効果（推奨話者が実際に選ばれやすくなるか、正当化された偏りの継続が許容されるか）は、このターン数・キャラクター構成のログでは確認できておらず、追加のE2E実行（Together AI側の状態が安定した際の再実行）が望ましい。

## 変更対象ファイル

- packages/engine/src/llm/SpeakerBalanceAdvisor.ts（新規）
- packages/engine/src/llm/SpeakerBalanceAdvisor.test.ts（新規）
- packages/engine/prompts/speakerBalance/advisor.md（新規）
- packages/engine/src/llm/index.ts
- packages/engine/src/conversationManager/ConversationManager.ts
- packages/engine/src/conversationManager/ConversationManager.test.ts
- packages/engine/src/conversationManager/SpeakerSelector.ts
- packages/engine/src/conversationManager/SpeakerSelector.test.ts
- packages/engine/src/types/events.ts
- packages/server/src/db/repositories/types.ts
- packages/server/src/services/TurnOrchestrator.ts
- packages/server/src/services/TurnOrchestrator.test.ts
- packages/server/src/scripts/exportConversationReport.ts
- doc/design/class-design.md

## 自己レビュー

独立レビューの優先順のうち、a. `Agent`ツールはこの実行環境で利用不可（`ToolSearch`で確認済み、PR #8と同じ状況）だったため、b. `/code-review`スキル（medium、`--diff`相当、フォーク実行）にフォールバックした。

指摘（1件、対応済み）: `SpeakerBalanceAdvisor.advise()`が毎ターン無条件に呼ばれるが、参加者2名以下では`SpeakerSelector.selectNext`が直前の話者以外の候補1名を即座に返しスコアリングを経由しないため、判定結果が結果に一切影響しえない（無駄な追加LLM呼び出し）という指摘。→ `ConversationManager.runTurn`に参加者3名以上の場合のみ呼び出すガードを追加し、回帰防止テスト（`ConversationManager.test.ts`）を追加して対応済み。

コミットメッセージのtrailer: `Self-Review: code-review, findings=1-fixed`
