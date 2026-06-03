// ===== Main App Controller =====

// ===== Navigation =====
let currentPage = 'pipeline';
let currentStage = 0;

// 工程一覧（ドロップダウン用）
const STAGE_LABELS = [
  { num: 0,  label: 'INIT プロジェクト設定' },
  { num: 1,  label: '01 コンセプト・世界観' },
  { num: 2,  label: '02 プロット構築' },
  { num: 3,  label: '03 キャラクター設計' },
  { num: 4,  label: '04 節立て・構成' },
  { num: 5,  label: '05 節ごとの下書き' },
  { num: 6,  label: '06 整合性チェック' },
  { num: 7,  label: '07 文体統一・改稿' },
  { num: 8,  label: '08 最終仕上げ・話再構成' },
  { num: 9,  label: 'VIS ビジュアル生成' },
];

function navigatePage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-page="${page}"]`)?.classList.add('active');
  currentPage = page;
}

async function navigateStage(stageNum) {
  // パイプラインページに強制移動
  if (currentPage !== 'pipeline') navigatePage('pipeline');

  currentStage = stageNum;
  document.querySelectorAll('.stage-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.stage-item[data-stage="${stageNum}"]`)?.classList.add('active');

  const container = document.getElementById('stage-content');
  container.innerHTML = '<div style="padding:40px;color:var(--text-muted);font-family:var(--mono)">読み込み中...</div>';

  try {
    await StageRenderers[`render${stageNum}`]?.(container);
  } catch (e) {
    container.innerHTML = `<div style="padding:40px;color:var(--danger)">エラー: ${e.message}</div>`;
    console.error(e);
  }

  // グラフをサイドバーに再描画
  EmotionGraph.drawSidebar();
}

function unlockStage(num) {
  const el = document.querySelector(`.stage-item[data-stage="${num}"]`);
  if (el) el.classList.remove('locked');
}

function updateStageStatus(num, status) {
  const el = document.querySelector(`#stage-nav-${num}`);
  if (!el) return;
  el.querySelector('.stage-status-icon').textContent = status === 'done' ? '✓' : '●';
  if (status === 'done') el.classList.add('done');
}

// ===== Pipeline Dropdown (スマホ対応) =====
function initPipelineDropdown() {
  const btn = document.querySelector('.nav-tab[data-page="pipeline"]');
  if (!btn) return;

  // ドロップダウンコンテナを生成
  const wrapper = document.createElement('div');
  wrapper.className = 'pipeline-nav-wrap';
  btn.parentNode.insertBefore(wrapper, btn);
  wrapper.appendChild(btn);

  const dropdown = document.createElement('div');
  dropdown.className = 'pipeline-dropdown hidden';
  dropdown.innerHTML = STAGE_LABELS.map(s => `
    <button class="pipeline-dropdown-item" data-stage="${s.num}">${s.label}</button>
  `).join('');
  wrapper.appendChild(dropdown);

  // ボタンクリックでドロップダウン開閉
  btn.addEventListener('click', (e) => {
    // パイプラインページ以外 or モバイル時はドロップダウン
    const isMobile = window.innerWidth <= 640;
    const isOnPipeline = currentPage === 'pipeline';

    if (isMobile || isOnPipeline) {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    }
  });

  // ドロップダウン項目クリック
  dropdown.querySelectorAll('.pipeline-dropdown-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const num = parseInt(item.dataset.stage);
      const stageEl = document.querySelector(`.stage-item[data-stage="${num}"]`);
      if (stageEl && stageEl.classList.contains('locked')) {
        showToast('前の工程を完了してください', 'info');
        dropdown.classList.add('hidden');
        return;
      }
      dropdown.classList.add('hidden');
      navigatePage('pipeline');
      await navigateStage(num);
    });
  });

  // 外側クリックで閉じる
  document.addEventListener('click', () => dropdown.classList.add('hidden'));
}

// ===== Toast =====
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== Modal =====
function showModal(title, bodyHTML, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-confirm').onclick = () => {
    hideModal();
    onConfirm?.();
  };
}
function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ===== Emotion Graph Module =====
// 感情データは meta.emotionPoints に保存
// [{label, emotion, stage}] 形式
// emotionを累積スコアに変換して折れ線グラフを描画

