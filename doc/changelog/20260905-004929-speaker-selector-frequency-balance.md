# SpeakerSelectorの発話バランス補正を強化する（頻度ペナルティの長期化・非線形化、関係性重みの補償）

- 日時: 2026-09-05T00:49:29Z
- 対応Issue/PR: https://github.com/aya7712/vr-team-prottype2/issues/16 （plan-a）

## 概要

Issue #16「発言するキャラクターが偏っている」への対応（3案のうちplan-a）。
`SpeakerSelector`の発話者選出スコアリングのうち、発話頻度バランス補正
（`FREQUENCY_WEIGHT`）を、旧実装（直近4ターンのみを見る線形補正）から、
直近12ターンを見る非線形（凸関数）補正に強化した。あわせて、同一ペアが
直近ウィンドウを支配している場合に関係性ボーナス（`RELATIONSHIP_WEIGHT`）を
減衰させる仕組みを追加した。

## 原因・期待する効果

Issueが指摘する「前半char_a+char_c、後半char_b+char_cへの偏り」は、
`RelationshipUpdater`が同じペアの会話のたびにintimacyを上げる一方、
`SpeakerSelector`の頻度バランス補正が直近4ターンしか見ない線形補正だった
ため、いったん特定ペアの会話が続き出すとintimacy上昇→関係性ボーナス増大
→さらに同じペアが選ばれやすくなる、という「richer-get-richer」の正の
フィードバックに歯止めが効きにくかったことが主因と考えた。

- 頻度バランス補正の参照ウィンドウを直近4ターン→直近12ターンに拡大
  （`RECENT_WINDOW_SIZE`。`ConversationManager`の短期履歴保持件数も同じ値に
  拡張し、実際に12ターン分の履歴がSpeakerSelectorに渡るようにした）。
- ペナルティ（満額からの減点）を発話回数の二乗に比例させ、2〜3回程度の
  短い自然な往復への減点は小さく抑えつつ、直近ウィンドウの大半を占める
  ような長時間の独占には加速度的に強く効くようにした。
- 直前の話者とcandidateのペアが直近ウィンドウをどれだけ占めているか
  （pairShare）を見て、そのペアが支配的であるほど関係性ボーナス
  （intimacy由来の加点）を減衰させ、richer-get-richerの正のフィードバック
  自体を弱めるようにした。

### 独立レビューで発見した回帰と、その対応（重要）

上記のFREQUENCY_WEIGHTを当初は据え置き（0.3）のままウィンドウだけ12に
拡大したところ、独立レビュー（後述）で、頻度ペナルティの最大振れ幅
（`FREQUENCY_WEIGHT * RECENT_WINDOW_SIZE` = 3.6）が`NAMED_BONUS`（2.0）を
上回ってしまい、「直近ウィンドウをほぼ独占している名指し候補」が
「直近0回発話の名指しされていない候補」にスコアで逆転されるケースが
存在することが判明した。これはfeatures.md F6.2が定める「名指しされた
候補は最優先」という既存の不変条件を壊す回帰だったため、
`FREQUENCY_WEIGHT`を0.3→0.15に修正し（最大振れ幅1.8 < NAMED_BONUS 2.0）、
この逆転が起きないことを計算・テストで確認した。回帰再発防止の
ユニットテストも追加した。

## 変更対象ファイル

- packages/engine/src/conversationManager/SpeakerSelector.ts
- packages/engine/src/conversationManager/SpeakerSelector.test.ts
- packages/engine/src/conversationManager/ConversationManager.ts（短期履歴の保持件数をRECENT_WINDOW_SIZEに合わせる変更）

## 実機（e2e）確認と残課題

`CHARACTER_DEF_PATH=/home/user/AI-character-def`で4体・20ターン想定のe2e
セッションを実行して確認した（Together AIの不安定さにより実際に生成
できたのは17ターン。10ターン以上のため成果物として採用）。

- FREQUENCY_WEIGHT=0.3（独立レビュー指摘前）での20ターン実行では
  発話分配がchar_a=7, char_b=7, char_c=3, char_d=3となり、全員が最低3回
  発話機会を得た。
- 上記の回帰修正後（FREQUENCY_WEIGHT=0.15）の17ターン実行では、
  char_a=9, char_b=4, char_d=4, char_c=0となり、char_cが一度も発話機会を
  得られなかった。原因を調査したところ、`ConversationManager.runTurn`の
  `targetId`（そのターンの「話しかけ相手」）は常に「直前の話者」に
  固定される設計（T29時点の実装）であるため、二人が会話を続けている間は
  次ターンの`previousTargetIds`が常にその二人のどちらかを指し続け、
  `NAMED_BONUS`（+2.0、本plan-aの変更対象外）が同じペアに繰り返し入る
  ことが分かった。本plan-aは頻度バランス・関係性重みの補正のみを対象と
  しており、`NAMED_BONUS`や話しかけ相手決定ロジック自体は対象外
  （案の方向性を維持するため変更していない）。そのため、この経路に
  起因する短期的な偏りは本変更だけでは解消しきれない場合があることを
  正直に記録しておく。ユニットテスト（300ターン規模の統計的検証、
  および実際の値を用いた計算検証）では頻度・関係性の両補正は狙い通り
  機能していることを確認済み。

## 自己レビュー

`/code-review`スキル（独立したAgentツールが本実行環境では利用不可の
ため、フォールバックとして使用）による指摘（頻度ペナルティの最大振れ幅
がNAMED_BONUSを上回り名指し優先が崩れるケースがある）は、上記の通り
FREQUENCY_WEIGHTの調整と回帰防止テストの追加で対応済み。
