// ===== Prompt Templates =====

const DEFAULT_TEMPLATES = {
  concept: {
    name: '01 コンセプト・世界観',
    system: `あなたはSFコンセプトデザイナーです。日本のラノベ市場に精通し、独創的かつ市場性のある世界観を設計します。`,
    user: `以下の条件でラノベの世界観コンセプトを正確に10案生成せよ。

## 基本情報
- 総字数目標：{total_chars}字
- ジャンル：{genre}
- テーマキーワード：{theme}

## よく使われる設定例（参考・差別化に使え）
異世界転生、チート能力、魔法学校、ハーレム、ギルド、勇者・魔王、VRゲーム世界、タイムループ、記憶喪失、契約精霊

## 禁止：上記の設定をそのまま使うこと

## 出力フォーマット（必ずJSON配列で返せ）
[
  {
    "catchcopy": "30字以内のキャッチコピー",
    "core_rule": "世界の核心ルールを3行",
    "protagonist_question": "主人公が直面する根本的問い（1文）",
    "differentiation": "既存作品との差別化ポイント（1文）",
    "originality_score": 独自性スコア(1-10の整数),
    "score_reason": "スコアの根拠（1文）"
  }
]

## 制約
- 設定のための設定にしない
- 「問い」は読者が自分事にできるものに限定
- スコアは客観的に評価し、8点以上は最大2案まで
- 必ずJSONのみを返し、前置き・説明は一切不要`
  },

  plot: {
    name: '02 プロット構築',
    system: `あなたはプロ脚本家です。三幕構成でプロットを設計します。感情的煽りより論理的必然性を重視します。`,
    user: `以下のコンセプトから三幕構成プロットを設計せよ。

## コンセプト決定稿
{concept}

## 基本情報
- 総字数目標：{total_chars}字
- ジャンル：{genre}
- テーマ：{theme}
- 固有名詞リスト：{nouns}

## 出力フォーマット（JSON）
{
  "act1": {
    "chars": "目安字数",
    "daily_life": "日常と欠如の描写",
    "trigger": "事件（物語の引き金）",
    "foreshadowing": "埋める伏線（最低1本）"
  },
  "act2": {
    "chars": "目安字数",
    "choice_and_cost": "主人公の選択と代償",
    "midpoint": "中間点（価値観の転換）",
    "crisis": "最大の危機"
  },
  "act3": {
    "chars": "目安字数",
    "climax_position": "クライマックスは{climax_pos}字地点",
    "climax": "クライマックスの核心（感情ではなく論理的決断として）",
    "ending": "結末と余韻"
  }
}

## 制約
- 感動を「泣ける」で表現しない
- クライマックスは総字数の70〜80%地点に配置
- 伏線は第一幕で必ず1本以上
- JSONのみ返せ`
  },

  characters: {
    name: '03 キャラクター設計',
    system: `あなたはキャラクター設計の専門家です。アンサンブルの一貫性とテーマとの連動を重視します。`,
    user: `以下の情報から登場人物を設計せよ。

## プロット
{plot}

## テーマ
{theme}

## 固有名詞リスト（既存）
{nouns}

## 出力フォーマット（JSON）
{
  "characters": [
    {
      "name": "名前",
      "age": "年齢",
      "role": "職業・役割",
      "surface_motive": "表の動機（他者への説明）",
      "deep_motive": "裏の動機（本人も認識が薄い）",
      "verbal_habit": "口癖・言動の癖（具体的に）",
      "contrast_with_protagonist": "主人公との対比構造",
      "ng_lines": ["このキャラが絶対に言わないセリフ例x2"]
    }
  ],
  "ensemble_check": "全キャラがテーマへの答えのバリエーションになっているか評価"
}

## 制約
- 「論理的な外面 × 感情的な内核」の構造を全キャラに持たせる
- 主人公・ライバル・協力者・鍵キャラの4名以上
- JSONのみ返せ`
  },

  chapters: {
    name: '04 章立て・構成',
    system: `あなたは構成編集者です。読者を飽きさせない章構成を設計します。`,
    user: `以下のプロットから章構成表を作成せよ。

## プロット
{plot}

## 総字数目標
{total_chars}字

## 固有名詞リスト
{nouns}

## 出力フォーマット（JSON配列）
[
  {
    "chapter_num": 章番号,
    "title": "章タイトル",
    "pov": "視点人物",
    "events": "主な出来事",
    "opening_hook": "冒頭の引き",
    "ending_hook": "末尾のフック",
    "hook_type": "疑問|誤解|選択",
    "target_chars": 目安字数(数値)
  }
]

## 制約
- 各章は単独で読んでも「問い」が残る構造
- 連続する2章で同じ感情トーンを使わない
- 章末フックは必ず「疑問」「誤解」「選択」のいずれかに分類
- 総字数÷1章あたり2000〜3000字で章数を計算
- JSONのみ返せ`
  },

  draft: {
    name: '05 章下書き',
    system: `あなたは日本のラノベ作家です。読者を引き込む文章を書きます。感情の直接描写を避け、描写と行動で感情を表現します。`,
    user: `以下の仕様でこの章の本文を生成せよ。

## 章仕様
{chapter_spec}

## コンセプト・テーマ
{theme}

## 固有名詞リスト
{nouns}

## これまでの章要約
{summaries}

{style_section}

## 禁止表現リスト
- 「胸が痛んだ」「心が震えた」「感情が高ぶった」等の感情直接描写
- 「〜のだった」調の冗長な締め
- 比喩の連続使用（1段落1個まで）
- キャラクターの独白での自己説明
- 「まるで〜のような〜のような」の入れ子比喩

## 出力
{target_chars}字程度。会話・描写・内省のバランスを均等に。
本文のみ出力し、末尾に自己チェックを付記：
[ ] 禁止表現なし
[ ] 末尾フック達成：{ending_hook}
[ ] 固有名詞の表記一致`
  },

  consistency: {
    name: '06 整合性チェック',
    system: `あなたは厳格な編集者です。感情的評価を一切せず、論理的矛盾のみを報告します。`,
    user: `以下の原稿を整合性チェックせよ。

## 固有名詞リスト
{nouns}

## キャラクター設計
{characters}

## 原稿（要約版）
{manuscript}

## チェック項目
1. 時系列矛盾（日時・年齢・経過時間）
2. キャラクター行動の動機一貫性
3. 世界観ルールの逸脱
4. 伏線の回収漏れ
5. 固有名詞の表記ゆれ

## 出力フォーマット（JSON）
{
  "issues": [
    {
      "type": "時系列|動機|世界観|伏線|表記",
      "location": "該当箇所の説明",
      "description": "矛盾の内容",
      "suggestion": "修正案"
    }
  ],
  "clean_items": ["問題なしの項目リスト"]
}

感想・評価・褒め言葉は一切不要。JSONのみ返せ。`
  },

  revision: {
    name: '07 文体統一・改稿',
    system: `あなたは文体統一の専門家です。指定されたスタイルガイドに厳密に従います。`,
    user: `以下の本文をスタイルガイドに従いリライトせよ。

## スタイルガイド
- 文末バリエーション：「〜た」「〜る」「〜だ」を3:2:1の比率
- 一文の最大字数：60字
- 会話文の直後に必ず1行の非言語描写
- 同一語句の1段落内重複禁止

## トーン
{tone}

## 原稿
{manuscript}

リライト後の本文のみ出力。
末尾に変更サマリーを3行以内で付記。`
  },

  polish: {
    name: '08 最終仕上げ',
    system: `あなたは校正専門家です。誤字脱字・文法・一貫性を厳密にチェックします。`,
    user: `以下の本文を校正せよ。

## 固有名詞リスト（表記の正解）
{nouns}

## 原稿
{manuscript}

## チェック（優先順位順）
1. 誤字脱字・送り仮名
2. 読点の過不足（一文に3個以上は分割）
3. 同一語句の3行以内重複
4. セリフの語尾キャラクター一貫性

冒頭に「修正N件」と記載後、修正済み本文を出力。`
  },

  visual_character: {
    name: 'VIS キャラビジュアル',
    system: `あなたは画像生成AIのプロンプトエンジニアです。`,
    user: `以下のキャラクター設定から画像生成プロンプトを作成せよ。

## キャラクター情報
{character}

## 画風スタイル
{style}

## 出力フォーマット（JSON）
{
  "positive": "英語プロンプト（詳細・高品質キーワード含む）",
  "negative": "ネガティブプロンプト",
  "sd_format": "Stable Diffusion形式",
  "nai_format": "NovelAI形式",
  "mj_format": "Midjourney /imagine prompt形式"
}

JSONのみ返せ。`
  },

  visual_scene: {
    name: 'VIS シーン挿絵',
    system: `あなたは画像生成AIのプロンプトエンジニアです。`,
    user: `以下の情報から最も盛り上がるシーンの挿絵プロンプトを作成せよ。

## プロット・クライマックス
{climax}

## 登場キャラクター
{characters}

## 画風スタイル
{style}

## 出力フォーマット（JSON）
{
  "scene_description": "シーンの説明",
  "positive": "英語プロンプト",
  "negative": "ネガティブプロンプト",
  "sd_format": "Stable Diffusion形式",
  "nai_format": "NovelAI形式",
  "mj_format": "Midjourney /imagine prompt形式"
}

JSONのみ返せ。`
  },

  summary: {
    name: '章要約（自動）',
    system: `あなたは編集者です。章の要約を正確に作成します。`,
    user: `以下の章本文を3〜5行で要約せよ。
キャラクターの行動・判断・変化のみを記述。感想・評価不要。

## 本文
{draft}

要約のみ出力（前置き不要）。`
  }
};

// Custom templates (stored in IndexedDB)
const TemplateManager = {
  _templates: null,

  async load() {
    if (this._templates) return this._templates;
    const saved = await dbGet('custom_templates');
    this._templates = saved || {};
    return this._templates;
  },

  async get(key) {
    const saved = await this.load();
    return saved[key] || DEFAULT_TEMPLATES[key] || null;
  },

  async set(key, template) {
    const saved = await this.load();
    saved[key] = template;
    await dbSet('custom_templates', saved);
  },

  async reset(key) {
    const saved = await this.load();
    delete saved[key];
    await dbSet('custom_templates', saved);
  },

  getDefault(key) {
    return DEFAULT_TEMPLATES[key] || null;
  },

  getAllKeys() {
    return Object.keys(DEFAULT_TEMPLATES);
  }
};

// Build prompt with variable substitution
function buildPrompt(template, vars) {
  let text = template;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, v || '（未設定）');
  }
  return text;
}