const EmotionGraph = {

  // テキストから感情値を簡易推定（↑→↓ 記号 or AI不要の語彙スコアリング）
  parseFromText(text) {
    // #### 第N節「」｜感情：↑ 形式を優先
    const secMatches = [...text.matchAll(/####\s*第\d+節[^\n]*感情[：:]\s*([↑→↓])/g)];
    if (secMatches.length > 0) {
      return secMatches.map((m, i) => ({ label: `節${i+1}`, emotion: m[1] }));
    }
    // ### 第N幕 形式（プロット）→ 幕単位で粗く判定
    const actMatches = [...text.matchAll(/###\s*(第[一二三]幕[^\n]*)/g)];
    if (actMatches.length > 0) {
      // 幕ごとのテキストを切り出してキーワードスコアリング
      const acts = text.split(/(?=###\s*第[一二三]幕)/);
      return acts.filter(a => /第[一二三]幕/.test(a)).map((a, i) => {
        const label = ['第一幕', '第二幕', '第三幕'][i] || `幕${i+1}`;
        const emotion = this._scoreText(a);
        return { label, emotion };
      });
    }
    // 段落ごとのキーワードスコアリング（下書きなど）
    const paras = text.split(/\n{2,}/).filter(p => p.trim().length > 20);
    const step = Math.max(1, Math.floor(paras.length / 6));
    return paras.filter((_, i) => i % step === 0).map((p, i) => ({
      label: `段落${i+1}`,
      emotion: this._scoreText(p),
    }));
  },

  // キーワードによる感情方向の粗い推定
  _scoreText(text) {
    const up   = (text.match(/希望|成功|解決|笑|喜|光|勝|救|発見|前進|高ま|興奮|嬉し/g) || []).length;
    const down = (text.match(/絶望|失敗|喪失|死|涙|暗|負|孤独|恐怖|崩|悲し|苦し|後悔/g) || []).length;
    if (up > down + 1) return '↑';
    if (down > up + 1) return '↓';
    return '→';
  },

  // 感情ポイントを保存（上書き）
  async savePoints(points, sourceLabel) {
    await ProjectState.set('meta.emotionPoints', { points, sourceLabel, updatedAt: Date.now() });
    this.drawSidebar();
    showToast(`感情曲線を更新しました（${sourceLabel}）`, 'success');
  },

  // 感情ポイントをロード
  async loadPoints() {
    const ep = await ProjectState.get('meta.emotionPoints');
    return ep?.points || [];
  },

  // スコア列を生成（累積）
  toScores(points) {
    const scores = [0.5];
    points.forEach(p => {
      const last = scores[scores.length - 1];
      const delta = p.emotion === '↑' ? 0.12 : p.emotion === '↓' ? -0.12 : 0;
      scores.push(Math.min(0.92, Math.max(0.08, last + delta)));
    });
    return scores;
  },

  // 汎用Canvas描画（canvasEl: HTMLCanvasElement, points: array, mini: bool）
  draw(canvasEl, points, mini = false) {
    if (!canvasEl || points.length === 0) return;
    const parent = canvasEl.parentElement;
    canvasEl.width  = parent.clientWidth  || (mini ? 180 : 700);
    canvasEl.height = mini ? 80 : 220;

    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;
    const pad = mini
      ? { l: 8, r: 8, t: 8, b: 20 }
      : { l: 40, r: 16, t: 16, b: 40 };
    const gW = W - pad.l - pad.r;
    const gH = H - pad.t - pad.b;

    const scores = this.toScores(points);

    ctx.clearRect(0, 0, W, H);

    // グリッド（ミニは省略）
    if (!mini) {
      ctx.strokeStyle = '#2a2a3d'; ctx.lineWidth = 1;
      [0.25, 0.5, 0.75].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(pad.l, pad.t + gH * y);
        ctx.lineTo(pad.l + gW, pad.t + gH * y);
        ctx.stroke();
      });
      ctx.fillStyle = '#555577'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
      ctx.fillText('高', pad.l - 4, pad.t + 10);
      ctx.fillText('中', pad.l - 4, pad.t + gH * 0.5 + 4);
      ctx.fillText('低', pad.l - 4, pad.t + gH);
    }

    const pts = scores.map((s, i) => ({
      x: pad.l + (i / Math.max(scores.length - 1, 1)) * gW,
      y: pad.t + s * gH,
    }));

    // グラデーション
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gH);
    grad.addColorStop(0, 'rgba(200,169,110,0.3)');
    grad.addColorStop(1, 'rgba(200,169,110,0)');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.t + gH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.t + gH);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // 折れ線
    ctx.beginPath();
    ctx.strokeStyle = '#c8a96e'; ctx.lineWidth = mini ? 1.5 : 2;
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // ドットとラベル（ミニは簡略）
    pts.slice(1).forEach((p, i) => {
      const pt = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, mini ? 2 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pt.emotion === '↑' ? '#5cb87e' : pt.emotion === '↓' ? '#c45454' : '#7eb8d4';
      ctx.fill();
      if (!mini) {
        ctx.fillStyle = ctx.fillStyle;
        ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(pt.emotion, p.x, p.y - 9);
        ctx.fillStyle = '#555577';
        ctx.fillText(pt.label || `${i+1}`, p.x, pad.t + gH + 14);
      }
    });

    // ミニ：ソースラベル
    if (mini) {
      const ep = { sourceLabel: '' }; // ラベルはサイドバー側で付与
    }
  },

  // サイドバーのミニグラフを更新
  async drawSidebar() {
    const canvas = document.getElementById('sidebar-emotion-canvas');
    if (!canvas) return;
    const points = await this.loadPoints();
    if (points.length === 0) {
      canvas.style.display = 'none';
      const label = document.getElementById('sidebar-emotion-label');
      if (label) label.textContent = '（データなし）';
      return;
    }
    canvas.style.display = 'block';
    this.draw(canvas, points, true);
    // ソースラベル更新
    const ep = await ProjectState.get('meta.emotionPoints');
    const label = document.getElementById('sidebar-emotion-label');
    if (label) label.textContent = ep?.sourceLabel || '';
  },

  // 各工程ページに埋め込む「感情曲線」セクションのHTML
  sectionHTML(stageSource) {
    return `
      <div class="emotion-section" id="emotion-section-${stageSource}">
        <div class="emotion-section-header">
          <span class="emotion-section-title">📈 感情曲線</span>
          <button class="btn-secondary btn-sm" id="emotion-update-btn-${stageSource}">
            このテキストから更新
          </button>
          <button class="btn-secondary btn-sm" id="emotion-expand-btn-${stageSource}">
            拡大表示
          </button>
        </div>
        <div class="emotion-inline-wrap">
          <canvas id="emotion-inline-${stageSource}"></canvas>
          <span class="emotion-source-label" id="emotion-source-label-${stageSource}"></span>
        </div>
      </div>
    `;
  },

  // 各工程の感情セクションを初期化（描画＋ボタン登録）
  async initSection(stageSource, getTextFn) {
    const canvas = document.getElementById(`emotion-inline-${stageSource}`);
    const label  = document.getElementById(`emotion-source-label-${stageSource}`);
    const updateBtn = document.getElementById(`emotion-update-btn-${stageSource}`);
    const expandBtn = document.getElementById(`emotion-expand-btn-${stageSource}`);

    // 現在の保存済みグラフを描画
    const points = await this.loadPoints();
    const ep = await ProjectState.get('meta.emotionPoints');
    if (canvas && points.length > 0) {
      setTimeout(() => this.draw(canvas, points, false), 30);
      if (label) label.textContent = ep?.sourceLabel ? `最終更新：${ep.sourceLabel}` : '';
    }

    // 「このテキストから更新」ボタン
    if (updateBtn) {
      updateBtn.onclick = async () => {
        const text = getTextFn();
        if (!text || text.trim().length < 50) { showToast('テキストが短すぎます', 'info'); return; }
        updateBtn.disabled = true; updateBtn.textContent = '解析中…';
        try {
          const points = this.parseFromText(text);
          if (points.length === 0) { showToast('感情値を検出できませんでした', 'info'); return; }
          await this.savePoints(points, stageSource);
          setTimeout(() => this.draw(canvas, points, false), 30);
          if (label) label.textContent = `最終更新：${stageSource}`;
        } finally {
          updateBtn.disabled = false; updateBtn.textContent = 'このテキストから更新';
        }
      };
    }

    // 「拡大表示」ボタン → モーダルで大きなグラフを表示
    if (expandBtn) {
      expandBtn.onclick = async () => {
        const pts = await this.loadPoints();
        if (pts.length === 0) { showToast('感情データがありません', 'info'); return; }
        showModal('感情曲線グラフ', `<div style="width:100%"><canvas id="modal-emotion-canvas" style="width:100%"></canvas></div>`, null);
        setTimeout(() => {
          const mc = document.getElementById('modal-emotion-canvas');
          if (mc) this.draw(mc, pts, false);
        }, 50);
      };
    }
  },
};


// ===== Toast =====
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== Modal =====
function showModal(title, bodyHTML, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-confirm').onclick = () => {
    hideModal();
    onConfirm?.();
  };
}
function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ===== Noun Management =====
async function addNoun(text, note = '') {
  if (!text.trim()) return;
  const nouns = (await ProjectState.get('nouns')) || [];
  if (nouns.some(n => n.text === text)) return; // dedupe
  nouns.push({ text: text.trim(), note, id: Date.now() });
  await ProjectState.set('nouns', nouns);
  renderNounList(nouns);
}

async function removeNoun(id) {
  const nouns = (await ProjectState.get('nouns')) || [];
  const updated = nouns.filter(n => n.id !== id);
  await ProjectState.set('nouns', updated);
  renderNounList(updated);
}

function renderNounList(nouns) {
  const list = document.getElementById('noun-list');
  if (!list) return;
  list.innerHTML = nouns.map(n => `
    <div class="noun-tag">
      <span class="noun-text">${n.text}</span>
      <button onclick="removeNoun(${n.id})">✕</button>
    </div>
  `).join('');
}

// ===== Settings =====
const LS = {
  get: k => localStorage.getItem('lns_' + k),
  set: (k, v) => localStorage.setItem('lns_' + k, v),
  remove: k => localStorage.removeItem('lns_' + k),
};

// プロバイダーUIの同期
function _syncProviderUI(provider) {
  const keyLabel = document.getElementById('api-key-label');
  const keyInput = document.getElementById('api-key-input');
  const claudeGroup = document.getElementById('optgroup-claude');
  const openaiGroup = document.getElementById('optgroup-openai');
  const modelSelect = document.getElementById('model-select');

  if (provider === 'openai') {
    if (keyLabel) keyLabel.textContent = 'APIキー（OpenAI）';
    if (keyInput) keyInput.placeholder = 'sk-...';
    if (claudeGroup) claudeGroup.disabled = true;
    if (openaiGroup) { openaiGroup.disabled = false; openaiGroup.style.display = ''; }
    // モデルがClaudeのままなら先頭OpenAIモデルに切り替え
    const cur = modelSelect?.value || '';
    if (cur.startsWith('claude-')) modelSelect.value = 'gpt-4o';
  } else {
    if (keyLabel) keyLabel.textContent = 'APIキー（Anthropic）';
    if (keyInput) keyInput.placeholder = 'sk-ant-...';
    if (claudeGroup) claudeGroup.disabled = false;
    if (openaiGroup) { openaiGroup.disabled = true; openaiGroup.style.display = 'none'; }
    const cur = modelSelect?.value || '';
    if (!cur.startsWith('claude-')) modelSelect.value = 'claude-sonnet-4-20250514';
  }
}

function initSettings() {
  const keyInput = document.getElementById('api-key-input');
  const modelSelect = document.getElementById('model-select');
  const tokensInput = document.getElementById('max-tokens-input');

  // Load saved values
  keyInput.value = LS.get('api_key') || '';
  modelSelect.value = LS.get('model') || 'claude-sonnet-4-20250514';
  tokensInput.value = LS.get('max_tokens') || '4000';
  // provider radio restore
  const savedProvider = LS.get('provider') || 'claude';
  const providerRadio = document.querySelector(`input[name="api-provider"][value="${savedProvider}"]`);
  if (providerRadio) { providerRadio.checked = true; _syncProviderUI(savedProvider); }

  // Provider toggle
  document.querySelectorAll('input[name="api-provider"]').forEach(radio => {
    radio.addEventListener('change', () => _syncProviderUI(radio.value));
  });

  // Toggle key visibility
  document.getElementById('toggle-key-btn').onclick = () => {
    const isPass = keyInput.type === 'password';
    keyInput.type = isPass ? 'text' : 'password';
    document.getElementById('toggle-key-btn').textContent = isPass ? '隠す' : '表示';
  };

  // Save settings
  document.getElementById('save-settings-btn').onclick = async () => {
    const provider = document.querySelector('input[name="api-provider"]:checked')?.value || 'claude';
    LS.set('provider', provider);
    LS.set('api_key', keyInput.value.trim());
    LS.set('model', modelSelect.value);
    LS.set('max_tokens', tokensInput.value);
    apiClient.updateConfig();
    updateApiStatus();
    showToast('設定を保存しました', 'success');
  };

  // Test API
  document.getElementById('test-api-btn').onclick = async () => {
    const btn = document.getElementById('test-api-btn');
    btn.disabled = true; btn.textContent = 'テスト中…';
    const resultEl = document.getElementById('api-test-result');
    resultEl.classList.remove('hidden', 'success', 'error');
    try {
      LS.set('api_key', keyInput.value.trim());
      LS.set('model', modelSelect.value);
      apiClient.updateConfig();
      const result = await apiClient.test();
      resultEl.textContent = `✓ 接続成功：${result}`;
      resultEl.classList.add('success');
      document.getElementById('nav-api-status').className = 'status-dot online';
    } catch (e) {
      resultEl.textContent = `✕ ${e.message}`;
      resultEl.classList.add('error');
      document.getElementById('nav-api-status').className = 'status-dot error';
    } finally {
      btn.disabled = false; btn.textContent = 'API接続テスト';
    }
  };

  // Export/Import project
  document.getElementById('export-project-btn').onclick = () => Exporter.exportAll();
  document.getElementById('import-project-btn').onclick = () => document.getElementById('import-file-input').click();
  document.getElementById('import-file-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      ProjectState._cache = data;
      await ProjectState.save();
      showToast('プロジェクトをインポートしました。ページを再読み込みします', 'success');
      setTimeout(() => location.reload(), 1500);
    } catch { showToast('JSONの解析に失敗しました', 'error'); }
  };

  // Clear data
  document.getElementById('clear-data-btn').onclick = () => {
    showModal('全データを削除', '<p>プロジェクトの全データを削除します。この操作は取り消せません。</p>', async () => {
      await dbClear();
      LS.remove('api_key'); LS.remove('model'); LS.remove('max_tokens');
      showToast('全データを削除しました', 'info');
      setTimeout(() => location.reload(), 1000);
    });
  };
}

