# AddresseeSelectorを新設し発話生成前に呼びかけ相手を能動的に決定する

- 日時: 2026-09-04T00:54:37Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/15

## 概要

`ConversationManager.runTurn`のtargetId決定を、直前話者を機械的に採用する方式から、新設の
`AddresseeSelector`が関係性（intimacy）・直近の被名指し頻度バランス・直前の名指しへの往復を
考慮して呼びかけ相手（または「全員向け」）を能動的に決定する方式に置き換えた。決定した相手を
プロンプトの`targetName`に反映し、DialogueActが相手個人に向いた行為の場合は名前を呼びかけてから
話すよう誘導する指示（`{{addressingInstruction}}`）を追加した。

## 原因・期待する効果

Issue #15が指摘する問題の原因は、`ConversationManager.runTurn`のtargetId決定（旧実装）が
3人以上の会話でも常に「直前の話者」または参加者の先頭を機械的に選ぶだけで、話者が参加者の中から
能動的に呼びかけ相手を選ぶロジック自体が存在しなかったことにある。そのため`SpeakerSelector`の
`NAMED_BONUS`が参照する`previousTargetIds`が実際の呼びかけ内容と無関係な値になり、名指しされた
はずのキャラクターとは別のキャラクターが応答する現象が起きていた。

本変更では`AddresseeSelector`（`SpeakerSelector`と対になるコンポーネント）を新設し、
`runTurn`冒頭で発話生成前にaddressee（1名、または3人以上の会話では一定確率で「全員向け」）を
決定する。生成後の`TurnResult.targetIds`はこの決定をそのまま採用し、発話テキストの事後解析は
行わない。これにより`previousTargetIds`が常に意味のある値を持つようになり、次ターンの
`SpeakerSelector.NAMED_BONUS`が意図した相手を選びやすくなる。また一定確率（30%、3人以上の
場合のみ）で「全員向け」を残すことで、毎ターン名指しし続ける不自然さを避けている。

実行した4人・20ターンのE2Eログでは、AddresseeSelectorが「特定1名」を選んだ15ターンのうち
14ターン（93%）で、次のターンに実際にその名指しされたキャラクターが話しており、Issueが
指摘した現象が大きく改善していることを確認できた。

## 変更対象ファイル

- packages/engine/src/conversationManager/AddresseeSelector.ts（新規）
- packages/engine/src/conversationManager/AddresseeSelector.test.ts（新規）
- packages/engine/src/conversationManager/ConversationManager.ts
- packages/engine/src/conversationManager/types.ts（`RecentUtterance.targetIds`追加）
- packages/engine/src/conversationManager/index.ts
- packages/engine/prompts/utterance/base.md
- packages/server/src/services/TurnOrchestrator.ts
- packages/server/src/scripts/e2eConversation.ts（自己レビュー対応、表示・コメントの整合修正）

## 自己レビュー

code-reviewスキル（独立フォーク実行。Agent toolが本環境で利用できなかったためのフォールバック）
で5件の指摘を受け、4件に対応した:

1. `isEveryone===true`のターンで、プロンプトの「会話相手」欄が代表targetId1名の名前・呼び方を
   表示し続け、「特定の名前を呼びかけなくてよい」という`addressingInstruction`と矛盾していた
   → `isEveryone`時は「その場にいる参加者全員」とだけ表示するよう修正。
2. 直前ターンで自分（話者）が名指しされていた場合に、その名指ししてきた相手へ返答が返りやすく
   なるバイアスが無く、名指しの往復が保証されていなかった → `RECIPROCITY_BONUS`を追加。
3. `NAME_CALLOUT_ACTS`に`answer`（質問への回答）が含まれておらず、最も名指しされるべき行為が
   対象外だった → `answer`を追加。
4. `e2eConversation.ts`のコメント・ログ表示が「targetIdsは常に1件配列」という旧前提のまま
   だった → コメントを更新し、「全員向け」ターンを`(全員)`と表示するよう修正。

残り1件（`AddresseeSelector.sample()`が`SpeakerSelector.sample()`/`SoftmaxSelector`と同型の
softmaxサンプリングロジックの3つ目のコピーになっている重複）は対応しなかった。
`conversationManager`と`dialoguePlanner`は別ドメインであり、`implementation-rules.md` 4章の
「他ドメインのフォルダを直接importしない」制約下で共通化するには新規共有モジュールの置き場所・
命名の設計判断が必要になる規模の変更であり、並行して進む他のtargetId関連PR（plan-a/b）との
コンフリクトリスクを避けるため、本PRのスコープでは対応しないこととした。
