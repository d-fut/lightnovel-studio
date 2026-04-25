// ===== Multi-Provider API Client =====

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const ErrorMessages = {
  401: 'APIキー認証エラー。設定ページでAPIキーを確認してください。',
  403: 'アクセス権限エラー。APIキーの権限を確認してください。',
  429: 'レート制限に達しました。数分待ってから再試行してください。',
  500: 'サーバーエラー。時間をおいて再試行してください。',
  529: 'APIが過負荷状態です。数分待ってから再試行してください。',
};

class ApiClient {
  constructor() { this.updateConfig(); }

  updateConfig() {
    this.provider  = localStorage.getItem('lns_provider')   || 'claude';
    this.apiKey    = localStorage.getItem('lns_api_key')    || '';
    this.model     = localStorage.getItem('lns_model')      || 'claude-sonnet-4-20250514';
    this.maxTokens = parseInt(localStorage.getItem('lns_max_tokens') || '4000');
  }

  // 統一呼び出し口
  async call(systemPrompt, userPrompt, { maxTokens } = {}) {
    this.updateConfig();
    if (!this.apiKey) throw new Error('APIキーが設定されていません。設定ページで入力してください。');
    if (this.provider === 'openai') {
      return this._callOpenAI(systemPrompt, userPrompt, maxTokens);
    }
    return this._callClaude(systemPrompt, userPrompt, maxTokens);
  }

  async _callClaude(systemPrompt, userPrompt, maxTokens) {
    let response;
    try {
      response = await fetch(CLAUDE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens || this.maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
    } catch (e) { throw new Error(`ネットワークエラー: ${e.message}`); }

    const data = await response.json();
    if (!response.ok) {
      const status = response.status;
      const errType = data?.error?.type || '';
      if (errType === 'context_length_exceeded') throw new Error('トークン上限超過。章要約モードを使用するかテキストを短縮してください。');
      if (errType === 'overloaded_error') throw new Error('モデルが過負荷状態です。しばらく待ってから再試行してください。');
      throw new Error(ErrorMessages[status] || `Anthropic APIエラー (${status}): ${data?.error?.message || ''}`);
    }
    return data.content?.map(b => b.type === 'text' ? b.text : '').join('') || '';
  }

  async _callOpenAI(systemPrompt, userPrompt, maxTokens) {
    let response;
    try {
      response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_completion_tokens: maxTokens || this.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
    } catch (e) { throw new Error(`ネットワークエラー: ${e.message}`); }

    const data = await response.json();
    if (!response.ok) {
      const status = response.status;
      const errMsg = data?.error?.message || '';
      if (errMsg.includes('context_length')) throw new Error('トークン上限超過。テキストを分割してください。');
      throw new Error(ErrorMessages[status] || `OpenAI APIエラー (${status}): ${errMsg}`);
    }
    return data.choices?.[0]?.message?.content || '';
  }

  async test() {
    return this.call('You are a helpful assistant.', 'APIテスト。「接続成功」とだけ返してください。', { maxTokens: 50 });
  }
}

const apiClient = new ApiClient();

// Utility: parse JSON safely
function safeParseJSON(text) {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch { return null; }
}
