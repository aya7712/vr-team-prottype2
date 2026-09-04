# 発話テキストからの名指し検出でtargetIdsを実態に合わせる（Issue #15 plan-a）

- 日時: 2026-09-04T01:25:48Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/15

## 概要

`ConversationManager.runTurn`が発話生成後に、話者以外の参加者が発話テキスト中で名指しされたかを軽量な正規表現一致（`AddresseeMentionDetector`、追加のLLM呼び出しなし）で検出し、検出できた場合はそのキャラクターIDを`TurnResult.targetIds`/`SessionState.previousTargetIds`として採用するようにした。検出できない場合は従来通り「直前の話者」にフォールバックする。

## 原因・期待する効果

Issue #15の事例（宇良が「楽！」と名指ししたのに理久が答える）を調査したところ、`ConversationManager.runTurn`のtargetId決定（既存の86-87行目）は実際に生成された発話の中で誰の名前が呼ばれたかを一切見ておらず、常に「直前の話者」をtargetIdとして採用し、それをそのまま`SpeakerSelector`のNAMED_BONUS（名指し優先ボーナス）の入力である`previousTargetIds`へ流し込んでいた。そのため名指しと`targetIds`が無関係に動いていた。

対応として、発話生成直後に生成済みutteranceテキストに対して`AddresseeMentionDetector`で名指しを検出し、検出できた場合のみ`result.targetIds`を上書きするようにした。実装中に、`CharacterDefRecord.name`はフルネーム（例:「浦々宇良」）だが実際の発話では`relationships[].address`のあだ名（例:「宇良」「理久兄」）で呼び合っており、`name`単体では発話中の名指しをほぼ検出できないことを実データ（`AI-character-def`）で確認したため、検出対象の名前バリエーションに`relationships[].address`も含めた。また「楽」のような1文字の名前が「楽しい」等の別の単語の一部として出現するだけの誤検出を避けるため、名前の直後が文末・句読点・敬称・格助詞/係助詞のいずれかで終わる場合のみ「名指し」と判定する境界条件を設けた。

これにより、名指し発話の直後のターンで、名指しされたキャラクターが`SpeakerSelector`のNAMED_BONUSにより高確率で選出されるようになる（後述の会話ログの9→10ターン目で実際に確認）。

## 変更対象ファイル
- packages/engine/src/conversationManager/AddresseeMentionDetector.ts（新規）
- packages/engine/src/conversationManager/AddresseeMentionDetector.test.ts（新規）
- packages/engine/src/conversationManager/ConversationManager.ts
- packages/engine/src/conversationManager/ConversationManager.test.ts
- packages/engine/src/conversationManager/index.ts

## 会話ログと見解

Artifact: https://claude.ai/code/artifact/9bea6748-1000-4b9c-96c3-c98690ceefae
（char_a/char_b/char_c/char_d、20ターン、session e803daf7-3adc-4345-bc43-0d1970faafc5）

9ターン目でchar_a（宇良）が「ありがと、楽！...奈也兄の行きつけのダーツバーで...」と発話し、直前の話者への返礼（楽=char_b）から始まりつつ文中で第三者（奈也兄=char_d）へ話題を移した。発話生成前の想定相手（直前の話者＝char_b）ではなく、実際に名指しされたchar_dが`result.targetIds`として採用され、10ターン目でchar_d（奈也）がNAMED_BONUSの効果で実際に応答した。これはIssue本文の「名指しされた相手ではなく別のキャラクターが答える」問題の裏返しのケース（名指しされた相手が正しく選ばれる）であり、期待した効果が確認できた。

## 自己レビュー

独立レビューは`/code-review`スキル（`Agent`ツール/`subagent_type`は本環境に存在しなかったためb.にフォールバック）で実施。

Self-Review: code-review, findings=2件-1件対応・1件は指摘のみで未対応

- 対応: `RelationshipUpdater.applyTurnResult`が`result.targetIds`をそのまま参照するため、名指し検出結果（会話上の実際の相手とは別の第三者を指しうる）で上書きした`targetIds`を渡すと、trust/intimacy・Relationship Storyの更新が誤った相手に帰属する回帰があった。`RelationshipUpdater`には元のtargetId（会話上の実際の相手）のみを渡すよう修正し、回帰防止テストを追加した。
- 未対応: `buildMentionCandidates`が全キャラクターの`relationships`を毎ターン再計算しており、キャッシュすればO(N*M)を避けられるという指摘。参加者数・関係性データ数がいずれも小規模（最大4体、関係性は1人あたり数件）なプロトタイプ規模では無視できるコストであり、`architecture.md`/`implementation-rules.md`の「プロトタイプとして最も単純な実装を選ぶ」方針を優先し、対応を見送った。