function updateApiStatus() {
  const key = LS.get('api_key');
  const dot = document.getElementById('nav-api-status');
  dot.className = 'status-dot ' + (key ? 'online' : 'offline');
}

// ===== Templates UI =====
async function initTemplates() {
  const keys = TemplateManager.getAllKeys();
  const listEl = document.getElementById('template-list');
  listEl.innerHTML = keys.map(k => `
    <div class="template-list-item" data-key="${k}" onclick="selectTemplate('${k}')">
      ${DEFAULT_TEMPLATES[k]?.name || k}
    </div>
  `).join('');
}

let _currentTemplateKey = null;
async function selectTemplate(key) {
  _currentTemplateKey = key;
  document.querySelectorAll('.template-list-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.template-list-item[data-key="${key}"]`)?.classList.add('active');
  const tmpl = await TemplateManager.get(key);
  document.getElementById('template-edit-name').textContent = tmpl.name || key;
  document.getElementById('template-editor').value = tmpl.user || '';
}

async function initTemplateActions() {
  document.getElementById('save-template-btn').onclick = async () => {
    if (!_currentTemplateKey) return;
    const tmpl = await TemplateManager.get(_currentTemplateKey);
    tmpl.user = document.getElementById('template-editor').value;
    await TemplateManager.set(_currentTemplateKey, tmpl);
    showToast('テンプレートを保存しました', 'success');
  };
  document.getElementById('reset-template-btn').onclick = async () => {
    if (!_currentTemplateKey) return;
    showModal('デフォルトに戻す', '<p>このテンプレートをデフォルトに戻しますか？</p>', async () => {
      await TemplateManager.reset(_currentTemplateKey);
      const tmpl = TemplateManager.getDefault(_currentTemplateKey);
      document.getElementById('template-editor').value = tmpl?.user || '';
      showToast('デフォルトに戻しました', 'success');
    });
  };
}

// ===== Export Page =====
function initExportPage() {
  document.querySelectorAll('[data-export]').forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-export');
      switch (type) {
        case 'manuscript': Exporter.exportManuscript(); break;
        case 'plot': Exporter.exportPlot(); break;
        case 'characters': Exporter.exportCharacters(); break;
        case 'visual': Exporter.exportVisualPrompts(); break;
        case 'nouns': Exporter.exportNouns(); break;
        case 'all': Exporter.exportAll(); break;
      }
    };
  });
}

