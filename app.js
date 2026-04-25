// ===== Main App Controller =====

// ===== Navigation =====
let currentPage = 'pipeline';
let currentStage = 0;

function navigatePage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-page="${page}"]`)?.classList.add('active');
  currentPage = page;
}

async function navigateStage(stageNum) {
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

  // Init sub-pages
  initSettings();
  initExportPage();
  initTemplateActions();
  updateApiStatus();

  // Load initial stage
  await navigateStage(0);
}

document.addEventListener('DOMContentLoaded', init);
