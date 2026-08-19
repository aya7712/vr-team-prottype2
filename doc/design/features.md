# AI会話エンジン 機能一覧

対象参照: `doc/ref/chatgpt_conversation.md`、`requirements.md`

各機能に対応するレイヤー（`requirements.md` 3章）を併記する。

## F1. Character Brain（キャラクター状態管理）— Layer 4

### F1.1 基本ステータス管理
- personality（性格：例 talkative / listener / comedian など）
- emotion（現在の感情）
- energy（元気度）
- curiosity（好奇心）
- currentGoal（今の目標：仲良くなる／笑わせる／相談する／自慢する／愚痴を聞いてほしい 等）
- conversationIntent（目標を実現するための直近の意図：質問する／ボケる 等）

### F1.2 状態更新パイプライン
- 各ターンの会話を受けて、以下の順で状態を更新する処理を実装する。
  ```
  会話 → 感情更新 → Goal更新 → Intent更新 → 記憶更新 → 発話生成
  ```

### F1.3 Speaking Style Modifier
- Relationship Engine（F2）から受け取る関係性情報をもとに、言葉遣い（敬語レベル・呼び方・冗談の許容度・距離感）を補正する機能。

## F2. Relationship Engine（関係性管理）— Layer 4連携

### F2.1 Relationship Graph
- キャラクター間の関係をノード（キャラクター）とエッジ（関係）で持つグラフ構造として管理する。
- エッジ属性: `type`（幼馴染／同僚／親友 等）, `trust`, `intimacy`, `respect`, `sharedMemories`
- **4体構成では最大6組（4C2）のペア関係を保持する。** キャラクター追加時にペア関係が未定義の組み合わせが生じないよう、初期化時に全ペアの関係を設定必須とする（デフォルト値「初対面」を許容）。
- グループ内のサブグループ傾向（例：4人中2人が特に仲が良い）を把握できるよう、ペア単位のintimacy値からグループ内の凝集度を算出可能にする（Speaker Selectionでの話題分岐判定に利用）。

### F2.2 Relationship Manager
- 会話相手を判定し、以下を返す機能。
  ```
  相手は誰か → 共有記憶検索 → 呼び方 → 敬語レベル → 冗談の許容度 → 距離感
  ```

### F2.3 Relationship Story（二人の歴史）
- 数値パラメータだけでなく、時系列の出来事リスト（例：幼稚園で初めて会う→犬を拾う→高校で喧嘩→仲直り）として関係性を保持する。
- 会話中に「あの時もそうだったじゃん」等、Storyを参照する発話を可能にする。

### F2.4 関係性の動的更新
- 会話の結果（喧嘩・共感・新しい共有体験の発生等）に応じて trust / intimacy 等の数値、および Relationship Story（共有記憶の追加）を更新する。

## F3. Memory（記憶管理）— Layer 4連携

### F3.1 Self Memory（自己記憶）
- キャラクター単体の恒常的な設定・記憶（例：犬好き、猫アレルギー）。

### F3.2 Shared Memory（共有記憶）
- 特定の相手との間で共有される体験の記憶。
- 属性: `title`, `participants`, `emotion`, `importance`, `keywords`
- 話題のキーワードと一致した場合に検索・想起される（Memory Retriever）。

### F3.3 記憶の時間区分
- 短期記憶（直前の会話内容）
- 中期記憶（このセッション/動画内での傾向、例：映画の話が多い）
- 長期記憶（キャラクターの恒常的特性）
- 3種を混在させず、用途別に取得するインターフェースを設ける。

### F3.4 Memory Retriever
- Dialogue Planner が決定した Dialogue Act と話題に基づき、Self Memory / Shared Memory から関連記憶を検索し、LLMへの入力として渡す機能。

## F4. Topic Analyzer / ConversationState（会話状態管理）— Layer 3

### F4.1 Topicデータモデル
- `topicId`, `parentTopic`, `depth`, `energy`, `novelty`, `emotionality`, `unresolved`, `lastMention`, `life` を保持するTopicツリー構造。

