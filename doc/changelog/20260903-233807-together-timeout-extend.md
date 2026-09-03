# Together AIのタイムアウトを60秒から180秒に延長する

- 日時: 2026-09-03T23:38:07Z
- 対応Issue/PR: (character_defのtone_sample追加後の動作確認作業中に発見)

## 概要

`packages/engine/src/llm/TogetherClient.ts`の`TIMEOUT_MS`を`60_000`から`180_000`に変更した。あわせて`doc/design/architecture.md` 9章のタイムアウト説明を更新し、`doc/design/implementation-rules.md` 5章の秒数の重複記載を解消して`architecture.md`参照に一本化した。

## 原因・期待する効果

character_defリポジトリでキャラクターのtone_sample（口調サンプル）を追加した後、E2E会話生成スクリプト（`packages/server/src/scripts/e2eConversation.ts`）で動作確認したところ、`char_a`が使用するモデル`google/gemma-4-31B-it`（Together AI経由、reasoning出力を伴うdenseモデルで約35 tokens/秒と構造的に低速）が本番相当の長さのプロンプトで60秒タイムアウトを安定して超過し、`AbortError`で会話生成が失敗することが判明した。

原因を切り分けたところ、プロンプト自体の長さ（実測で1ターンあたり約1,248文字、1,000トークン未満）は各モデルのコンテキスト長に対して問題にならない量であり、ボトルネックは入力サイズではなく出力生成速度（モデル自体の低速さ＋Together AI側の負荷変動）だった。タイムアウトを180秒に延長したところ、複数ターンの会話生成が進行し、tone_sampleの内容（例:「恥ずかしい」カテゴリのサンプルに沿った口調）が実際の生成結果に反映されていることを確認できた。

## 変更対象ファイル
- packages/engine/src/llm/TogetherClient.ts
- doc/design/architecture.md
- doc/design/implementation-rules.md

## 自己レビュー
Self-Review: sonnet, findings=1件-対応済み（`implementation-rules.md`側のタイムアウト秒数記載が`architecture.md`の変更後と食い違っていた点を修正した）
