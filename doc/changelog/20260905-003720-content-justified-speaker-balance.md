# 会話内容（DialogueAct/Topic/Memory）に応じてSpeakerSelectorの発話頻度バランス補正を出し分ける（plan-b）

- 日時: 2026-09-05T00:37:20Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/16

## 概要

Issue #16「発言するキャラクターが偏っている」への対応案の1つ（plan-b）。`ConversationManager.runTurn`で確定した`DialogueAct`・`Topic`（深さ・未解決状態・継続スコア）・当該ターンで実際に取得された記憶（`MemoryRetriever`の結果）から、「直前ターンの発話ペアへの発話集中が内容的に正当化されるか」を表す`pairFocusJustified`シグナルをターンごとに算出し、`SessionState`に保持する。次ターンの`SpeakerSelector.selectNext`はこのシグナルを新しいコンテキストとして受け取り、正当化される場合は発話頻度バランス補正を緩め（0.4倍）、正当化されない場合はより強く効かせる（1.6倍）。`SpeakerSelector`の頻度・関係性スコアの基本パラメータ自体（plan-aの担当範囲）は変更していない。

## 原因・期待する効果

既存の`SpeakerSelector`は発話内容を一切見ず、機械的な頻度・関係性スコアのみでバランスを取っていたため、Issueが明示的に許容している「自身の思い出を長く語る」「二人だけの思い出を長く語る」といった正当な偏りと、それ以外の理由のない偏りを区別できなかった。今回の変更により、(1) `story`/`deepDive`（自分語り系Act）、(2) 話題が未解決または深掘りされ継続価値が高い、(3) 取得記憶の`participants`が話者・対象の2名に閉じている、のいずれかに該当する場合のみバランス補正を緩めるようにし、それ以外の場面（正当化する裏付けが無い雑談的な往復）ではバランス補正をより強く効かせて他の参加者に発話機会を戻すようにした。

## 変更対象ファイル
- packages/engine/src/conversationManager/ConversationManager.ts
- packages/engine/src/conversationManager/SpeakerSelector.ts
- packages/engine/src/conversationManager/types.ts
- packages/engine/src/dialoguePlanner/DialoguePlanner.ts
- packages/engine/src/topic/TopicContinuationScorer.ts
- 上記5ファイルに対応するテストファイル（`*.test.ts`）

## 会話ログと見解

4体（char_a/b/c/d）・20ターンのE2E会話ログ（Artifact: https://claude.ai/code/artifact/9d23969b-e831-48ea-97c2-9f37798de562）を生成し、DB（`turn_layer_events`）を直接突き合わせて`pairFocusJustified`の実際の値を検証した。

- ターン9〜18（char_b⇄char_c、兄弟という設定）は、ほとんどのターンで`pairFocusJustified: true`になっていた。原因は`MemoryRetriever`が取得した記憶の多くが`participants: [char_b, char_c]`に閉じた「二人だけの思い出」だったため（兄弟としての私的な記憶が多いキャラクター設定のため）で、これはIssueが明示的に許容している「二人だけの思い出を長く語る」ケースに一致する。
- 一方でターン8/12/14/18は`pairFocusJustified: false`（自分語り系Actでも二人に閉じた記憶でもない）と正しく判定されており、設計上はこの後のターンでバランス補正が強まる。
- 今回のセッションでは`TopicClassifier`が終始単一のTopic（`雑談`、depth=0、unresolved=false）にとどまり話題が分岐しなかった（既存の別課題、`doc/todo.md` T36で一部対応済みだが今回のセッションでは発現しなかった）ため、Topic由来の正当化（depth/unresolvedによる判定）は今回のログでは一度も発火しておらず、実際に効いたのはDialogueAct（story/deepDive）とMemory（二人に閉じた記憶）の2つの信号のみだった。
- 発話回数の最終分布は char_a=4, char_b=9, char_c=5, char_d=2 で、char_bが最多だった。char_bは前半（a/b/d）・後半（b/c）どちらのセグメントでも会話相手（対象）になっている構造上のハブであることが主因と考えられ、上記の通りその多くは記憶による正当化を伴っていたため、Issueが問題視している「正当な理由のない偏り」には該当しないと考える。
- `SpeakerSelector`単体・`ConversationManager`統合のユニットテストでは、`pairFocusJustified`の値によって次ターンの発話者選出確率が意図通りに変化すること（true時に直近話者が選ばれやすくなり、false時にバランス補正が強まること）を決定的に確認済み。ただし今回のE2Eは1回のサンプルであり、Together AIの生成内容（Act/Topic/Memoryの実際の組み合わせ）はランで変動するため、統計的に「Issueの問題が解消した」とまでは断定できない。特にTopic由来の正当化はまだ実地で確認できていない点は今後の課題として正直に記載する。

## 自己レビュー
Self-Review: code-review skill (medium), findings=1件-対応済み（新規コメントが引用していた`doc/todo.md T44`は同ファイルが凍結済み・`doc/changelog/`運用への移行済みだったため、本ファイルへの参照に差し替えた）