### F4.2 Topic判定（新規/継続/派生の判定）
- 新しい発話が来た際、既存Topicとの関係を3段階で判定する。
  ```
  意味的類似度（Embedding） が
    高い  → 同じTopic
    中間  → 子Topic候補
    低い  → 新Topic
  ```
- 加えて、関係性記憶（Relationship Memory）・共有記憶との関連度も判定材料に含める（Embeddingのみに依存しない）。
  - **T38（2026-08-19）で見送り**: `ConversationManager`は現在「Topic判定 → 関係性解決 → 記憶検索」の順でターンを処理しており、Topic判定には前ターンの発話を使う一手遅れ設計（`resolveTopic`）のため、今回の発話に対する記憶検索結果はTopic判定の時点でまだ存在しない。関連度を反映するにはパイプライン順序の組み替え（記憶検索を前倒しする、または前ターンの検索結果を次のTopic判定に引き継ぐ）が必要であり、プロトタイプ規模では優先度が低いと判断し、Embeddingベースの意味的類似度のみで判定する現行実装を維持する。将来的に会話の長期化・多人数化でTopic判定の精度がボトルネックになった場合に再検討する。

### F4.3 Topicパラメータ更新
- `energy`: 質問された/笑った/新情報/共感 等でプラス、同じ話の繰り返し/否定された/長く続いた等でマイナス。
- `novelty`: 新しい情報量の指標。同義反復ではdepthが増えても増加しない。
- `life`: 毎ターン減衰し、盛り上がりで回復。0になったら話題転換候補とする。
- `depth`: Topicツリーの階層から機械的に算出（`parent.depth + 1`）。単体では話題転換判定に使わない。

### F4.4 話題継続価値の算出
- depth / energy / novelty / emotionality / unresolved から「話題を継続する価値」を総合的に計算し、Conversation Managerの話題転換判断に用いる。

### F4.5 ConversationState全体パラメータ
- `topic`, `atmosphere`, `silenceRisk`, `excitement`, `elapsedTurns`, `unresolvedQuestions`, `rhythm` を保持する。

### F4.6 Rhythm（会話リズム）管理
- 直近のDialogue Act系列（例：質問→回答→質問→回答が連続）を監視し、単調なパターンが続く場合に共感・体験談などのAct選択確率を補正する。

## F5. Dialogue Planner（発話行為決定）— Layer 3

### F5.1 Dialogue Act定義
- 質問する／答える／共感する／否定する／ボケる／ツッコむ／自分の体験を話す／相手の体験を掘り下げる／話題を変える／沈黙を埋める 等の行為カタログを定義する。

### F5.2 Speech Expectation（会話期待値）
- 直前の発話が生成する「次に期待される発話行為」の確率分布（例：質問の後は 回答70%/質問返し20%/冗談10%）を算出する機能。
- 3人以上の会話では、期待値の対象が「発話全体」だけでなく「名指しされた特定キャラクター」にも及ぶため、`targetCharacterIds` を期待値の付帯情報として保持する（F6.2のSpeaker Selectionと連携）。

### F5.3 スコア計算
- 各Dialogue Actについて以下の乗算モデルでスコアを算出する。
  ```
  Score(act) = BaseWeight(act)
             × PersonalityModifier
             × RelationshipModifier
             × TopicModifier
             × EmotionModifier
             × ContextModifier(直前発話との相性)
  ```
- 各Modifierは設定ファイル（外部化）として定義し、チューニング可能にする（要件6章 チューニング性）。

### F5.4 確率的選択
- スコアをSoftmax等で確率分布に変換し、最高スコアのAct固定選択ではなく確率的にサンプリングする。

### F5.5 Dialogue Act候補生成（LLM補助、任意）
- 必要に応じて小型LLM（Gemma/Qwen等）にConversationStateを渡し、自然なDialogue Act候補を複数個（例：3個）提案させ、その中からConversation Managerが乱数付きで選択するオプション機能。

## F6. Conversation Manager（会話進行管理）— Layer 3〜2

### F6.1 話題継続/転換判定
- F4.4の話題継続価値をもとに、話題を継続するか、子Topicへ深掘りするか、新Topicへ転換するかを判定する。

