import { useState, useEffect, useRef, useCallback } from "react";

// ─── IndexedDB helpers ───────────────────────────────────────────────────────
const DB_NAME = "lightnovel_studio";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveProject(project) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadAllProjects() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readonly");
    const req = tx.objectStore("projects").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteProject(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Claude API ──────────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userPrompt, onChunk, apiKey, maxTokens = 1000) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      try {
        const json = JSON.parse(line.slice(6));
        if (json.type === "content_block_delta" && json.delta?.text) {
          fullText += json.delta.text;
          onChunk(fullText);
        }
      } catch {}
    }
  }
  return fullText;
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
const PROMPTS = {
  bible: (title, genre, theme) => ({
    system: `あなたはライトノベルの設定デザイナーです。指示に従い、世界観・魔法/技術体系・社会構造・用語集を含む設定bibleを日本語で作成してください。`,
    user: `タイトル：${title}\nジャンル：${genre}\nテーマ：${theme}\n\n上記に基づいて詳細な設定bibleを作成してください。`,
  }),
  char: (bible, charDesc) => ({
    system: `あなたはキャラクターデザイナーです。設定bibleを参照し、キャラクタープロフィール（名前・年齢・外見・性格・口調・動機・弱点・関係図）を日本語で作成してください。`,
    user: `【設定bible】\n${bible}\n\n【キャラクター概要】\n${charDesc}`,
  }),
  plot: (bible, chars, plotHint) => ({
    system: `あなたはプロットライターです。設定bibleとキャラクター情報をもとに、三幕構成で章ごとのあらすじを日本語で作成してください。`,
    user: `【設定bible】\n${bible}\n\n【キャラクター】\n${chars}\n\n【プロット方針】\n${plotHint}`,
  }),
  draft: (bible, chars, chapterSynopsis, style) => ({
    system: `あなたはライトノベル作家です。設定・キャラ・あらすじをもとに、テンポの良いラノベ文体（地の文と台詞のバランス）で本文を日本語で執筆してください。`,
    user: `【設定bible】\n${bible}\n\n【キャラクター】\n${chars}\n\n【この章のあらすじ】\n${chapterSynopsis}\n\n【文体指定】\n${style || "標準的なラノベ文体"}`,
  }),
  check: (bible, chars, text) => ({
    system: `あなたは編集者です。本文の一貫性（キャラの口調ブレ・設定矛盾・時系列の誤り・表記揺れ）を検出し、問題点と修正提案を日本語でリスト形式で報告してください。`,
    user: `【設定bible】\n${bible}\n\n【キャラクター】\n${chars}\n\n【本文】\n${text}`,
  }),
};

// ─── 文字数カウント（日本語・英数字対応）────────────────────────────────────────
function countChars(text) {
  return text ? text.replace(/\s/g, "").length : 0;
}

// ─── 差分計算（Myers差分アルゴリズム簡易版）────────────────────────────────────
function computeDiff(oldText, newText) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result = [];
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) { result.push({ type: "add", text: newLines[ni++] }); }
    else if (ni >= newLines.length) { result.push({ type: "del", text: oldLines[oi++] }); }
    else if (oldLines[oi] === newLines[ni]) { result.push({ type: "same", text: oldLines[oi++] }); ni++; }
    else {
      // 簡易: 前方一致を探す
      const nextNI = newLines.indexOf(oldLines[oi], ni);
      const nextOI = oldLines.indexOf(newLines[ni], oi);
      if (nextNI !== -1 && (nextOI === -1 || nextNI - ni <= nextOI - oi)) {
        result.push({ type: "add", text: newLines[ni++] });
      } else {
        result.push({ type: "del", text: oldLines[oi++] });
      }
    }
  }
  return result;
}

// ─── Initial project template ─────────────────────────────────────────────────
const newProject = () => ({
  id: Date.now().toString(),
  title: "新規作品",
  genre: "",
  theme: "",
  bible: "",
  characters: "",
  plot: "",
  chapters: [{ id: "ch1", title: "第1章", synopsis: "", draft: "" }],
  style: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ─── Icons (SVG inline) ───────────────────────────────────────────────────────
const Icon = ({ name, size = 16 }) => {
  const paths = {
    book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
    plus: "M12 5v14M5 12h14",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
    spark: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
    chevron: "M9 18l6-6-6-6",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    eyeoff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    diff: "M12 3v14M5 10l7 7 7-7M3 20h18",
    summary: "M4 6h16M4 10h10M4 14h12M4 18h8",
    template: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    undo: "M3 7v6h6M3.5 13A9 9 0 1 0 5.5 5.5",
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
    split: "M21 6H3M21 12h-8M21 18H3M13 12l4-4-4-4",
    grip: "M9 5h2M9 12h2M9 19h2M13 5h2M13 12h2M13 19h2",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
};

// ─── GenerateButton ───────────────────────────────────────────────────────────
function GenerateButton({ label, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 14px", borderRadius: 6, border: "none", cursor: loading || disabled ? "not-allowed" : "pointer",
        background: loading ? "#2a2a3a" : "linear-gradient(135deg, #7c3aed, #4f46e5)",
        color: "#fff", fontSize: 13, fontWeight: 600, opacity: loading || disabled ? 0.6 : 1,
        transition: "all 0.2s",
      }}
    >
      <Icon name="spark" size={14} />
      {loading ? "生成中…" : label}
    </button>
  );
}

// ─── TextArea with generate ───────────────────────────────────────────────────
function AITextArea({ label, value, onChange, onGenerate, loading, disabled, rows = 8, placeholder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</label>
        {onGenerate && <GenerateButton label="AIで生成" onClick={onGenerate} loading={loading} disabled={disabled} />}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a3a",
          background: "#0f0f1a", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7,
          fontFamily: "'Noto Serif JP', serif", resize: "vertical", boxSizing: "border-box",
          outline: "none", transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
        onBlur={(e) => (e.target.style.borderColor = "#2a2a3a")}
      />
    </div>
  );
}

// ─── WordCounter ──────────────────────────────────────────────────────────────
function WordCounter({ text, targetChars }) {
  const count = countChars(text);
  const pct = targetChars ? Math.min((count / targetChars) * 100, 100) : 0;
  const color = pct > 95 ? "#f87171" : pct > 70 ? "#fbbf24" : "#34d399";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 80, height: 4, borderRadius: 2, background: "#1a1a2e", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: "#3a3a6a", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color }}>{count.toLocaleString()}</span>
        {targetChars ? <span> / {targetChars.toLocaleString()}字</span> : "字"}
      </span>
    </div>
  );
}

