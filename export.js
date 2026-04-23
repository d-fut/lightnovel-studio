// ===== Export Module =====

const Exporter = {

  async exportManuscript() {
    const state = await ProjectState.load();
    const chapters = state.stages.chapters.list || [];
    const drafts = state.stages.drafts || {};
    const name = state.meta.name || '無題';

    let md = `# ${name}\n\n`;
    md += `> 総字数目標：${state.meta.totalChars?.toLocaleString() || '—'}字\n`;
    md += `> ジャンル：${state.meta.genre || '—'}\n`;
    md += `> テーマ：${state.meta.theme || '—'}\n\n---\n\n`;

    if (chapters.length > 0) {
      chapters.forEach((c, i) => {
        md += `## 第${c.chapter_num || (i+1)}章　${c.title || ''}\n\n`;
        md += drafts[i]?.draft || '（下書き未作成）';
        md += '\n\n---\n\n';
      });
    } else {
      const allDrafts = Object.values(drafts);
      allDrafts.forEach((d, i) => {
        md += `## 第${i+1}章\n\n${d.draft || ''}\n\n---\n\n`;
      });
    }

    this._download(`${name}_本文.md`, md);
  },

  async exportPlot() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    let md = `# ${name} — プロット資料\n\n`;
    md += `## コンセプト決定稿\n\n${state.stages.concept.finalText || '未設定'}\n\n---\n\n`;
    md += `## プロット（三幕構成）\n\n### 第一幕\n${state.stages.plot.acts?.act1 || '未設定'}\n\n### 第二幕\n${state.stages.plot.acts?.act2 || '未設定'}\n\n### 第三幕\n${state.stages.plot.acts?.act3 || '未設定'}\n\n---\n\n`;
    md += `## 章構成\n\n${state.stages.chapters.raw || '未設定'}\n`;
    this._download(`${name}_プロット.md`, md);
  },

  async exportCharacters() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    let md = `# ${name} — キャラクターシート\n\n${state.stages.characters.raw || '未設定'}\n`;
    this._download(`${name}_キャラクター.md`, md);
  },

  async exportVisualPrompts() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    const v = state.stages.visual || {};
    let md = `# ${name} — ビジュアル生成プロンプト\n\n`;
    md += `## キャラクタービジュアル\n\`\`\`\n${JSON.stringify(v.character, null, 2) || '未生成'}\n\`\`\`\n\n`;
    md += `## クライマックスシーン\n\`\`\`\n${JSON.stringify(v.scene, null, 2) || '未生成'}\n\`\`\`\n`;
    this._download(`${name}_ビジュアルプロンプト.md`, md);
  },

  async exportNouns() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    const nouns = state.nouns || [];
    let md = `# ${name} — 固有名詞リスト\n\n`;
    nouns.forEach(n => { md += `- ${n.text}${n.note ? `（${n.note}）` : ''}\n`; });
    this._download(`${name}_固有名詞.md`, md);
  },

  async exportAll() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    const json = JSON.stringify(state, null, 2);
    this._download(`${name}_project.json`, json, 'application/json');
  },

  _download(filename, content, mime = 'text/markdown;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${filename} をダウンロードしました`, 'success');
  }
};
