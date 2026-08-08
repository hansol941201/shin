/**
 * ai-provider.js
 * 실제 AI 모델 호출을 담당하는 부분만 분리한 모듈.
 * - API 키는 절대 이 파일이나 HTML 소스에 하드코딩하지 않는다.
 * - 사용자가 최초 1회 입력하면 localStorage에만 저장하고 재사용한다.
 * - 나중에 모델(OpenAI/Anthropic 등)을 교체하거나 서버 프록시로 바꿀 때
 *   이 파일만 수정하면 되도록 meeting-engine.js와의 경계를 여기서 정한다.
 *
 * 주의: OpenAI/Anthropic API는 브라우저에서 직접 호출 시 CORS 정책으로 막힐 수
 * 있다(대부분의 실무 환경에서 관측되는 문제). 이 경우 서버 프록시(Cloud Function 등)를
 * 추가해야 한다. 이 모듈은 그 상황을 감지해서 사용자에게 한국어로 안내하고,
 * 상위(app.js)가 데모 모드로 자연스럽게 전환할 수 있도록 에러를 던진다.
 */

const AI_KEY_STORAGE = {
  provider: 'strategy-room-ai-provider', // 'anthropic' | 'openai'
  anthropicKey: 'strategy-room-anthropic-key',
  openaiKey: 'strategy-room-openai-key'
};

const AiProvider = {
  getProvider() {
    return localStorage.getItem(AI_KEY_STORAGE.provider) || '';
  },
  setProvider(name) {
    localStorage.setItem(AI_KEY_STORAGE.provider, name);
  },
  getKey(provider) {
    const storageKey = provider === 'openai' ? AI_KEY_STORAGE.openaiKey : AI_KEY_STORAGE.anthropicKey;
    return localStorage.getItem(storageKey) || '';
  },
  setKey(provider, key) {
    const storageKey = provider === 'openai' ? AI_KEY_STORAGE.openaiKey : AI_KEY_STORAGE.anthropicKey;
    localStorage.setItem(storageKey, key);
  },
  clearKey(provider) {
    const storageKey = provider === 'openai' ? AI_KEY_STORAGE.openaiKey : AI_KEY_STORAGE.anthropicKey;
    localStorage.removeItem(storageKey);
  },

  /** 실제 AI 연결이 가능한 상태인지 (provider + key가 모두 설정됐는지) */
  isConfigured() {
    const provider = this.getProvider();
    if (!provider) return false;
    return !!this.getKey(provider);
  },

  /**
   * system + user 프롬프트를 넣고 텍스트 응답을 받는다.
   * meeting-engine.js는 이 함수 하나만 알면 된다 (모델 교체 시 이 함수 내부만 수정).
   */
  async complete(systemPrompt, userPrompt) {
    const provider = this.getProvider();
    const key = this.getKey(provider);
    if (!provider || !key) {
      throw new Error('AI 연결이 설정되지 않았습니다. 데모 모드로 진행합니다.');
    }
    if (provider === 'openai') return this._callOpenAI(key, systemPrompt, userPrompt);
    return this._callAnthropic(key, systemPrompt, userPrompt);
  },

  async _callAnthropic(key, systemPrompt, userPrompt) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1400,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
    } catch (networkErr) {
      throw new Error('AI 서버에 연결하지 못했습니다 (브라우저 보안 정책으로 직접 호출이 막혔을 수 있습니다). 데모 모드로 진행합니다.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch (e) { /* 무시 */ }
      throw new Error(`Anthropic API 오류 (${res.status}) ${detail}`);
    }
    const data = await res.json();
    return (data.content && data.content[0] && data.content[0].text || '').trim();
  },

  async _callOpenAI(key, systemPrompt, userPrompt) {
    let res;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.6,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
    } catch (networkErr) {
      throw new Error('AI 서버에 연결하지 못했습니다 (브라우저 보안 정책으로 직접 호출이 막혔을 수 있습니다). 데모 모드로 진행합니다.');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch (e) { /* 무시 */ }
      throw new Error(`OpenAI API 오류 (${res.status}) ${detail}`);
    }
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
  }
};