// ─── DiffViewer ───────────────────────────────────────────────────────────────
function DiffViewer({ oldText, newText, onAccept, onClose }) {
  const diff = computeDiff(oldText, newText);
  const adds = diff.filter(d => d.type === "add").length;
  const dels = diff.filter(d => d.type === "del").length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 900, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0a0a16", borderBottom: "1px solid #1a1a2e", padding: "12px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: 15 }}>差分表示</span>
        <span style={{ fontSize: 12, color: "#34d399" }}>+{adds}行</span>
        <span style={{ fontSize: 12, color: "#f87171" }}>-{dels}行</span>
        <div style={{ flex: 1 }} />
        <button onClick={onAccept} style={{ padding: "7px 16px", borderRadius: 6, border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          AI生成版を採用
        </button>
        <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}>
          元に戻す
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20, fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }}>
        {diff.map((d, i) => (
          <div key={i} style={{
            padding: "1px 12px", borderRadius: 3,
            background: d.type === "add" ? "rgba(52,211,153,0.08)" : d.type === "del" ? "rgba(248,113,113,0.08)" : "transparent",
            borderLeft: `3px solid ${d.type === "add" ? "#34d399" : d.type === "del" ? "#f87171" : "transparent"}`,
            color: d.type === "add" ? "#34d399" : d.type === "del" ? "#f87171" : "#64748b",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {d.type === "add" ? "+ " : d.type === "del" ? "- " : "  "}{d.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TemplateModal ────────────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = {
  bible: `あなたはライトノベルの設定デザイナーです。指示に従い、世界観・魔法/技術体系・社会構造・用語集を含む設定bibleを日本語で作成してください。`,
  char: `あなたはキャラクターデザイナーです。設定bibleを参照し、キャラクタープロフィール（名前・年齢・外見・性格・口調・動機・弱点・関係図）を日本語で作成してください。`,
  plot: `あなたはプロットライターです。設定bibleとキャラクター情報をもとに、三幕構成で章ごとのあらすじを日本語で作成してください。`,
  draft: `あなたはライトノベル作家です。設定・キャラ・あらすじをもとに、テンポの良いラノベ文体（地の文と台詞のバランス）で本文を日本語で執筆してください。`,
  check: `あなたは編集者です。本文の一貫性（キャラの口調ブレ・設定矛盾・時系列の誤り・表記揺れ）を検出し、問題点と修正提案を日本語でリスト形式で報告してください。`,
};

const TEMPLATE_LABELS = { bible: "設定Bible", char: "キャラクター", plot: "プロット", draft: "本文", check: "一貫性チェック" };

function TemplateModal({ onClose }) {
  const load = () => {
    try { return JSON.parse(localStorage.getItem("ln_templates") || "{}"); } catch { return {}; }
  };
  const [templates, setTemplates] = useState(() => ({ ...DEFAULT_TEMPLATES, ...load() }));
  const [active, setActive] = useState("bible");

  const save = (key, val) => {
    const next = { ...templates, [key]: val };
    setTemplates(next);
    localStorage.setItem("ln_templates", JSON.stringify(next));
  };
  const reset = (key) => save(key, DEFAULT_TEMPLATES[key]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f1e", border: "1px solid #2a2a4a", borderRadius: 14, padding: 28, width: 640, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 0 40px rgba(124,58,237,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="template" size={17} />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>プロンプトテンプレート編集</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.keys(TEMPLATE_LABELS).map(k => (
            <button key={k} onClick={() => setActive(k)} style={{ padding: "5px 12px", borderRadius: 16, border: "1px solid", borderColor: active === k ? "#7c3aed" : "#2a2a4a", background: active === k ? "#1e1b4b" : "transparent", color: active === k ? "#a78bfa" : "#4a4a7a", fontSize: 12, fontWeight: active === k ? 700 : 400, cursor: "pointer" }}>
              {TEMPLATE_LABELS[k]}
            </button>
          ))}
        </div>
        <textarea value={templates[active]} onChange={e => save(active, e.target.value)} rows={10}
          style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a4a", background: "#080810", color: "#e2e8f0", fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "monospace" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => reset(active)} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", fontSize: 12, cursor: "pointer" }}>デフォルトに戻す</button>
          <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ─── テンプレート読み込みヘルパー ─────────────────────────────────────────────
function getTemplate(key) {
  try {
    const saved = JSON.parse(localStorage.getItem("ln_templates") || "{}");
    return saved[key] || DEFAULT_TEMPLATES[key];
  } catch { return DEFAULT_TEMPLATES[key]; }
}

// ─── ExportModal ──────────────────────────────────────────────────────────────
function ExportModal({ project, onClose }) {
  const [fmt, setFmt] = useState("md");

  const buildMD = () => {
    const lines = [`# ${project.title}`, ""];
    if (project.genre) lines.push(`**ジャンル:** ${project.genre}  `);
    if (project.theme) lines.push(`**テーマ:** ${project.theme}`, "");
    if (project.bible) lines.push("## 設定Bible", "", project.bible, "");
    if (project.characters) lines.push("## キャラクター", "", project.characters, "");
    if (project.plot) lines.push("## プロット", "", project.plot, "");
    project.chapters.forEach(ch => {
      if (ch.draft) { lines.push(`## ${ch.title}`, "", ch.draft, ""); }
    });
    return lines.join("\n");
  };

  const buildTXT = () => {
    const lines = [project.title, "=".repeat(project.title.length), ""];
    project.chapters.forEach(ch => {
      if (ch.draft) { lines.push(`【${ch.title}】`, "", ch.draft, ""); }
    });
    return lines.join("\n");
  };

  const content = fmt === "md" ? buildMD() : buildTXT();
  const totalChars = countChars(project.chapters.map(c => c.draft).join(""));

  const download = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.title}.${fmt === "md" ? "md" : "txt"}`;
    a.click();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f1e", border: "1px solid #2a2a4a", borderRadius: 14, padding: 28, width: 600, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 0 40px rgba(124,58,237,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="download" size={17} />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>エクスポート</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#3a3a6a" }}>本文合計 <span style={{ color: "#a78bfa" }}>{totalChars.toLocaleString()}字</span></span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[["md", "Markdown"], ["txt", "テキスト"]].map(([v, l]) => (
            <button key={v} onClick={() => setFmt(v)} style={{ padding: "6px 16px", borderRadius: 16, border: "1px solid", borderColor: fmt === v ? "#7c3aed" : "#2a2a4a", background: fmt === v ? "#1e1b4b" : "transparent", color: fmt === v ? "#a78bfa" : "#4a4a7a", fontSize: 13, cursor: "pointer", fontWeight: fmt === v ? 700 : 400 }}>
              {l}
            </button>
          ))}
        </div>
        <pre style={{ flex: 1, overflow: "auto", padding: 14, borderRadius: 8, border: "1px solid #1a1a2e", background: "#080810", color: "#94a3b8", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 360 }}>
          {content.slice(0, 2000)}{content.length > 2000 ? "\n…（省略）" : ""}
        </pre>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}>キャンセル</button>
          <button onClick={download} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="download" size={13} /> ダウンロード
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ImportModal ──────────────────────────────────────────────────────────────
function ImportModal({ onImport, onClose }) {
  const [error, setError] = useState("");
  const fileRef = useRef();

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        let project;
        if (file.name.endsWith(".json")) {
          project = JSON.parse(text);
          if (!project.id || !project.title) throw new Error("不正なJSONフォーマット");
        } else {
          // Markdown → 簡易インポート（タイトル・本文のみ）
          const lines = text.split("\n");
          const title = (lines.find(l => l.startsWith("# ")) || "# 無題").replace(/^# /, "");
          const draft = text;
          project = { ...newProject(), title, chapters: [{ id: "ch1", title: "第1章", synopsis: "", draft, summary: "" }] };
        }
        // 新IDを付与して重複回避
        project = { ...project, id: Date.now().toString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        onImport(project);
      } catch (e) {
        setError(`読み込みエラー: ${e.message}`);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f1e", border: "1px solid #2a2a4a", borderRadius: 14, padding: 28, width: 440, maxWidth: "95vw", display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 0 40px rgba(124,58,237,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="upload" size={17} />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>インポート</span>
        </div>
        <div style={{ fontSize: 13, color: "#4a4a7a", lineHeight: 1.7 }}>
          対応形式：<span style={{ color: "#a78bfa" }}>JSON</span>（バックアップ完全復元）・<span style={{ color: "#a78bfa" }}>Markdown</span>（本文のみ）
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          style={{ padding: "32px 20px", borderRadius: 10, border: "2px dashed #2a2a4a", textAlign: "center", cursor: "pointer", color: "#4a4a7a", fontSize: 14, transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.color = "#a78bfa"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a4a"; e.currentTarget.style.color = "#4a4a7a"; }}
        >
          <Icon name="upload" size={24} />
          <div style={{ marginTop: 10 }}>クリックしてファイルを選択</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>.json / .md</div>
        </div>
        <input ref={fileRef} type="file" accept=".json,.md" style={{ display: "none" }} onChange={handleFile} />
        {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

// ─── useUndo ─────────────────────────────────────────────────────────────────
// フィールドごとに最大20世代のUndo履歴を管理
function useUndo(initial) {
  const [state, setState] = useState(initial);
  const history = useRef([initial]);
  const cursor = useRef(0);

  const set = useCallback((next) => {
    // カーソル以降を切り捨てて新スナップショットを追加
    history.current = history.current.slice(0, cursor.current + 1);
    history.current.push(next);
    if (history.current.length > 20) history.current.shift();
    cursor.current = history.current.length - 1;
    setState(next);
  }, []);

  const undo = useCallback(() => {
    if (cursor.current <= 0) return;
    cursor.current--;
    setState(history.current[cursor.current]);
  }, []);

  const redo = useCallback(() => {
    if (cursor.current >= history.current.length - 1) return;
    cursor.current++;
    setState(history.current[cursor.current]);
  }, []);

  const canUndo = cursor.current > 0;
  const canRedo = cursor.current < history.current.length - 1;

  return { state, set, undo, redo, canUndo, canRedo };
}

// ─── PlotSplitModal ───────────────────────────────────────────────────────────
// プロット本文をAIが章ごとに分割してChaptersに自動セット
function PlotSplitModal({ plot, chapters, onApply, onClose, apiKey, maxTokens }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // [{title, synopsis}]
  const [error, setError] = useState("");

  const run = async () => {
    if (!apiKey) { setError("APIキーを設定してください"); return; }
    if (!plot) { setError("プロットを入力してください"); return; }
    setLoading(true); setError("");
    try {
      const sys = `あなたは編集者です。与えられたプロットを章ごとに分割し、必ずJSON配列のみを返してください。形式: [{"title":"第1章 〇〇","synopsis":"あらすじ"},...] 余分なテキスト・Markdownコードブロックは不要。`;
      const user = `以下のプロットを章ごとに分割してJSON配列で返してください:\n\n${plot}`;
      let raw = "";
      await callClaude(sys, user, (t) => { raw = t; }, apiKey, Math.min(maxTokens, 2000));
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) throw new Error("配列形式ではありません");
      setPreview(parsed);
    } catch (e) { setError(`解析エラー: ${e.message}`); }
    finally { setLoading(false); }
  };

  const apply = () => {
    const next = preview.map((item, i) => ({
      id: `ch${Date.now()}_${i}`,
      title: item.title || `第${i + 1}章`,
      synopsis: item.synopsis || "",
      draft: "",
      summary: "",
    }));
    onApply(next);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f1e", border: "1px solid #2a2a4a", borderRadius: 14, padding: 28, width: 560, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 0 40px rgba(124,58,237,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="split" size={17} />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>プロット→章あらすじ 自動分割</span>
        </div>
        <div style={{ fontSize: 13, color: "#4a4a7a" }}>
          プロットをAIが解析し、章タイトルとあらすじに分割します。既存の章構成は上書きされます。
        </div>
        {!preview ? (
          <button onClick={run} disabled={loading} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: loading ? "#2a2a3a" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
            {loading ? "分割中…" : "AIで分割実行"}
          </button>
        ) : (
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8, maxHeight: 380 }}>
            {preview.map((ch, i) => (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2a4a", background: "#080814" }}>
                <div style={{ fontWeight: 700, color: "#a78bfa", fontSize: 13, marginBottom: 4 }}>{ch.title}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{ch.synopsis}</div>
              </div>
            ))}
          </div>
        )}
        {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", fontSize: 13, cursor: "pointer" }}>キャンセル</button>
          {preview && (
            <button onClick={apply} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              この章構成を適用
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


  { id: "bible", label: "設定Bible", icon: "book" },
  { id: "char", label: "キャラクター", icon: "user" },
  { id: "plot", label: "プロット", icon: "list" },
  { id: "draft", label: "本文", icon: "edit" },
  { id: "check", label: "一貫性チェック", icon: "check" },
];

// ─── Chapter Manager ──────────────────────────────────────────────────────────
function ChapterManager({ chapters, onUpdate, targetChars, apiKey, maxTokens, bible, characters }) {
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [diffData, setDiffData] = useState(null);
  const ch = chapters[selected] || chapters[0];

  const addChapter = () => {
    const n = [...chapters, { id: `ch${Date.now()}`, title: `第${chapters.length + 1}章`, synopsis: "", draft: "", summary: "" }];
    onUpdate(n);
    setSelected(n.length - 1);
  };

  const updateCh = (field, val) => {
    onUpdate(chapters.map((c, i) => i === selected ? { ...c, [field]: val } : c));
  };

  const generateDraft = async () => {
    if (!apiKey) { alert("APIキーを設定してください"); return; }
    if (!ch.synopsis) { alert("あらすじを入力してください"); return; }
    setLoading(true);
    try {
      const sys = getTemplate("draft");
      const prevSummaries = chapters.slice(0, selected).map((c, i) => c.summary ? `第${i+1}章要約: ${c.summary}` : "").filter(Boolean).join("\n");
      const user = `【設定bible】\n${bible}\n\n【キャラクター】\n${characters}${prevSummaries ? `\n\n【前章までの要約】\n${prevSummaries}` : ""}\n\n【この章のあらすじ】\n${ch.synopsis}`;
      let generated = "";
      await callClaude(sys, user, (text) => { generated = text; }, apiKey, maxTokens);
      if (ch.draft) {
        setDiffData({ oldText: ch.draft, newText: generated, chId: ch.id });
      } else {
        onUpdate(chapters.map((c, i) => i === selected ? { ...c, draft: generated } : c));
      }
    } catch (e) { alert(`生成エラー: ${e.message}`); }
    finally { setLoading(false); }
  };

  const generateSummary = async () => {
    if (!apiKey) { alert("APIキーを設定してください"); return; }
    if (!ch.draft) { alert("本文を入力してください"); return; }
    setLoading(true);
    try {
      const sys = "あなたは編集者です。本文を200字以内で要約してください。次章生成時のコンテキストとして使用します。";
      let summary = "";
      await callClaude(sys, ch.draft, (t) => { summary = t; }, apiKey, Math.ceil(200 * 1.5 * 1.3));
      onUpdate(chapters.map((c, i) => i === selected ? { ...c, summary } : c));
    } catch (e) { alert(`生成エラー: ${e.message}`); }
    finally { setLoading(false); }
  };

  return (
    <>
      {diffData && (
        <DiffViewer
          oldText={diffData.oldText} newText={diffData.newText}
          onAccept={() => { onUpdate(chapters.map(c => c.id === diffData.chId ? { ...c, draft: diffData.newText } : c)); setDiffData(null); }}
          onClose={() => setDiffData(null)}
        />
      )}
      <div style={{ display: "flex", gap: 16, height: "100%" }}>
        <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {chapters.map((c, i) => (
            <button key={c.id} onClick={() => setSelected(i)}
              style={{ padding: "8px 10px", borderRadius: 6, border: "none", cursor: "pointer", textAlign: "left", background: i === selected ? "#1e1b4b" : "transparent", color: i === selected ? "#a78bfa" : "#64748b", fontSize: 13, fontWeight: i === selected ? 700 : 400, transition: "all 0.15s", position: "relative" }}>
              {c.title}
              {c.draft && <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 5, height: 5, borderRadius: "50%", background: "#34d399" }} />}
            </button>
          ))}
          <button onClick={addChapter} style={{ padding: "8px 10px", borderRadius: 6, border: "1px dashed #2a2a3a", background: "transparent", color: "#4a4a6a", cursor: "pointer", fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={12} /> 章を追加
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "auto" }}>
          <input value={ch.title} onChange={(e) => updateCh("title", e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #2a2a4a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 15, fontWeight: 700 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase" }}>あらすじ</div>
          <textarea value={ch.synopsis} onChange={(e) => updateCh("synopsis", e.target.value)} rows={3} placeholder="この章のあらすじを入力…"
            style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #2a2a4a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, fontFamily: "'Noto Serif JP', serif", resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase" }}>本文</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <WordCounter text={ch.draft} targetChars={targetChars} />
              <button onClick={generateDraft} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: "none", cursor: loading ? "not-allowed" : "pointer", background: loading ? "#2a2a3a" : "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
                <Icon name="spark" size={12} />{loading ? "生成中…" : "本文生成"}
              </button>
            </div>
          </div>
          <textarea value={ch.draft} onChange={(e) => updateCh("draft", e.target.value)} rows={14} placeholder="AIで生成するか、直接入力…"
            style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #2a2a4a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 14, lineHeight: 1.8, fontFamily: "'Noto Serif JP', serif", resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a4a7a", letterSpacing: "0.08em", textTransform: "uppercase" }}>章要約（次章コンテキスト用）</div>
            <button onClick={generateSummary} disabled={loading || !ch.draft} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 5, border: "1px solid #2a2a4a", cursor: loading || !ch.draft ? "not-allowed" : "pointer", background: "transparent", color: "#4a4a7a", fontSize: 11, opacity: loading || !ch.draft ? 0.4 : 1 }}>
              <Icon name="summary" size={11} /> 要約生成
            </button>
          </div>
          <textarea value={ch.summary || ""} onChange={(e) => updateCh("summary", e.target.value)} rows={2} placeholder="本文から自動生成、または手動入力…"
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #1a1a2e", background: "#0a0a14", color: "#64748b", fontSize: 12, lineHeight: 1.6, fontFamily: "'Noto Serif JP', serif", resize: "vertical" }} />
        </div>
      </div>
    </>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────
function ProjectEditor({ project, onSave, onBack, apiKey, maxTokens }) {
  const [p, setP] = useState(project);
  const [step, setStep] = useState("bible");
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState("");
  const [saved, setSaved] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPlotSplit, setShowPlotSplit] = useState(false);
  const [diffField, setDiffField] = useState(null);

  const targetChars = parseInt(localStorage.getItem("ln_target_chars") || "2000", 10);

  // Undo: プロジェクト全体スナップショット
  const undoHistory = useRef([project]);
  const undoCursor = useRef(0);
  const canUndo = undoCursor.current > 0;

  const upWithUndo = (field, val) => {
    const next = { ...p, [field]: val, updatedAt: new Date().toISOString() };
    // スナップショット追記
    undoHistory.current = undoHistory.current.slice(0, undoCursor.current + 1);
    undoHistory.current.push(next);
    if (undoHistory.current.length > 20) undoHistory.current.shift();
    undoCursor.current = undoHistory.current.length - 1;
    setP(next);
  };
  const up = upWithUndo;

  const upChapters = (chapters) => {
    const next = { ...p, chapters, updatedAt: new Date().toISOString() };
    undoHistory.current = undoHistory.current.slice(0, undoCursor.current + 1);
    undoHistory.current.push(next);
    if (undoHistory.current.length > 20) undoHistory.current.shift();
    undoCursor.current = undoHistory.current.length - 1;
    setP(next);
  };

  const handleUndo = () => {
    if (undoCursor.current <= 0) return;
    undoCursor.current--;
    setP(undoHistory.current[undoCursor.current]);
  };

  const generate = async (promptFn, field) => {
    if (!apiKey) { alert("APIキーを設定してください（右上の設定ボタン）"); return; }
    setLoading(true);
    try {
      const { system, user } = promptFn();
      let generated = "";
      await callClaude(system, user, (text) => { generated = text; }, apiKey, maxTokens);
      if (p[field] && field !== "check") {
        setDiffField({ field, oldText: p[field], newText: generated });
      } else {
        if (field === "check") setCheckResult(generated);
        else upWithUndo(field, generated);
      }
    } catch (e) { alert(`生成エラー: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleSave = async () => { await onSave(p); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const allDrafts = p.chapters.map((c) => c.draft).filter(Boolean).join("\n\n");
  const totalChars = countChars(allDrafts);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#080810", color: "#e2e8f0" }}>
      {diffField && <DiffViewer oldText={diffField.oldText} newText={diffField.newText} onAccept={() => { upWithUndo(diffField.field, diffField.newText); setDiffField(null); }} onClose={() => setDiffField(null)} />}
      {showTemplates && <TemplateModal onClose={() => setShowTemplates(false)} />}
      {showExport && <ExportModal project={p} onClose={() => setShowExport(false)} />}
      {showPlotSplit && <PlotSplitModal plot={p.plot} chapters={p.chapters} onApply={upChapters} onClose={() => setShowPlotSplit(false)} apiKey={apiKey} maxTokens={maxTokens} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid #1a1a2e", background: "#0a0a16", flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <Icon name="home" size={14} /> 一覧
        </button>
        <span style={{ color: "#2a2a3a" }}>›</span>
        <input value={p.title} onChange={(e) => up("title", e.target.value)} style={{ background: "none", border: "none", color: "#e2e8f0", fontSize: 17, fontWeight: 800, fontFamily: "'Noto Serif JP', serif", outline: "none", flex: 1, minWidth: 120 }} />
        <span style={{ fontSize: 11, color: "#3a3a5a" }}>max {maxTokens.toLocaleString()} tok</span>
        <span style={{ fontSize: 11, color: "#4a4a7a" }}>本文計 <span style={{ color: "#a78bfa" }}>{totalChars.toLocaleString()}字</span></span>
        {/* Undo */}
        <button onClick={handleUndo} disabled={!canUndo} title="元に戻す (Undo)" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: canUndo ? "#a78bfa" : "#2a2a4a", fontSize: 12, cursor: canUndo ? "pointer" : "not-allowed", transition: "all 0.15s" }}>
          <Icon name="undo" size={13} /> Undo
        </button>
        <button onClick={() => setShowTemplates(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#4a4a7a", fontSize: 12, cursor: "pointer" }}>
          <Icon name="template" size={13} /> テンプレート
        </button>
        <button onClick={() => setShowExport(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: "#4a4a7a", fontSize: 12, cursor: "pointer" }}>
          <Icon name="download" size={13} /> 出力
        </button>
        <button onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: saved ? "#16a34a" : "#1e1b4b", color: saved ? "#fff" : "#a78bfa", fontSize: 12, fontWeight: 600, transition: "all 0.3s" }}>
          <Icon name="save" size={13} /> {saved ? "保存済み" : "保存"}
        </button>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e", background: "#0a0a16", overflowX: "auto" }}>
        {STEPS.map((s) => (
          <button key={s.id} onClick={() => setStep(s.id)} style={{ padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: step === s.id ? "#a78bfa" : "#4a4a6a", borderBottom: step === s.id ? "2px solid #7c3aed" : "2px solid transparent", fontSize: 13, fontWeight: step === s.id ? 700 : 400, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", transition: "all 0.15s" }}>
            <Icon name={s.icon} size={13} /> {s.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {step === "bible" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["genre", "ジャンル", "異世界ファンタジー、SF、恋愛…"], ["theme", "テーマ", "成長、復讐、禁断の愛…"]].map(([f, l, ph]) => (
                <div key={f} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>{l}</label>
                  <input value={p[f]} onChange={(e) => up(f, e.target.value)} placeholder={ph} style={{ padding: "9px 12px", borderRadius: 6, border: "1px solid #2a2a3a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 14 }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>設定Bible</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <WordCounter text={p.bible} targetChars={targetChars} />
                  <GenerateButton label="AIで生成" onClick={() => generate(() => ({ system: getTemplate("bible"), user: `タイトル：${p.title}\nジャンル：${p.genre}\nテーマ：${p.theme}\n\n上記に基づいて詳細な設定bibleを作成してください。` }), "bible")} loading={loading} disabled={!p.genre && !p.theme} />
                </div>
              </div>
              <textarea value={p.bible} onChange={(e) => up("bible", e.target.value)} rows={16} placeholder="AIで生成するか、直接入力してください…" style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a3a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, fontFamily: "'Noto Serif JP', serif", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>
        )}
        {step === "char" && (
          <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>キャラクター設定</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <WordCounter text={p.characters} targetChars={targetChars} />
                <GenerateButton label="AIで生成" onClick={() => generate(() => ({ system: getTemplate("char"), user: `【設定bible】\n${p.bible}\n\n【キャラクター概要】\n主人公・ヒロイン・ライバルのプロフィールを作成` }), "characters")} loading={loading} disabled={!p.bible} />
              </div>
            </div>
            <textarea value={p.characters} onChange={(e) => up("characters", e.target.value)} rows={20} placeholder="登場人物のプロフィールを入力…" style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a3a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, fontFamily: "'Noto Serif JP', serif", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
          </div>
        )}
        {step === "plot" && (
          <div style={{ maxWidth: 800, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>プロット（章ごとのあらすじ）</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <WordCounter text={p.plot} targetChars={targetChars} />
                <button onClick={() => setShowPlotSplit(true)} disabled={!p.plot} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 6, border: "1px solid #2a2a4a", background: "transparent", color: p.plot ? "#a78bfa" : "#3a3a5a", fontSize: 12, cursor: p.plot ? "pointer" : "not-allowed" }}>
                  <Icon name="split" size={12} /> 章分割
                </button>
                <GenerateButton label="AIで生成" onClick={() => generate(() => ({ system: getTemplate("plot"), user: `【設定bible】\n${p.bible}\n\n【キャラクター】\n${p.characters}\n\n【プロット方針】\n三幕構成で全6章` }), "plot")} loading={loading} disabled={!p.bible} />
              </div>
            </div>
            <textarea value={p.plot} onChange={(e) => up("plot", e.target.value)} rows={20} placeholder="章ごとのあらすじを入力…" style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #2a2a3a", background: "#0f0f1a", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, fontFamily: "'Noto Serif JP', serif", resize: "vertical", boxSizing: "border-box", outline: "none" }} />
          </div>
        )}
        {step === "draft" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
            <ChapterManager chapters={p.chapters} onUpdate={upChapters} targetChars={targetChars} apiKey={apiKey} maxTokens={maxTokens} bible={p.bible} characters={p.characters} />
          </div>
        )}
        {step === "check" && (
          <div style={{ display: "flex", gap: 20, maxWidth: 1000 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>チェック対象本文</label>
                <WordCounter text={allDrafts} />
              </div>
              <div style={{ padding: 14, borderRadius: 8, border: "1px solid #1a1a2e", background: "#0a0a14", maxHeight: 500, overflow: "auto", fontSize: 13, color: "#64748b", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {allDrafts || <span style={{ color: "#2a2a4a" }}>本文タブで原稿を入力してください</span>}
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" }}>チェック結果</label>
                <GenerateButton label="一貫性チェック実行" onClick={() => generate(() => ({ system: getTemplate("check"), user: `【設定bible】\n${p.bible}\n\n【キャラクター】\n${p.characters}\n\n【本文】\n${allDrafts}` }), "check")} loading={loading} disabled={!allDrafts} />
              </div>
              <div style={{ padding: 16, borderRadius: 8, border: "1px solid #2a2a3a", background: "#0f0f1a", minHeight: 300, maxHeight: 500, overflow: "auto", fontSize: 14, lineHeight: 1.8, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>
                {checkResult || <span style={{ color: "#3a3a5a" }}>チェックを実行してください…</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Project List ─────────────────────────────────────────────────────────────
function ProjectList({ onSelect }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadAllProjects().then((ps) => { setProjects(ps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); setLoading(false); });
  }, []);

  const createNew = async () => {
    const p = newProject();
    await saveProject(p);
    onSelect(p);
  };

  const remove = async (e, id) => {
    e.stopPropagation();
    if (!confirm("削除しますか？")) return;
    await deleteProject(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
  };

  const handleImport = async (project) => {
    await saveProject(project);
    setShowImport(false);
    onSelect(project);
  };

  // JSONバックアップエクスポート
  const exportBackup = async (e, proj) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${proj.title}_backup.json`;
    a.click();
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e2e8f0", padding: 40 }}>
      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.25em", color: "#7c3aed", textTransform: "uppercase", marginBottom: 12 }}>AI Light Novel Studio</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: "0 0 12px", fontFamily: "'Noto Serif JP', serif", background: "linear-gradient(135deg, #e2e8f0, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            あなたの物語を<br />AIと共に紡ぐ
          </h1>
          <p style={{ color: "#4a4a6a", fontSize: 15 }}>設定・キャラ・プロット・本文・校閲を一気通貫で</p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button onClick={createNew}
            style={{ flex: 1, padding: "16px 24px", borderRadius: 12, border: "2px dashed #2a2a5a", background: "transparent", color: "#7c3aed", cursor: "pointer", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.background = "#0f0f2a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a5a"; e.currentTarget.style.background = "transparent"; }}>
            <Icon name="plus" size={16} /> 新規作成
          </button>
          <button onClick={() => setShowImport(true)}
            style={{ padding: "16px 20px", borderRadius: 12, border: "1px solid #2a2a4a", background: "transparent", color: "#4a4a7a", cursor: "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a4a7a"; e.currentTarget.style.color = "#a78bfa"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a4a"; e.currentTarget.style.color = "#4a4a7a"; }}>
            <Icon name="upload" size={15} /> インポート
          </button>
        </div>

        {/* list */}
        {loading ? <div style={{ textAlign: "center", color: "#3a3a5a", padding: 40 }}>読み込み中…</div> :
          projects.length === 0 ? <div style={{ textAlign: "center", color: "#3a3a5a", padding: 60, borderRadius: 12, border: "1px solid #1a1a2e" }}>作品がありません。最初の作品を作りましょう。</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {projects.map((p) => (
                <div key={p.id} onClick={() => onSelect(p)}
                  style={{ padding: "16px 20px", borderRadius: 10, border: "1px solid #1a1a2e", background: "#0a0a16", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3a1a6e"; e.currentTarget.style.background = "#0f0f22"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1a1a2e"; e.currentTarget.style.background = "#0a0a16"; }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Noto Serif JP', serif", marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "#3a3a5a" }}>
                      {p.genre && <span style={{ color: "#5b4a8a", marginRight: 10 }}>{p.genre}</span>}
                      更新: {new Date(p.updatedAt).toLocaleDateString("ja-JP")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={(e) => exportBackup(e, p)} title="JSONバックアップ"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a3a", padding: 6, borderRadius: 6, transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#a78bfa")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#2a2a3a")}>
                      <Icon name="download" size={14} />
                    </button>
                    <button onClick={(e) => remove(e, p.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2a2a3a", padding: 6, borderRadius: 6, transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#2a2a3a")}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// ─── useSettings ─────────────────────────────────────────────────────────────
// APIキーと想定文字数をlocalStorageで管理
function useSettings() {
  const [apiKey, setApiKeyState] = useState(() => localStorage.getItem("ln_api_key") || "");
  const [targetChars, setTargetCharsState] = useState(() => parseInt(localStorage.getItem("ln_target_chars") || "2000", 10));

  const setApiKey = (v) => { setApiKeyState(v); localStorage.setItem("ln_api_key", v); };
  const setTargetChars = (v) => { setTargetCharsState(v); localStorage.setItem("ln_target_chars", String(v)); };

  // 日本語1文字 ≒ 1.5トークン、余裕を持って×1.3
  const maxTokens = Math.min(Math.ceil(targetChars * 1.5 * 1.3), 8000);

  return { apiKey, setApiKey, targetChars, setTargetChars, maxTokens };
}

// ─── SettingsModal ────────────────────────────────────────────────────────────
function SettingsModal({ apiKey, setApiKey, targetChars, setTargetChars, maxTokens, onClose }) {
  const [keyInput, setKeyInput] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [chars, setChars] = useState(targetChars);

  const PRESETS = [500, 1000, 2000, 4000, 8000];

  const handleSave = () => {
    setApiKey(keyInput.trim());
    setTargetChars(chars);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#0f0f1e", border: "1px solid #2a2a4a", borderRadius: 14,
        padding: 32, width: 480, maxWidth: "95vw", display: "flex", flexDirection: "column", gap: 24,
        boxShadow: "0 0 40px rgba(124,58,237,0.2)",
      }}>
        {/* title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="gear" size={18} />
          <span style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0" }}>設定</span>
        </div>

        {/* API Key */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Anthropic APIキー
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                width: "100%", padding: "10px 40px 10px 12px", borderRadius: 8,
                border: "1px solid #2a2a4a", background: "#080810", color: "#e2e8f0",
                fontSize: 13, fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
            <button onClick={() => setShowKey((v) => !v)} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "#4a4a7a", padding: 4,
            }}>
              <Icon name={showKey ? "eyeoff" : "eye"} size={15} />
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#3a3a6a" }}>
            キーはブラウザのlocalStorageにのみ保存されます。サーバーへは送信されません。
          </div>
        </div>

        {/* Target chars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            想定生成文字数（1回あたり）
          </label>
          {/* presets */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((n) => (
              <button key={n} onClick={() => setChars(n)} style={{
                padding: "6px 14px", borderRadius: 20, border: "1px solid",
                borderColor: chars === n ? "#7c3aed" : "#2a2a4a",
                background: chars === n ? "#1e1b4b" : "transparent",
                color: chars === n ? "#a78bfa" : "#4a4a7a",
                cursor: "pointer", fontSize: 13, fontWeight: chars === n ? 700 : 400,
                transition: "all 0.15s",
              }}>
                {n.toLocaleString()}字
              </button>
            ))}
          </div>
          {/* custom input */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="number" value={chars} min={100} max={16000} step={100}
              onChange={(e) => setChars(Math.max(100, Math.min(16000, parseInt(e.target.value) || 100)))}
              style={{ width: 120, padding: "8px 12px", borderRadius: 8, border: "1px solid #2a2a4a", background: "#080810", color: "#e2e8f0", fontSize: 14 }} />
            <span style={{ fontSize: 13, color: "#4a4a7a" }}>字</span>
            <span style={{ fontSize: 12, color: "#3a3a6a", marginLeft: 8 }}>
              → max_tokens: <span style={{ color: "#7c3aed", fontWeight: 700 }}>{maxTokens.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#3a3a6a" }}>
            ※ 日本語1文字≒1.5トークン換算（上限8,000）。設定Bible・プロットは多めに、章ごと本文は1,000〜3,000字が目安。
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 7, border: "1px solid #2a2a4a", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
            キャンセル
          </button>
          <button onClick={handleSave} style={{ padding: "9px 18px", borderRadius: 7, border: "none", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [currentProject, setCurrentProject] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const { apiKey, setApiKey, targetChars, setTargetChars, maxTokens } = useSettings();

  const handleSave = async (p) => {
    await saveProject(p);
    setCurrentProject(p);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Serif JP', -apple-system, sans-serif; }
        textarea, input { font-family: 'Noto Serif JP', sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #080810; }
        ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
      `}</style>

      {/* 設定ボタン（常時表示） */}
      <button onClick={() => setShowSettings(true)} style={{
        position: "fixed", top: 14, right: 16, zIndex: 500,
        background: apiKey ? "#1a1a2e" : "#2a1a1a",
        border: `1px solid ${apiKey ? "#2a2a4a" : "#6a2a2a"}`,
        color: apiKey ? "#4a4a7a" : "#f87171",
        borderRadius: 8, padding: "6px 12px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
        transition: "all 0.2s",
      }}>
        <Icon name="key" size={13} />
        {apiKey ? "設定" : "APIキー未設定"}
      </button>

      {showSettings && (
        <SettingsModal
          apiKey={apiKey} setApiKey={setApiKey}
          targetChars={targetChars} setTargetChars={setTargetChars}
          maxTokens={maxTokens}
          onClose={() => setShowSettings(false)}
        />
      )}

      {currentProject
        ? <ProjectEditor project={currentProject} onSave={handleSave} onBack={() => setCurrentProject(null)}
            apiKey={apiKey} maxTokens={maxTokens} />
        : <ProjectList onSelect={setCurrentProject} />
      }
    </>
  );
}