### F6.2 Speaker Selection（話者選択：3人以上向け）
- 3〜4体の会話において、次の発話者を決定する機能。以下を考慮してスコア化し、確率的に選択する。
  - **名指し/呼びかけ**: 直前の発話が特定の相手に向けられていた場合、その相手を最優先候補にする（Speech Expectationの対象を「特定キャラクター」に拡張）。
  - **発話頻度バランス**: 直近N ターンで発話が少ないキャラクターの選出確率を上げ、特定の1〜2人だけが話し続ける偏りを抑制する。
  - **積極性（Personality）**: talkative等の性格は自発的な発話（話題への割り込み・話題提起）の確率を上げる。
  - **関係性**: 現在の話題が特定ペアの共有記憶に強く関連する場合、そのペア内のもう一方の選出確率を上げる。
- 発話が全員に向けた発話か、特定の1人（または複数人）に向けた発話かを区別して管理する（`targetCharacterIds`）。

### F6.3 話題の分岐・合流管理（3人以上向け）
- 4体会話でグループが会話上サブグループに分かれ、異なる話題が並行して進行する状態（Topicの分岐）をサポートする。
- 分岐中の各サブトピックにも F4 のTopicパラメータ（energy/novelty/life等）を個別に管理する。
- 一定条件（片方のサブ会話のenergy低下、発話による橋渡し等）で話題を合流（Merge）させる判定を行う。

### F6.4 発話順・テンポ管理
- 発話者の交代、間（沈黙リスク）の制御を行う。2人会話では交互発話を基本とし、3〜4人会話ではF6.2のSpeaker Selectionに委譲する。

### F6.5 会話終了判定
- シナリオ設定（動画尺・制約）と ConversationState（excitement, elapsedTurns 等）から会話の終了タイミングを判定する。

### F6.6 シナリオ入力の受付
- 上位（Story Manager / World State）からテーマ・制約・尺・参加キャラクター一覧（2〜4体）などの設定を受け取り、会話生成のパラメータとして反映する。
- セッション作成（`POST /api/sessions`）時には最初のトピック（文字列、必須）を受け取る（T35）。`ConversationManager`は1発話目のTopic分類をこの初期トピックから開始し、「(会話開始)」プレースホルダーには依存しない。UI（リアルタイム画面のセッション作成フォーム、T34）でも必須入力項目として提供し、ログ閲覧のセッション一覧（F9.4）には各セッションの初期トピックを表示する。

## F7. LLM連携（セリフ生成）— Layer 5

### F7.1 セリフ生成プロンプト構築
- 決定済みの Dialogue Act・想起された記憶・キャラクターの性格/感情/Speaking Style Modifier を入力として、「これらの状態を踏まえて自然な一言を生成せよ」という限定的な指示のプロンプトを構築する。
- LLMには話題選択・発話行為選択をさせない（設計原則を厳守）。

### F7.1a プロンプトのテキスト管理（テンプレート化）
- プロンプト本文はコードに埋め込まず、テキストファイル（例：Markdown/プレーンテキスト）としてリポジトリ内に外部管理する。
- キャラクター名・感情・Dialogue Act・想起記憶・Speaking Style等の可変情報は、プレースホルダー（例：`{{characterName}}`, `{{dialogueAct}}`）を用いたテンプレートとして分離し、実行時に埋め込む。
- プロンプトテンプレートはDialogue Act種別やシナリオ種別ごとにファイルを分割できるようにし、コード変更なしにテンプレートファイルの追加・編集のみで文面調整・A/Bテストを可能にする。
- テンプレートファイルにはバージョン管理（Git等）が適用され、変更履歴・差分レビューが可能であること。

### F7.2 モデル抽象化
- LLMプロバイダとして **Together AI** を採用する。将来的な差し替えに備え、モデルIDを設定で切り替え可能なインターフェースとする。
- 疎通確認・開発時の動作検証（プロンプトテンプレートの調整、パイプライン全体の結線確認等）には、Together AI提供モデルの中で最も安価な **`google/gemma-3n-E4B-it`** を既定モデルとして使用する。
- 本番運用や自然さのチューニングフェーズで、より高性能なモデルへの切り替えが必要になった場合も、モデルIDの変更のみで対応できるようにする（コード変更を伴わない）。

