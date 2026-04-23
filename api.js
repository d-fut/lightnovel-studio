// ===== Anthropic API Client =====

const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';

const ErrorMessages = {
  401: 'APIキー認証エラー。設定ページでAPIキーを確認してください。',
  403: 'アクセス権限エラー。APIキーの権限をAnthropicコンソールで確認してください。',
  429: 'レート制限に達しました。数分待ってから再試行してください。',
  500: 'Anthropicサーバーエラー。時間をおいて再試行してください。',
  529: 'APIが過負荷状態です。数分待ってから再試行してください。',
};

class AnthropicClient {
  constructor() {
    this.apiKey = localStorage.getItem('ts_api_key') || '';
    this.model = localStorage.getItem('ts_model') || 'claude-sonnet-4-20250514';
    this.maxTokens = parseInt(localStorage.getItem('ts_max_tokens') || '4000');
  }

  updateConfig() {
    this.apiKey = localStorage.getItem('ts_api_key') || '';
    this.model = localStorage.getItem('ts_model') || 'claude-sonnet-4-20250514';
    this.maxTokens = parseInt(localStorage.getItem('ts_max_tokens') || '4000');
  }

  async call(systemPrompt, userPrompt, { maxTokens } = {}) {
    this.updateConfig();
    if (!this.apiKey) {
      throw new Error('APIキーが設定されていません。設定ページでAPIキーを入力してください。');
    }

    const body = {
      model: this.model,
      max_tokens: maxTokens || this.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };

    let response;
    try {
      response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error(`ネットワークエラー: ${e.message}`);
    }

    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      const errType = data?.error?.type || '';
      const errMsg = data?.error?.message || '';

      if (errType === 'context_length_exceeded') {
        throw new Error('トークン上限超過。章要約モードを使用するか、テキストを短縮してください。');
      }
      if (errType === 'overloaded_error') {
        throw new Error('モデルが過負荷状態です。しばらく待ってから再試行してください。');
      }

      const knownMsg = ErrorMessages[status];
      throw new Error(knownMsg || `APIエラー (${status}): ${errMsg}`);
    }

    const text = data.content?.map(b => b.type === 'text' ? b.text : '').join('') || '';
    return text;
  }

  async test() {
    return this.call(
      'You are a helpful assistant.',
      'APIテスト。「接続成功」とだけ返してください。',
      { maxTokens: 50 }
    );
  }
}

const apiClient = new AnthropicClient();

// Utility: parse JSON safely
function safeParseJSON(text) {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
