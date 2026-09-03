# Issue #5 plan-h: 発話生成LLMと口調整形LLMを分離する2段階生成パイプライン

## 概要

発話生成を「内容決定LLM」（何を話すか）と「口調整形LLM」（どう話すか）の2段階に分離した。口調整形LLM（`ToneStylist`）には話者本人のtoneSample等と内容決定LLMの出力以外の情報（`recentDialogue`や他キャラクターのtoneSample・名前など）を一切渡さない。

## 原因・期待する効果

Issue #5の指摘は「前に発言したキャラクターの発言に引っ張られて口調がずれる」というもので、原因は単一のLLM呼び出しの中でプロンプトに含まれる`recentDialogue`（他キャラの直近発言、その口調を含む）が「何を話すか」と「どう話すか」の両方に同時に影響してしまうことだと捉えた。生成を2段階に分け、口調整形を担うLLM呼び出し（`ToneStylist`）には他キャラクターの発話・口調情報を構造的に（型として）渡せないようにすることで、口調が他キャラに引っ張られる経路自体を断つ。PR #8のレビュー指摘（別のキャラクターの情報を入れない／「引っ張られていないか」ではなく「本人の口調として正しいか」を基準にする）とも整合するよう、`tone_style.md`のプロンプトは「該当キャラクターの口調として正しいか」を尋ねる形にした。

## 実装

- `packages/engine/prompts/utterance/content_intent.md`（新規）: 内容決定LLM用テンプレート。会話の流れ・DialogueAct・関係性・話題から「話したい内容」だけを生成させる（口調は一切指示しない）。
- `packages/engine/prompts/utterance/tone_style.md`（新規）: 口調整形LLM用テンプレート。話者本人のtoneSample等と内容決定LLMの出力のみを入力に取る。
- `packages/engine/prompts/utterance/base.md`（削除）: 上記2テンプレートに置き換えられ不要になった。
- `packages/engine/src/llm/ToneStylist.ts`（新規）: 口調整形LLM呼び出しを担うクラス。入力の型（`ToneStylistInput`）自体に`recentDialogue`や話し相手の名前・呼び方すら持たせておらず、呼び出し元が誤って他キャラクターの情報を混入させることを型レベルで防ぐ。
- `packages/engine/src/conversationManager/ConversationManager.ts`: `runTurn`を「内容決定LLM呼び出し→`ToneStylist.stylize()`」の2段階呼び出しに変更。`layer:llm`イベント（`LlmLayerPayload`）に`contentStage`（内容決定側のプロンプト・出力・抽出結果）を追加。
- `packages/server/src/scripts/exportConversationReport.ts`、`packages/ui/src/views/LogBrowser/LogBrowser.tsx`、`packages/ui/src/views/LayerInspector/LayerInspector.tsx`: 両段のプロンプト・出力を分けて表示するよう対応。
- `doc/design/architecture.md`、`doc/design/class-design.md`: 上記変更に合わせてデータフロー図・プロンプトテンプレート一覧・コンストラクタ引数の説明を更新。

## 会話ログと見解

Artifact: https://claude.ai/code/artifact/1463a9fd-486f-475c-90c6-c7e654a02dd2

Together AIの不安定さにより、20ターンを狙った生成が3回とも早期に中断した（1回目4ターン、2回目0ターン、3回目0ターン、いずれも`DOMException [AbortError]`）。手順書の基準（3回とも10ターン未満の場合は最もターン数が多かったものを採用）に従い、1回目のセッション（4ターン、session `916928a6-d1fe-4614-9b64-161cbfd517d0`、db `data/plan-h-run1.sqlite`）を成果物として採用した。

生成された4ターン分のログを確認したところ、口調整形（Stage 2）に送信されたプロンプトには話者本人のtoneSample/personality/firstPersonのみが含まれ、`recentDialogue`や相手キャラクターのtoneSample・名前は一切含まれていないことを目視確認できた（設計どおり）。ただし4ターンのみでは「話者交代時に口調のブレが単一LLM呼び出し時より減る」という改善効果自体を定量的に確認するには不十分であり、その点は正直に留保する。

## 自己レビュー

独立レビューの優先順のうち、a. `Agent`ツール（`subagent_type`付きのTask的ツール）はこの実行環境に存在せず（`ToolSearch`で複数回確認済み）、b. `/code-review`スキル（フォークされた独立実行）にフォールバックした。

見つかった指摘（3件）:

1. `packages/ui/src/views/LogBrowser/LogBrowser.tsx` / `LayerInspector.tsx`: ライブUIのLLMパネルが`payload.prompt`/`rawOutput`（Stage 2）しか表示しておらず、Stage 1（内容決定）の内容が見えない。→ **対応済み**。両コンポーネントにStage 1/Stage 2を分けて表示するよう修正し、対応するテストのフィクスチャも更新した。
2. `ConversationManager.ts`: Stage 1（内容決定）がConversationManagerにインラインのままで、Stage 2（`ToneStylist`）だけ独立クラスになっている非対称な設計。→ **未対応（意図的）**。プロトタイプとして最も単純な実装を優先する方針（`implementation-rules.md` 1章）に基づき、Stage 1は元々`buildPrompt`としてConversationManagerにインラインだった既存コードをテンプレート分割に合わせてそのまま踏襲した。対称性のためだけにクラスを追加で抽出することは過剰な抽象化（`implementation-rules.md` 9.1のレビュー観点）と判断し見送った。

Self-Review: code-review, TODO=issue-5-plan-h, findings=3-2fixed-1acknowledged