### F7.3 出力パース・検証
- LLM出力からセリフ本文のみを安全に抽出し、キャラクター設定と明らかに矛盾しないかの簡易チェックを行う。

## F8. ログ・デバッグ機能 — 横断

### F8.1 ターンログ
- 各ターンの ConversationState / CharacterState / 選択されたDialogueActとそのスコア内訳 / 想起された記憶 / 最終セリフ を構造化ログとして記録する。
- 各レイヤー（Topic Analyzer / Relationship Engine / Dialogue Planner / Memory Retriever / LLM）の入出力を、ターン内のステップ単位で記録する（F9のUIが参照するデータソースとなる）。

### F8.2 パラメータ調整支援
- 生成した会話ログに対し人手評価（自然／不自然）を付与できる仕組みを用意し、Modifier係数のチューニングに活用する（将来のML化の布石）。

### F8.3 イベントストリーム配信
- 会話エンジンの内部処理（状態更新・スコア計算・発話生成の各ステップ）をイベントとして発行し、UI（F9）へリアルタイムに配信する仕組み（例：WebSocket／Server-Sent Events）を設ける。
- エンジンの生成処理自体はUIの接続有無に依存せず動作すること（UI未接続でも会話生成は継続できる）。

## F9. モニタリング／ログUI — 横断（開発・デバッグ用）

会話エンジンの動作を可視化し、パラメータ調整や不自然な発話の原因調査を支援するUI機能。開発者・チューニング担当者向けのツールと位置付ける。

### F9.1 リアルタイム会話ビュー
- 生成中のセリフをキャラクターごとに時系列（チャット形式）でリアルタイム表示する。
- 発話ごとに、発話者・対象（`targetCharacterIds`）・選択されたDialogue Actをインラインで表示する。

### F9.2 パラメータダッシュボード
- 各キャラクターのCharacterState（emotion / energy / currentGoal / conversationIntent 等）をリアルタイムに表示する。
- ConversationState（topic / atmosphere / excitement / silenceRisk / rhythm 等）をリアルタイムに表示する。
- 現在の各Topic（depth / energy / novelty / life / unresolved）をツリー表示し、話題の推移をターン経過とともに可視化する（例：折れ線グラフ）。
- Relationship Graph（4体分の全ペア関係：trust / intimacy / respect）をグラフまたはマトリクス表示する。

### F9.3 レイヤー別計算過程ビュー
- ターンを選択すると、そのターンで各レイヤーが行った計算の内訳を段階的に表示する。
  - Topic Analyzer: 類似度判定結果、Topic継続/転換の判定根拠
  - Dialogue Planner: 各Dialogue Actの `BaseWeight × 各Modifier` のスコア内訳、Softmax変換後の確率分布、実際にサンプリングされたAct
  - Speaker Selection（3人以上）: 各候補キャラクターの選出スコアと選出結果
  - Memory Retriever: 検索クエリと想起された記憶（Self Memory / Shared Memory）
  - LLM: 実際にLLMへ送られたプロンプトと、返却された生出力
- 数値の根拠をブラックボックス化せず、「なぜこの発話行為が選ばれたか」を追跡できることを目的とする。

### F9.4 ログ閲覧
- 過去に生成したセッションのターンログ（F8.1）を一覧で閲覧できる画面を提供する。
- 特定ターンをリプレイ的に選択すると、F9.2/F9.3と同じ内容をその時点の状態として表示できる（過去ログ閲覧時もリアルタイム表示と同じUIコンポーネントを再利用する）。

### F9.5 パラメータ調整・人手評価入力（F8.2連携）
- 表示中のターン／セリフに対して「自然／不自然」の評価やコメントを入力できるUIを提供し、F8.2のパラメータ調整支援データとして保存する。

## 10. 将来拡張（本フェーズ対象外・設計上考慮のみ）

- 5人以上のさらなる大人数会話への対応
- 会話ログと評価データを用いたDialogue Act選択の統計モデル／小型MLモデルへの置き換え
- Relationship Story・Shared Memoryの自動生成（会話結果からの自動記憶抽出）
- モニタリングUIの一般ユーザー向け（非開発者向け）簡易ビューへの発展
