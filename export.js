// ===== Export Module =====

const Exporter = {

  // 完成版本文：話付番・サブタイトル・節内テキストを階層的に出力
  async exportManuscript() {
    const state = await ProjectState.load();
    const name     = state.meta.name || '無題';
    const episodes = state.stages.episodes || [];
    const polished = state.stages.polished || {};
    const drafts   = state.stages.drafts   || {};
    const sections = state.stages.chapters.list || [];

    let md = `# ${name}\n\n`;
    md += `> ジャンル：${state.meta.genre || '—'}　テーマ：${state.meta.theme || '—'}　感情曲線：${state.meta.arcType || '—'}\n\n---\n\n`;

    if (episodes.length > 0) {
      // 話構造あり：### 第N話「サブタイトル」 → #### 第M節（本文は節内に埋め込み）
      for (const ep of episodes) {
        md += `### 第${ep.ep}話「${ep.title}」\n\n`;
        for (const secIdx of ep.sections) {
          const sec  = sections[secIdx];
          const text = polished[secIdx] || drafts[secIdx]?.draft || '';
          // 節見出しは画面表示用に付記するが本文には不要（仕様：本文中表記不要）
          // ただし画面表示のため #### を付与
          if (sec?.title) md += `#### 節「${sec.title}」\n\n`;
          md += text + '\n\n';
        }
        md += '---\n\n';
      }
    } else {
      // 話構造なし：節テキストをそのまま出力
      sections.forEach((sec, i) => {
        const text = polished[i] || drafts[i]?.draft || '';
        if (!text) return;
        md += `#### 第${sec.chapter_num || (i+1)}節「${sec.title || ''}」\n\n${text}\n\n---\n\n`;
      });
    }

    this._download(`${name}_完成版.md`, md);
  },

  async exportAll() {
    const state = await ProjectState.load();
    const name = state.meta.name || '無題';
    this._download(`${name}_project.json`, JSON.stringify(state, null, 2), 'application/json');
  },

  _download(filename, content, mime = 'text/markdown;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${filename} をダウンロードしました`, 'success');
  }
};
