// ===== Stage Renderers =====

const VISUAL_STYLES = [
  'アニメ調', 'ライトノベル表紙', 'マンガ風', 'リアル調',
  'ファンタジーイラスト', 'サイバーパンク', 'ウォーターカラー',
  'モノクロ線画', 'レトロゲーム風', 'ダークファンタジー'
];

const StageRenderers = {

  // ===== STAGE 0: PROJECT INIT =====
  async render0(container) {
    const state = await ProjectState.load();
    const meta = state.meta;
    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">INIT</span>
        <div>
          <div class="stage-title">プロジェクト設定</div>
          <div class="stage-desc">総字数とジャンルを設定後、工程01から制作を開始します</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="input-group">
          <label>総字数目標</label>
          <input type="number" id="init-chars" value="${meta.totalChars||''}" placeholder="例: 10000" min="3000" step="500">
        </div>
        <div class="input-group">
          <label>ジャンル</label>
          <input type="text" id="init-genre" value="${meta.genre||''}" placeholder="例: SF、ファンタジー、現代魔法">
        </div>
        <div class="input-group" style="grid-column:1/-1">
          <label>テーマキーワード</label>
          <input type="text" id="init-theme" value="${meta.theme||''}" placeholder="例: アイデンティティ、喪失と再生、AIと人間">
        </div>
        <div class="input-group" style="grid-column:1/-1">
          <label>スタイルサンプル（文体参考文・任意）</label>
          <textarea id="init-style" placeholder="自分の文体サンプルをここに貼る（200字程度）">${meta.styleSample||''}</textarea>
        </div>
      </div>
      <button class="btn-primary" id="init-save-btn">保存して工程01へ進む →</button>
    `;

    document.getElementById('init-save-btn').onclick = async () => {
      const chars = parseInt(document.getElementById('init-chars').value);
      const genre = document.getElementById('init-genre').value.trim();
      const theme = document.getElementById('init-theme').value.trim();
      const style = document.getElementById('init-style').value.trim();
      if (!chars || chars < 1000) { showToast('総字数を正しく入力してください', 'error'); return; }
      await ProjectState.set('meta.totalChars', chars);
      await ProjectState.set('meta.genre', genre);
      await ProjectState.set('meta.theme', theme);
      await ProjectState.set('meta.styleSample', style);
      await ProjectState.set('stageStatus.0', 'done');
      document.getElementById('total-chars-display').textContent = chars.toLocaleString() + '字';
      document.getElementById('nav-project-name').textContent = await ProjectState.get('meta.name') || '無題';
      unlockStage(1);
      showToast('設定を保存しました', 'success');
      navigateStage(1);
    };
  },

  // ===== STAGE 1: CONCEPT =====
  async render1(container) {
    const state = await ProjectState.load();
    const conceptData = state.stages.concept;
    const hasResults = conceptData.concepts && conceptData.concepts.length > 0;
    const isFinal = !!conceptData.finalText;

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">01</span>
        <div>
          <div class="stage-title">コンセプト・世界観</div>
          <div class="stage-desc">10案を独自性スコア降順で生成→選択・編集→決定稿へ</div>
        </div>
      </div>
      ${isFinal ? `<div style="margin-bottom:8px"><span class="finalized-badge">✓ 決定稿あり</span></div>` : ''}
      <div class="ai-action-bar">
        <div class="ai-hint">総字数・ジャンル・テーマを元にコンセプト10案を生成します</div>
        <button class="btn-ai" id="concept-gen-btn">
          <div class="spinner"></div>
          ✦ AIで10案生成
        </button>
      </div>
      <div id="concept-results" style="margin-top:8px">
        ${hasResults ? this._renderConceptCards(conceptData.concepts, conceptData.selectedIndex) : ''}
      </div>
      ${isFinal ? `
        <div class="section-sep">決定稿</div>
        <div class="result-box">
          <div class="result-label">コンセプト決定稿</div>
          <textarea id="concept-final-text" class="large">${conceptData.finalText}</textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-success" id="concept-confirm-btn">この内容で工程02へ →</button>
            <button class="btn-secondary" id="concept-save-btn">保存</button>
          </div>
        </div>
      ` : ''}
    `;

    document.getElementById('concept-gen-btn').onclick = () => this._runConceptGen();
    if (isFinal) {
      document.getElementById('concept-confirm-btn').onclick = async () => {
        const txt = document.getElementById('concept-final-text').value;
        await ProjectState.set('stages.concept.finalText', txt);
        await ProjectState.set('stageStatus.1', 'done');
        updateStageStatus(1, 'done');
        unlockStage(2);
        showToast('コンセプト決定稿を確定しました', 'success');
        navigateStage(2);
      };
      document.getElementById('concept-save-btn').onclick = async () => {
        const txt = document.getElementById('concept-final-text').value;
        await ProjectState.set('stages.concept.finalText', txt);
        showToast('保存しました', 'success');
      };
    }
  },

  _renderConceptCards(concepts, selectedIndex) {
    const sorted = [...concepts].sort((a, b) => b.originality_score - a.originality_score);
    return `<div class="concept-grid">${sorted.map((c, i) => `
      <div class="concept-card ${selectedIndex === concepts.indexOf(c) ? 'selected' : ''}" data-original-idx="${concepts.indexOf(c)}">
        <div class="concept-card-header">
          <span class="concept-rank">#${i+1}</span>
          <div class="concept-score">
            <span class="score-num">${c.originality_score}</span>
            <span class="score-max">/10</span>
          </div>
        </div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${c.originality_score*10}%"></div></div>
        <div class="concept-catchcopy">${c.catchcopy}</div>
        <div class="concept-meta">
          <strong>世界ルール：</strong>${c.core_rule}<br>
          <strong>問い：</strong>${c.protagonist_question}<br>
          <strong>差別化：</strong>${c.differentiation}<br>
          <em style="font-size:11px;color:#6666aa">スコア根拠：${c.score_reason}</em>
        </div>
        <div class="concept-actions">
          <button class="btn-secondary btn-sm" onclick="StageRenderers._selectConcept(${concepts.indexOf(c)})">この案を選択・編集</button>
        </div>
      </div>
    `).join('')}</div>`;
  },

  async _runConceptGen() {
    const btn = document.getElementById('concept-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const { totalChars, genre, theme } = state.meta;
      if (!totalChars) { showToast('INIT工程で総字数を設定してください', 'error'); return; }

      const tmpl = await TemplateManager.get('concept');
      const userPrompt = buildPrompt(tmpl.user, { total_chars: totalChars, genre, theme });
      const raw = await apiClient.call(tmpl.system, userPrompt);

      // MarkdownからコンセプトオブジェクトをパースしてJSON配列に変換
      const blocks = raw.split(/(?=###\s*案\d+)/);
      const parsed = blocks
        .filter(b => /###\s*案\d+/.test(b))
        .map(block => {
          const scoreMatch = block.match(/スコア[：:]\s*(\d+)\s*\/\s*10/);
          const catchcopyMatch = block.match(/\*\*キャッチコピー[：:]\*\*\s*([^\n]+)/);
          const ruleMatch = block.match(/\*\*世界の核心ルール[：:]\*\*\s*([\s\S]*?)(?=\*\*主人公|$)/);
          const questionMatch = block.match(/\*\*主人公が直面する問い[：:]\*\*\s*([^\n]+)/);
          const diffMatch = block.match(/\*\*差別化ポイント[：:]\*\*\s*([^\n]+)/);
          const reasonMatch = block.match(/\*\*スコア根拠[：:]\*\*\s*([^\n]+)/);
          return {
            catchcopy: catchcopyMatch ? catchcopyMatch[1].trim() : '（解析失敗）',
            core_rule: ruleMatch ? ruleMatch[1].trim() : '',
            protagonist_question: questionMatch ? questionMatch[1].trim() : '',
            differentiation: diffMatch ? diffMatch[1].trim() : '',
            originality_score: scoreMatch ? parseInt(scoreMatch[1]) : 5,
            score_reason: reasonMatch ? reasonMatch[1].trim() : '',
          };
        })
        .filter(c => c.catchcopy !== '（解析失敗）' || c.originality_score);

      if (parsed.length === 0) {
        // パース失敗時はrawテキストをそのまま表示して手動選択できるようにする
        const resultsEl = document.getElementById('concept-results');
        resultsEl.innerHTML = `<div class="result-box"><div class="result-label">生成結果（自動解析失敗・以下から手動でコピーして決定稿に貼り付けてください）</div><textarea class="large">${raw}</textarea></div>`;
        showToast('Markdownの解析に失敗しました。手動でコピーしてください', 'info');
        return;
      }

      await ProjectState.set('stages.concept.concepts', parsed);
      await ProjectState.set('stages.concept.selectedIndex', null);

      const resultsEl = document.getElementById('concept-results');
      resultsEl.innerHTML = this._renderConceptCards(parsed, null);
      showToast(`${parsed.length}案を生成しました`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false; btn.classList.remove('loading');
    }
  },

  async _selectConcept(originalIdx) {
    const state = await ProjectState.load();
    const c = state.stages.concept.concepts[originalIdx];
    await ProjectState.set('stages.concept.selectedIndex', originalIdx);
    const finalText = `【キャッチコピー】${c.catchcopy}\n\n【世界の核心ルール】\n${c.core_rule}\n\n【主人公が直面する問い】\n${c.protagonist_question}\n\n【差別化ポイント】\n${c.differentiation}`;
    await ProjectState.set('stages.concept.finalText', finalText);

    // Re-render to show final text area
    const container = document.getElementById('stage-content');
    await this.render1(container);
    showToast('選択しました。下の決定稿エリアで編集できます', 'info');
  },

  // ===== STAGE 2: PLOT =====
  async render2(container) {
    const state = await ProjectState.load();
    const plotData = state.stages.plot;
    const totalChars = state.meta.totalChars || 10000;

    // 字数配分: 第一幕20% / 第二幕60% / 第三幕20%（合計100%）
    const ACT_RATIOS = { act1: 0.20, act2: 0.60, act3: 0.20 };
    const act1Chars = Math.round(totalChars * ACT_RATIOS.act1);
    const act2Chars = Math.round(totalChars * ACT_RATIOS.act2);
    // 第三幕は端数吸収で合計を保証
    const act3Chars = totalChars - act1Chars - act2Chars;
    const climaxPos = Math.round(totalChars * 0.75);

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">02</span>
        <div>
          <div class="stage-title">プロット構築</div>
          <div class="stage-desc">三幕構成。合計字数＝総字数 ${totalChars.toLocaleString()}字（第一幕${ACT_RATIOS.act1*100}%／第二幕${ACT_RATIOS.act2*100}%／第三幕${ACT_RATIOS.act3*100}%）</div>
        </div>
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">コンセプト決定稿を元に三幕構成プロットを生成します</div>
        <button class="btn-ai" id="plot-gen-btn"><div class="spinner"></div>✦ AIでプロット生成</button>
      </div>
      <div class="three-act-grid" id="plot-grid">
        <div class="act-panel">
          <span class="act-label" id="act1-label"></span>
          <textarea id="plot-act1" placeholder="日常・欠如・事件・伏線">${plotData.acts?.act1||''}</textarea>
        </div>
        <div class="act-panel">
          <span class="act-label" id="act2-label"></span>
          <textarea id="plot-act2" class="large" placeholder="選択と代償・中間点・最大の危機">${plotData.acts?.act2||''}</textarea>
        </div>
        <div class="act-panel">
          <span class="act-label" id="act3-label"></span>
          <textarea id="plot-act3" placeholder="クライマックス・結末・余韻">${plotData.acts?.act3||''}</textarea>
        </div>
      </div>
      <div class="result-box" style="margin-top:4px;padding:8px 14px">
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">
          字数配分確認：第一幕 ${act1Chars.toLocaleString()} ＋ 第二幕 ${act2Chars.toLocaleString()} ＋ 第三幕 ${act3Chars.toLocaleString()} ＝ <strong style="color:var(--accent)">${(act1Chars+act2Chars+act3Chars).toLocaleString()}字</strong>
          ／クライマックス位置：${climaxPos.toLocaleString()}字地点（75%）
        </span>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="plot-confirm-btn">プロット確定→工程03へ →</button>
        <button class="btn-secondary" id="plot-save-btn">保存</button>
      </div>
    `;

    // innerHTML でラベルをセット（strongタグを正しく描画）
    document.getElementById('act1-label').innerHTML = `第一幕（序）｜<strong>${act1Chars.toLocaleString()}字</strong>（${ACT_RATIOS.act1*100}%）`;
    document.getElementById('act2-label').innerHTML = `第二幕（破）｜<strong>${act2Chars.toLocaleString()}字</strong>（${ACT_RATIOS.act2*100}%）`;
    document.getElementById('act3-label').innerHTML = `第三幕（急）｜<strong>${act3Chars.toLocaleString()}字</strong>（${ACT_RATIOS.act3*100}%）`;

    document.getElementById('plot-gen-btn').onclick = () => this._runPlotGen(act1Chars, act2Chars, act3Chars, climaxPos);
    document.getElementById('plot-save-btn').onclick = () => this._savePlot();
    document.getElementById('plot-confirm-btn').onclick = async () => {
      await this._savePlot();
      await ProjectState.set('stageStatus.2', 'done');
      updateStageStatus(2, 'done');
      unlockStage(3);
      showToast('プロット確定', 'success');
      navigateStage(3);
    };
  },

  async _savePlot() {
    await ProjectState.set('stages.plot.acts.act1', document.getElementById('plot-act1').value);
    await ProjectState.set('stages.plot.acts.act2', document.getElementById('plot-act2').value);
    await ProjectState.set('stages.plot.acts.act3', document.getElementById('plot-act3').value);
    showToast('保存しました', 'success');
  },

  async _runPlotGen(act1Chars, act2Chars, act3Chars, climaxPos) {
    const btn = document.getElementById('plot-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const { totalChars, genre, theme } = state.meta;
      const concept = state.stages.concept.finalText;
      if (!concept) { showToast('コンセプト決定稿が必要です', 'error'); return; }
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';

      const tmpl = await TemplateManager.get('plot');
      const userPrompt = buildPrompt(tmpl.user, {
        total_chars: totalChars,
        genre, theme, concept, nouns,
        climax_pos: climaxPos,
        act1_chars: act1Chars,
        act2_chars: act2Chars,
        act3_chars: act3Chars,
        act1_pct: 20,
        act2_pct: 60,
        act3_pct: 20,
      });
      const raw = await apiClient.call(tmpl.system, userPrompt);

      // Markdown出力を幕ごとに分割してテキストエリアへ
      const act1Match = raw.match(/###\s*第一幕[^\n]*\n([\s\S]*?)(?=###\s*第二幕|$)/);
      const act2Match = raw.match(/###\s*第二幕[^\n]*\n([\s\S]*?)(?=###\s*第三幕|$)/);
      const act3Match = raw.match(/###\s*第三幕[^\n]*\n([\s\S]*?)$/);

      if (act1Match || act2Match || act3Match) {
        if (act1Match) document.getElementById('plot-act1').value = act1Match[1].trim();
        if (act2Match) document.getElementById('plot-act2').value = act2Match[1].trim();
        if (act3Match) document.getElementById('plot-act3').value = act3Match[1].trim();
        showToast('プロット生成完了（各幕に自動分割）', 'success');
      } else {
        // フォールバック: 生のMarkdownをそのまま第一幕エリアへ
        document.getElementById('plot-act1').value = raw;
        showToast('生成完了（手動で各幕に分配してください）', 'info');
      }
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 3: CHARACTERS =====
  async render3(container) {
    const state = await ProjectState.load();
    const charData = state.stages.characters;
    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">03</span>
        <div>
          <div class="stage-title">キャラクター設計</div>
          <div class="stage-desc">「論理的外面×感情的内核」を全キャラに。アンサンブルでテーマを体現。</div>
        </div>
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">プロットを元にキャラクター設計を生成。固有名詞リストに自動追加。</div>
        <button class="btn-ai" id="char-gen-btn"><div class="spinner"></div>✦ AIでキャラ設計</button>
      </div>
      <div id="char-results">
        ${charData.raw ? `<textarea class="large" id="char-raw-edit">${charData.raw}</textarea>` : '<p style="color:var(--text-muted);font-size:13px">生成後に表示されます</p>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="char-confirm-btn">キャラ確定→工程04へ →</button>
        <button class="btn-secondary" id="char-save-btn">保存</button>
      </div>
    `;

    document.getElementById('char-gen-btn').onclick = () => this._runCharGen();
    document.getElementById('char-save-btn').onclick = async () => {
      const el = document.getElementById('char-raw-edit');
      if (el) { await ProjectState.set('stages.characters.raw', el.value); showToast('保存', 'success'); }
    };
    document.getElementById('char-confirm-btn').onclick = async () => {
      const el = document.getElementById('char-raw-edit');
      if (el) await ProjectState.set('stages.characters.raw', el.value);
      await ProjectState.set('stageStatus.3', 'done');
      updateStageStatus(3, 'done'); unlockStage(4);
      showToast('キャラクター確定', 'success'); navigateStage(4);
    };
  },

  async _runCharGen() {
    const btn = document.getElementById('char-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const plot = [state.stages.plot.acts.act1, state.stages.plot.acts.act2, state.stages.plot.acts.act3].join('\n\n');
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';
      const tmpl = await TemplateManager.get('characters');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { plot, theme: state.meta.theme, nouns }));
      await ProjectState.set('stages.characters.raw', raw);

      // Markdownの ## キャラクター名（...）形式から名前を抽出
      const nameMatches = raw.matchAll(/^##\s+([^\n（(【]+)/gm);
      for (const m of nameMatches) {
        const name = m[1].trim();
        if (name && name !== 'アンサンブル評価') await addNoun(name);
      }

      document.getElementById('char-results').innerHTML = `<textarea class="large" id="char-raw-edit">${raw}</textarea>`;
      showToast('キャラクター設計完了。名前を固有名詞リストに追加しました', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 4: CHAPTERS =====
  async render4(container) {
    const state = await ProjectState.load();
    const chapData = state.stages.chapters;
    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">04</span>
        <div>
          <div class="stage-title">章立て・構成</div>
          <div class="stage-desc">各章の末尾フックは「疑問」「誤解」「選択」のいずれかに分類</div>
        </div>
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">プロットから章構成を生成します</div>
        <button class="btn-ai" id="chap-gen-btn"><div class="spinner"></div>✦ AI章構成生成</button>
      </div>
      <div id="chap-results">
        ${chapData.raw ? `<textarea class="large" id="chap-raw-edit">${chapData.raw}</textarea>` : '<p style="color:var(--text-muted);font-size:13px">生成後に表示されます</p>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="chap-confirm-btn">章構成確定→工程05へ →</button>
        <button class="btn-secondary" id="chap-save-btn">保存</button>
      </div>
    `;

    document.getElementById('chap-gen-btn').onclick = () => this._runChapGen();
    document.getElementById('chap-save-btn').onclick = async () => {
      const el = document.getElementById('chap-raw-edit');
      if (el) { await ProjectState.set('stages.chapters.raw', el.value); showToast('保存', 'success'); }
    };
    document.getElementById('chap-confirm-btn').onclick = async () => {
      const el = document.getElementById('chap-raw-edit');
      if (el) {
        const raw = el.value;
        await ProjectState.set('stages.chapters.raw', raw);

        // MarkdownからchapterオブジェクトのListを生成
        // 書式: ### 第N章「タイトル」｜目安X字
        const chapBlocks = raw.split(/(?=###\s*第\d+章)/);
        const list = chapBlocks
          .filter(b => /###\s*第\d+章/.test(b))
          .map(block => {
            const titleMatch = block.match(/###\s*第(\d+)章[「『]?([^」』｜|\n]*)[」』]?[｜|]?(?:目安)?(\d+)?字?/);
            const povMatch = block.match(/\*\*視点人物[：:]\*\*\s*([^\n]+)/);
            const eventsMatch = block.match(/\*\*主な出来事[：:]\*\*\s*([^\n]+)/);
            const openingMatch = block.match(/\*\*冒頭の引き[：:]\*\*\s*([^\n]+)/);
            const endingMatch = block.match(/\*\*末尾フック[：:]\*\*\s*([^\n]+)/);
            const hookTypeMatch = block.match(/【(疑問|誤解|選択)】/);
            return {
              chapter_num: titleMatch ? parseInt(titleMatch[1]) : 0,
              title: titleMatch ? titleMatch[2].trim() : '',
              pov: povMatch ? povMatch[1].trim() : '',
              events: eventsMatch ? eventsMatch[1].trim() : '',
              opening_hook: openingMatch ? openingMatch[1].trim() : '',
              ending_hook: endingMatch ? endingMatch[1].trim() : '',
              hook_type: hookTypeMatch ? hookTypeMatch[1] : '',
              target_chars: titleMatch?.[3] ? parseInt(titleMatch[3]) : 2500,
            };
          })
          .filter(c => c.chapter_num > 0);

        if (list.length > 0) {
          await ProjectState.set('stages.chapters.list', list);
          showToast(`${list.length}章を解析してリスト化しました`, 'success');
        } else {
          // パース失敗時は章タブなしで工程05へ進めるよう最低限のリストを生成
          const fallback = [{ chapter_num: 1, title: '（タイトル未解析）', pov: '', events: '', opening_hook: '', ending_hook: '', hook_type: '', target_chars: 2500 }];
          await ProjectState.set('stages.chapters.list', fallback);
          showToast('章の自動解析に失敗しました。工程05で手動確認してください', 'info');
        }
      }
      await ProjectState.set('stageStatus.4', 'done');
      updateStageStatus(4, 'done'); unlockStage(5);
      navigateStage(5);
    };
  },

  async _runChapGen() {
    const btn = document.getElementById('chap-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const plot = [state.stages.plot.acts.act1, state.stages.plot.acts.act2, state.stages.plot.acts.act3].join('\n\n');
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';
      const tmpl = await TemplateManager.get('chapters');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { plot, total_chars: state.meta.totalChars, nouns }));
      await ProjectState.set('stages.chapters.raw', raw);
      document.getElementById('chap-results').innerHTML = `<textarea class="large" id="chap-raw-edit">${raw}</textarea>`;
      showToast('章構成生成完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 5: DRAFTS =====
  async render5(container) {
    const state = await ProjectState.load();
    const chapters = state.stages.chapters.list || [];
    const drafts = state.stages.drafts || {};
    const currentChap = state._currentDraftChap || 0;

    if (chapters.length === 0) {
      container.innerHTML = `<div class="stage-header"><span class="stage-badge">05</span><div><div class="stage-title">章ごとの下書き</div><div class="stage-desc" style="color:var(--warning)">章構成が未確定です。工程04を完了してください</div></div></div>`;
      return;
    }

    const chap = chapters[currentChap] || chapters[0];
    const draft = drafts[currentChap] || {};

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">05</span>
        <div>
          <div class="stage-title">章ごとの下書き</div>
          <div class="stage-desc">章ごとに生成→要約自動作成（トークン上限対策）</div>
        </div>
      </div>
      <div class="chapter-tabs" id="chapter-tabs">
        ${chapters.map((c, i) => `
          <div class="chapter-tab ${i === currentChap ? 'active' : ''} ${drafts[i]?.draft ? 'done' : ''}"
            data-chap="${i}" onclick="StageRenderers._switchChapter(${i})">
            ${c.chapter_num || (i+1)}章
          </div>
        `).join('')}
      </div>
      ${draft.summary ? `<div class="chapter-summary-box"><strong>前章要約：</strong>${draft.summary}</div>` : ''}
      <div class="result-box" style="margin-bottom:8px">
        <div class="result-label">現在の章：第${chap.chapter_num || (currentChap+1)}章「${chap.title || ''}」</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
          視点：${chap.pov||'—'} ／ 目安：${chap.target_chars ? chap.target_chars.toLocaleString() : '—'}字 ／ フック種別：${chap.hook_type||'—'}
        </div>
        ${chap.ending_hook ? `<div style="font-size:12px;color:var(--accent2);margin-top:2px">末尾フック：${chap.ending_hook}</div>` : ''}
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">この章の下書きを生成します</div>
        <button class="btn-ai" id="draft-gen-btn"><div class="spinner"></div>✦ AI下書き生成</button>
      </div>
      <textarea id="draft-text" class="draft" placeholder="本文がここに生成されます">${draft.draft||''}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:4px">
        <span id="draft-char-count" style="font-family:var(--mono);font-size:11px;color:var(--text-muted)">
          ${(draft.draft||'').length.toLocaleString()}字
          ${chap.target_chars ? ` / 目安 ${chap.target_chars.toLocaleString()}字` : ''}
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-secondary" id="summary-gen-btn">✦ 要約を自動生成</button>
        <button class="btn-secondary" id="draft-save-btn">保存</button>
        ${currentChap < chapters.length - 1 ? `<button class="btn-success" id="next-chap-btn">次章へ →</button>` : `<button class="btn-success" id="to-stage6-btn">工程06へ →</button>`}
      </div>
      ${draft.summary ? `<div style="margin-top:8px"><span style="font-size:11px;color:var(--text-muted);font-family:var(--mono)">AUTO SUMMARY</span><div class="chapter-summary-box" style="margin-top:4px">${draft.summary}</div></div>` : ''}
    `;

    document.getElementById('draft-gen-btn').onclick = () => this._runDraftGen(currentChap, chap);
    document.getElementById('summary-gen-btn').onclick = () => this._runSummaryGen(currentChap);

    // リアルタイム文字数カウント
    const draftEl = document.getElementById('draft-text');
    const countEl = document.getElementById('draft-char-count');
    draftEl.addEventListener('input', () => {
      const len = draftEl.value.length;
      const target = chap.target_chars;
      const pct = target ? Math.round(len / target * 100) : null;
      const color = pct == null ? 'var(--text-muted)' : pct >= 90 && pct <= 115 ? 'var(--success)' : pct > 115 ? 'var(--warning)' : 'var(--text-muted)';
      countEl.style.color = color;
      countEl.textContent = `${len.toLocaleString()}字${target ? ` / 目安 ${target.toLocaleString()}字（${pct}%）` : ''}`;
    });
    document.getElementById('draft-save-btn').onclick = async () => {
      const txt = document.getElementById('draft-text').value;
      const cur = (await ProjectState.get('stages.drafts')) || {};
      if (!cur[currentChap]) cur[currentChap] = {};
      cur[currentChap].draft = txt;
      await ProjectState.set('stages.drafts', cur);
      showToast('保存しました', 'success');
    };
    const nextBtn = document.getElementById('next-chap-btn');
    if (nextBtn) nextBtn.onclick = () => this._switchChapter(currentChap + 1);
    const toBtn = document.getElementById('to-stage6-btn');
    if (toBtn) toBtn.onclick = async () => {
      await ProjectState.set('stageStatus.5', 'done');
      updateStageStatus(5, 'done'); unlockStage(6);
      showToast('下書き工程完了', 'success'); navigateStage(6);
    };
  },

  async _switchChapter(idx) {
    await ProjectState.set('_currentDraftChap', idx);
    const container = document.getElementById('stage-content');
    await this.render5(container);
  },

  async _runDraftGen(chapIdx, chap) {
    const btn = document.getElementById('draft-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';
      const styleSample = state.meta.styleSample;
      const styleSection = styleSample ? `## スタイルサンプル（このトーンに合わせよ）\n${styleSample}` : '';

      // Build summaries of previous chapters
      const drafts = state.stages.drafts || {};
      const summaries = Object.entries(drafts)
        .filter(([k]) => parseInt(k) < chapIdx && drafts[k]?.summary)
        .map(([k, v]) => `第${parseInt(k)+1}章：${v.summary}`)
        .join('\n') || 'なし（最初の章）';

      // chapter_spec をMarkdown形式で組み立て
      const chapSpec = [
        `- 章番号：第${chap.chapter_num || (chapIdx+1)}章`,
        `- タイトル：${chap.title || '（未設定）'}`,
        `- 視点人物：${chap.pov || '（未設定）'}`,
        `- 主な出来事：${chap.events || '（未設定）'}`,
        `- 冒頭の引き：${chap.opening_hook || '（未設定）'}`,
        `- 末尾フック：${chap.ending_hook || '（未設定）'}【${chap.hook_type || '—'}】`,
        `- 目安字数：${chap.target_chars || 2500}字`,
      ].join('\n');
      const tmpl = await TemplateManager.get('draft');
      const userPrompt = buildPrompt(tmpl.user, {
        chapter_spec: chapSpec,
        theme: state.meta.theme,
        nouns,
        summaries,
        style_section: styleSection,
        target_chars: chap.target_chars || 2500,
        ending_hook: chap.ending_hook || '—'
      });

      const raw = await apiClient.call(tmpl.system, userPrompt);
      document.getElementById('draft-text').value = raw;

      // Auto-save
      const cur = (await ProjectState.get('stages.drafts')) || {};
      if (!cur[chapIdx]) cur[chapIdx] = {};
      cur[chapIdx].draft = raw;
      await ProjectState.set('stages.drafts', cur);
      showToast('下書き生成完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  async _runSummaryGen(chapIdx) {
    const draft = document.getElementById('draft-text').value;
    if (!draft.trim()) { showToast('先に下書きを生成・入力してください', 'error'); return; }
    const btn = document.getElementById('summary-gen-btn');
    btn.textContent = '要約中…'; btn.disabled = true;
    try {
      const tmpl = await TemplateManager.get('summary');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { draft }), { maxTokens: 500 });
      const cur = (await ProjectState.get('stages.drafts')) || {};
      if (!cur[chapIdx]) cur[chapIdx] = {};
      cur[chapIdx].summary = raw;
      await ProjectState.set('stages.drafts', cur);
      showToast('要約を保存しました', 'success');
      // refresh
      const container = document.getElementById('stage-content');
      await this.render5(container);
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.textContent = '✦ 要約を自動生成'; btn.disabled = false; }
  },

  // ===== STAGE 6: CONSISTENCY =====
  async render6(container) {
    const state = await ProjectState.load();
    const consData = state.stages.consistency;
    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">06</span>
        <div>
          <div class="stage-title">整合性チェック</div>
          <div class="stage-desc">感情評価なし。論理的矛盾・伏線・表記ゆれのみ報告</div>
        </div>
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">全章の要約と固有名詞リストを元に矛盾を検出します</div>
        <button class="btn-ai" id="cons-gen-btn"><div class="spinner"></div>✦ AI整合性チェック</button>
      </div>
      <div id="cons-results">
        ${consData.raw ? this._renderConsistencyTable(consData.raw) : '<p style="color:var(--text-muted);font-size:13px">チェック結果がここに表示されます</p>'}
      </div>
      <div style="margin-top:16px">
        <div class="input-group"><label>手動メモ・修正記録</label>
        <textarea id="cons-notes" placeholder="手動での修正内容をここに記録">${consData.notes||''}</textarea></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="cons-confirm-btn">整合性確認完了→工程07へ →</button>
        <button class="btn-secondary" id="cons-save-btn">メモ保存</button>
      </div>
    `;

    document.getElementById('cons-gen-btn').onclick = () => this._runConsCheck();
    document.getElementById('cons-save-btn').onclick = async () => {
      await ProjectState.set('stages.consistency.notes', document.getElementById('cons-notes').value);
      showToast('保存', 'success');
    };
    document.getElementById('cons-confirm-btn').onclick = async () => {
      await ProjectState.set('stages.consistency.notes', document.getElementById('cons-notes').value);
      await ProjectState.set('stageStatus.6', 'done'); updateStageStatus(6, 'done'); unlockStage(7);
      showToast('整合性工程完了', 'success'); navigateStage(7);
    };
  },

  _renderConsistencyTable(raw) {
    // Markdown形式で直接表示
    return `<div class="result-box"><div class="result-label">チェック結果</div><div class="md-display" style="font-size:13px;line-height:1.8;white-space:pre-wrap;font-family:var(--sans)">${raw.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></div>`;
  },

  async _runConsCheck() {
    const btn = document.getElementById('cons-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const state = await ProjectState.load();
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';
      const chars = state.stages.characters.raw || '';
      const drafts = state.stages.drafts || {};
      const manuscript = Object.values(drafts).map((d, i) => `第${i+1}章要約：${d.summary||d.draft?.slice(0,200)||''}` ).join('\n');
      const tmpl = await TemplateManager.get('consistency');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { nouns, characters: chars.slice(0,2000), manuscript }));
      await ProjectState.set('stages.consistency.raw', raw);
      document.getElementById('cons-results').innerHTML = this._renderConsistencyTable(raw);
      showToast('整合性チェック完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 7: REVISION =====
  async render7(container) {
    const state = await ProjectState.load();
    const revData = state.stages.revision;
    const chapters = state.stages.chapters.list || [];
    const drafts = state.stages.drafts || {};

    // 下書きが存在する章のセレクタを構築
    const draftOptions = chapters
      .filter((_, i) => drafts[i]?.draft)
      .map((c, _, arr) => {
        const i = chapters.indexOf(c);
        return `<option value="${i}">第${c.chapter_num || (i+1)}章「${c.title || ''}」</option>`;
      }).join('');

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">07</span>
        <div>
          <div class="stage-title">文体統一・改稿</div>
          <div class="stage-desc">スタイルガイドに基づきリライト。章ごとに実施推奨。</div>
        </div>
      </div>
      ${draftOptions ? `
      <div class="input-group">
        <label>下書きから読み込む</label>
        <div style="display:flex;gap:8px">
          <select id="rev-chap-select" style="flex:1">
            <option value="">— 章を選択 —</option>
            ${draftOptions}
          </select>
          <button class="btn-secondary" id="rev-load-btn">読み込む</button>
        </div>
      </div>
      ` : ''}
      <div class="input-group">
        <label>対象テキスト（章を貼り付けまたは上で読み込み）</label>
        <textarea id="rev-input" class="large" placeholder="改稿する章本文をここに貼り付けてください"></textarea>
      </div>
      <div class="input-group">
        <label>トーン指定</label>
        <input type="text" id="rev-tone" placeholder="例：冷静・緊張・皮肉混じり">
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">スタイルガイドに従いリライトします</div>
        <button class="btn-ai" id="rev-gen-btn"><div class="spinner"></div>✦ AI改稿</button>
      </div>
      <div class="input-group">
        <label>改稿結果</label>
        <textarea id="rev-output" class="large" placeholder="改稿後の本文がここに">${revData.raw||''}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="rev-confirm-btn">改稿工程完了→工程08へ →</button>
        <button class="btn-secondary" id="rev-save-btn">保存</button>
      </div>
    `;

    if (draftOptions) {
      document.getElementById('rev-load-btn').onclick = () => {
        const sel = document.getElementById('rev-chap-select');
        const idx = sel.value;
        if (idx === '') return;
        const draft = drafts[parseInt(idx)]?.draft || '';
        document.getElementById('rev-input').value = draft;
        showToast('下書きを読み込みました', 'info');
      };
    }
    document.getElementById('rev-gen-btn').onclick = () => this._runRevision();
    document.getElementById('rev-save-btn').onclick = async () => {
      await ProjectState.set('stages.revision.raw', document.getElementById('rev-output').value);
      showToast('保存', 'success');
    };
    document.getElementById('rev-confirm-btn').onclick = async () => {
      await ProjectState.set('stages.revision.raw', document.getElementById('rev-output').value);
      await ProjectState.set('stageStatus.7', 'done'); updateStageStatus(7, 'done'); unlockStage(8);
      showToast('改稿工程完了', 'success'); navigateStage(8);
    };
  },

  async _runRevision() {
    const btn = document.getElementById('rev-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const manuscript = document.getElementById('rev-input').value;
      const tone = document.getElementById('rev-tone').value || '標準';
      if (!manuscript.trim()) { showToast('テキストを入力してください', 'error'); return; }
      const tmpl = await TemplateManager.get('revision');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { manuscript, tone }));
      document.getElementById('rev-output').value = raw;
      showToast('改稿完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 8: POLISH =====
  async render8(container) {
    const state = await ProjectState.load();
    const chapters = state.stages.chapters.list || [];
    const drafts = state.stages.drafts || {};

    const draftOptions = chapters
      .filter((_, i) => drafts[i]?.draft)
      .map(c => {
        const i = chapters.indexOf(c);
        return `<option value="${i}">第${c.chapter_num || (i+1)}章「${c.title || ''}」</option>`;
      }).join('');

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">08</span>
        <div>
          <div class="stage-title">最終仕上げ</div>
          <div class="stage-desc">誤字・読点・語句重複・語尾一貫性の校正</div>
        </div>
      </div>
      ${draftOptions ? `
      <div class="input-group">
        <label>下書きから読み込む</label>
        <div style="display:flex;gap:8px">
          <select id="polish-chap-select" style="flex:1">
            <option value="">— 章を選択 —</option>
            ${draftOptions}
          </select>
          <button class="btn-secondary" id="polish-load-btn">読み込む</button>
        </div>
      </div>
      ` : ''}
      <div class="input-group">
        <label>対象テキスト</label>
        <textarea id="polish-input" class="large" placeholder="校正する本文を貼り付けてください"></textarea>
      </div>
      <div class="ai-action-bar">
        <div class="ai-hint">固有名詞リストを参照しながら校正します</div>
        <button class="btn-ai" id="polish-gen-btn"><div class="spinner"></div>✦ AI校正</button>
      </div>
      <div class="input-group">
        <label>校正結果</label>
        <textarea id="polish-output" class="large" placeholder="校正後の本文がここに"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-success" id="polish-confirm-btn">✓ 全工程完了</button>
        <button class="btn-secondary" id="polish-save-btn">保存</button>
      </div>
    `;

    if (draftOptions) {
      document.getElementById('polish-load-btn').onclick = () => {
        const sel = document.getElementById('polish-chap-select');
        const idx = sel.value;
        if (idx === '') return;
        const draft = drafts[parseInt(idx)]?.draft || '';
        document.getElementById('polish-input').value = draft;
        showToast('下書きを読み込みました', 'info');
      };
    }
    document.getElementById('polish-gen-btn').onclick = () => this._runPolish();
    document.getElementById('polish-save-btn').onclick = async () => {
      await ProjectState.set('stages.polish.raw', document.getElementById('polish-output').value);
      showToast('保存', 'success');
    };
    document.getElementById('polish-confirm-btn').onclick = async () => {
      await ProjectState.set('stages.polish.raw', document.getElementById('polish-output').value);
      await ProjectState.set('stageStatus.8', 'done'); updateStageStatus(8, 'done'); unlockStage(9);
      showToast('🎉 全工程完了！エクスポートページから出力できます', 'success');
      navigateStage(9);
    };
  },

  async _runPolish() {
    const btn = document.getElementById('polish-gen-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const manuscript = document.getElementById('polish-input').value;
      if (!manuscript.trim()) { showToast('テキストを入力してください', 'error'); return; }
      const state = await ProjectState.load();
      const nouns = state.nouns.map(n => n.text).join('、') || 'なし';
      const tmpl = await TemplateManager.get('polish');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { manuscript, nouns }));
      document.getElementById('polish-output').value = raw;
      showToast('校正完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  // ===== STAGE 9: VISUAL =====
  async render9(container) {
    const state = await ProjectState.load();
    const visual = state.stages.visual || {};

    container.innerHTML = `
      <div class="stage-header">
        <span class="stage-badge">VIS</span>
        <div>
          <div class="stage-title">ビジュアル生成プロンプト</div>
          <div class="stage-desc">SD / NovelAI / Midjourney 向け画像生成プロンプトを作成</div>
        </div>
      </div>
      <div class="visual-grid">
        <div class="visual-card">
          <h3>🧍 キャラクタービジュアル</h3>
          <div class="input-group">
            <label>キャラクター情報</label>
            <textarea id="vis-char-input" placeholder="キャラクター設計から貼り付けまたは入力">${(state.stages.characters.raw||'').slice(0,600)}</textarea>
          </div>
          <div class="input-group"><label>画風</label></div>
          <div class="style-selector" id="char-style-selector">
            ${VISUAL_STYLES.map(s => `<div class="style-chip ${s==='アニメ調'?'active':''}" data-style="${s}" onclick="StageRenderers._selectStyle('char',this,'${s}')">${s}</div>`).join('')}
          </div>
          <div class="ai-action-bar" style="margin-top:8px">
            <div class="ai-hint"></div>
            <button class="btn-ai" id="vis-char-btn"><div class="spinner"></div>✦ 生成</button>
          </div>
          <div class="prompt-output" id="vis-char-output">${visual.character?.raw || 'ここに生成されます'}</div>
          <div class="copy-btn-row"><button class="btn-secondary btn-sm" onclick="StageRenderers._copyPrompt('vis-char-output')">📋 コピー</button></div>
        </div>
        <div class="visual-card">
          <h3>🎬 クライマックスシーン挿絵</h3>
          <div class="input-group">
            <label>クライマックス内容</label>
            <textarea id="vis-scene-input" placeholder="プロット第三幕のクライマックスを貼り付け">${(state.stages.plot.acts?.act3||'').slice(0,600)}</textarea>
          </div>
          <div class="input-group"><label>画風</label></div>
          <div class="style-selector" id="scene-style-selector">
            ${VISUAL_STYLES.map(s => `<div class="style-chip ${s==='ライトノベル表紙'?'active':''}" data-style="${s}" onclick="StageRenderers._selectStyle('scene',this,'${s}')">${s}</div>`).join('')}
          </div>
          <div class="ai-action-bar" style="margin-top:8px">
            <div class="ai-hint"></div>
            <button class="btn-ai" id="vis-scene-btn"><div class="spinner"></div>✦ 生成</button>
          </div>
          <div class="prompt-output" id="vis-scene-output">${visual.scene?.raw || 'ここに生成されます'}</div>
          <div class="copy-btn-row"><button class="btn-secondary btn-sm" onclick="StageRenderers._copyPrompt('vis-scene-output')">📋 コピー</button></div>
        </div>
      </div>
    `;

    document.getElementById('vis-char-btn').onclick = () => this._runVisualChar();
    document.getElementById('vis-scene-btn').onclick = () => this._runVisualScene();
  },

  _selectStyle(type, el, style) {
    const container = document.getElementById(`${type}-style-selector`);
    container.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    if (type === 'char') this._charStyle = style;
    else this._sceneStyle = style;
  },

  _charStyle: 'アニメ調',
  _sceneStyle: 'ライトノベル表紙',

  async _runVisualChar() {
    const btn = document.getElementById('vis-char-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const character = document.getElementById('vis-char-input').value;
      const style = this._charStyle;
      const tmpl = await TemplateManager.get('visual_character');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { character, style }));
      document.getElementById('vis-char-output').textContent = raw;
      await ProjectState.set('stages.visual.character', { raw });
      showToast('キャラビジュアルプロンプト生成完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  async _runVisualScene() {
    const btn = document.getElementById('vis-scene-btn');
    btn.disabled = true; btn.classList.add('loading');
    try {
      const climax = document.getElementById('vis-scene-input').value;
      const state = await ProjectState.load();
      const characters = state.stages.characters.raw?.slice(0,800) || '';
      const style = this._sceneStyle;
      const tmpl = await TemplateManager.get('visual_scene');
      const raw = await apiClient.call(tmpl.system, buildPrompt(tmpl.user, { climax, characters, style }));
      document.getElementById('vis-scene-output').textContent = raw;
      await ProjectState.set('stages.visual.scene', { raw });
      showToast('シーンプロンプト生成完了', 'success');
    } catch (e) { showToast(e.message, 'error'); }
    finally { btn.disabled = false; btn.classList.remove('loading'); }
  },

  _copyPrompt(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => showToast('コピーしました', 'success'));
  }
};