// ===== Init =====
async function init() {
  // Init pipeline dropdown
  initPipelineDropdown();

  // Nav
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.onclick = () => {
      const page = tab.getAttribute('data-page');
      navigatePage(page);
      if (page === 'templates') initTemplates();
    };
  });

  // Stage nav
  document.querySelectorAll('.stage-item').forEach(item => {
    item.onclick = async () => {
      if (item.classList.contains('locked')) return;
      const num = parseInt(item.getAttribute('data-stage'));
      await navigateStage(num);
    };
  });

  // Noun add
  document.getElementById('add-noun-btn').onclick = () => {
    showModal(
      '固有名詞を追加',
      `<label style="font-size:12px;color:var(--text-muted)">固有名詞（Enterで確定）</label>
       <input type="text" id="noun-input-modal" placeholder="例：霧島渡" style="width:100%;margin-top:6px" autocomplete="off">`,
      async () => {
        const val = document.getElementById('noun-input-modal')?.value?.trim();
        if (val) { await addNoun(val); showToast(`「${val}」を追加しました`, 'success'); }
      }
    );
    // Enterキーで確定
    setTimeout(() => {
      const input = document.getElementById('noun-input-modal');
      if (input) {
        input.focus();
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); document.getElementById('modal-confirm').click(); }
        });
      }
    }, 50);
  };

  // Modal close
  document.getElementById('modal-close').onclick = hideModal;
  document.getElementById('modal-cancel').onclick = hideModal;
  document.getElementById('modal-overlay').onclick = (e) => { if (e.target === document.getElementById('modal-overlay')) hideModal(); };

  // Load state and restore UI
  const state = await ProjectState.load();
  const { meta, stageStatus, nouns } = state;

  // Restore total chars display
  if (meta.totalChars) document.getElementById('total-chars-display').textContent = meta.totalChars.toLocaleString() + '字';
  if (meta.name) document.getElementById('nav-project-name').textContent = meta.name;

  // Restore stage statuses and unlock
  for (const [k, v] of Object.entries(stageStatus || {})) {
    if (v === 'done') {
      updateStageStatus(parseInt(k), 'done');
      unlockStage(parseInt(k) + 1);
    }
  }
  // Always unlock stage 0 and 1
  unlockStage(0); unlockStage(1);

  // Restore nouns
  renderNounList(nouns || []);

  // Sidebar emotion graph initial draw
  EmotionGraph.drawSidebar();

  // Init sub-pages
  initSettings();
  initExportPage();
  initTemplateActions();
  updateApiStatus();

  // Load initial stage
  await navigateStage(0);
}

document.addEventListener('DOMContentLoaded', init);
