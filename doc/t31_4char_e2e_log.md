# T31 4体・結合テスト

実行日時: 2026-08-13
所要時間: 569.9秒
セッションID: 224c0e82-cdd0-4ec4-a5f6-42d1f95fa6f7
参加者: char_a（浦々宇良）, char_b（里須野楽）, char_c（里須野理久）, char_d（七崎奈也）
モデル: google/gemma-3n-E4B-it
実行方法: `packages/server/src/scripts/e2eConversation.ts`（T19のスクリプトを2〜4体対応に一般化。T31で発話機会の分配・名指し・関係性推移の集計を追加）

## T31着手にあたって発見・修正した不具合

初回の4体・50ターン実行で、全6ペアのtrust/intimacyがセッション開始から終了まで
完全に初期値（0.50）のまま一切変化していないことに気づいた。調査の結果、T06で実装した
`RelationshipUpdater`（F2.4、ターン結果を受けてtrust/intimacyを更新するクラス）が
`ConversationManager.runTurn`のどこからも呼び出されておらず、T12（ConversationManager実装）
以降ずっと未配線のまま放置されていたことが判明した（2体構成のE2E確認であるT19では
関係性の推移を明示的に集計していなかったため見過ごされていた）。

`RelationshipManager`に`getGraph()`を追加し、`ConversationManager`のコンストラクタに
`RelationshipUpdater`を追加、`runTurn`内で`TurnResult`確定後に
`relationshipUpdater.applyTurnResult(relationshipManager.getGraph(), result)`を呼ぶよう
修正した。回帰防止のユニットテストも追加した（`ConversationManager.test.ts`）。

## 実行結果

```
[e2e] 完了。
- 経過時間: 569.9秒
- 参加者: char_a, char_b, char_c, char_d
- 出現したDialogue Act種別数: 10 (answer, tsukkomi, joke, question, empathy, story, deepDive, deny, fillSilence, topicShift)
- 話題転換回数（トピック切り替わり）: 49
- 記憶(memory)が1件以上取得されたターン数: 17
- 発話機会の分配: char_a=12, char_b=12, char_c=15, char_d=11
- 名指し（targetIds付き）ターン数: 50/50
- 関係性（trust/intimacy）のペアごとの推移範囲（6ペア）:
  char_a:char_b: trust 0.50〜0.58 / intimacy 0.50〜0.71
  char_b:char_c: trust 0.50〜0.61 / intimacy 0.50〜0.75
  char_b:char_d: trust 0.50〜0.53 / intimacy 0.50〜0.52
  char_a:char_d: trust 0.50〜0.54 / intimacy 0.50〜0.57
  char_c:char_d: trust 0.50〜0.54 / intimacy 0.50〜0.62
  char_a:char_c: trust 0.44〜0.53 / intimacy 0.48〜0.55
```

（注: 「名指し（targetIds付き）ターン数」は、`ConversationManager`が`targetIds`を
常に1件配列で埋めるため全ターンで自明に真になり指標として意味を持たないとレビューで
指摘され、後日「被名指し（targetIds）回数の分布」に修正した。上記ログは修正前のスクリプト
実行結果をそのまま記録している。）

## requirements.md 7.2 成功基準との照合

- **発話機会の分配**: 4体全員が11〜15回発話しており、特定の1〜2人だけが発話し続ける偏りは
  見られなかった（`SpeakerSelector`、T29）。
- **名指し・呼びかけによる話者誘導**: 50ターン全てで`targetIds`が設定されており、直前の
  発話が誰に向けられていたかが一貫して記録されていた。会話ログ上でも「宇良、お前も」
  「理久、気にしすぎだろ」のように名指しでの呼びかけが自然に生成されていることを確認した。
- **6ペア関係の破綻なし**: 全6ペアのtrust/intimacyが初期値0.50から変動し、破綻（NaN化・
  範囲外への逸脱等）なく管理されていることを確認した（修正後）。char_a:char_cペアは
  turn 26〜29の連続する`deny`（「いや、僕は本当に楽しくなかったんだよね」）を受けてtrustが
  0.44まで低下しており、`RelationshipUpdater`のDelta Rules（F2.4）が実際の会話内容と
  整合した形で反映されていることも確認できた。
- **話題の分岐・合流**: 4体構成のため`ConversationManager`は子Topic作成時に
  `TopicBranchMerger.branch()`でサブグループ（話者・対象ペア）をタグ付けしている
  （T30）。ただし合流（merge）はT30の時点で意図的に自動実行を見送っているため、今回の
  ログでは分岐のタグ付けのみが行われ、明示的な合流は発生していない（既知の制約、T30参照）。

## 既知の課題（新規ではない）

- topicIdの変化回数が49/50とほぼ毎ターン変化している。これはT19でも確認されていた既知の
  問題で、`doc/todo.md` T33で追跡中（`TopicClassifier`/`TopicContinuationScorer`の
  話題継続判定の見直し）。4体構成でも同様の傾向が見られ、UI起因でもエンジンの
  多人数対応起因でもない既存課題であることを確認した。
- 実行中にTogether AI側の一時的なエラー（`AbortError`、`503`）により2回中断した
  （T19でも記録されていた既知の外部要因）。最終的に3回目の再実行で完走した。

## 結論

4体・50ターンの会話生成は、T29（Speaker Selection）・T30（Topic分岐タグ付け）を含め
一通り機能することを確認した。RelationshipUpdater未配線という重大な不具合を本テストで
発見・修正した。話題の合流（merge）の実運用組み込みは引き続き未対応（T30の判断通り）。
