/**
 * ai-provider.js
 * 실제 AI 모델 호출을 담당하는 부분만 분리한 모듈.
 *
 * 기본 연결 방식: 이 PC에 설치되고 로그인된 "Claude Code CLI"를
 * scripts/AI전략회의실.bat(→ scripts/run.ps1)이 띄우는 로컬 서버
 * (http://127.0.0.1:8787)를 통해 사용한다. 브라우저 JS는 로컬 프로세스를
 * 직접 실행할 수 없으므로, 이 로컬 서버가 "브라우저 ↔ claude CLI" 사이의
 * 유일한 다리 역할을 한다 — 이 파일은 그 서버의 /api/complete 엔드포인트만
 * 호출할 뿐, 어떤 방식으로도 브라우저 보안 제약을 우회하지 않는다.
 *
 * Anthropic/OpenAI API 키 직접 입력 방식은 "보조(고급) 옵션"으로만 남겨둔다.
 * - 이 경우 사용량만큼 별도로 과금될 수 있다는 점을 설정 화면에 명시한다.
 * - API 키는 절대 이 파일이나 HTML 소스에 하드코딩하지 않는다. 사용자가
 *   직접 입력하면 localStorage에만 저장하고 재사용한다.
 */

const AI_KEY_STORAGE = {
  provider: 'strategy-room-ai-provider', // 'anthropic' | 'openai' (보조 옵션에서만 사용)
  anthropicKey: 'strategy-room-anthropic-key',
  openaiKey: 'strategy-room-openai-key'
};

const LOCAL_SERVER_BASE = 'http://127.0.0.1:8787';
const LOCAL_SERVER_HEALTH_TIMEOUT_MS = 1500;

const AiProvider = {
  _localServerAvailable: false,
  _localServerChecked: false,

  /**
   * 로컬 서버(AI전략회의실.bat이 띄운 claude CLI 브릿지)가 떠 있는지 확인한다.
   * app.js가 화면을 그리기 전에 한 번 호출해서 결과를 캐시해둔다.
   * file://로 index.html을 직접 열었거나(.bat을 안 쓴 경우) 서버가 아직
   * 안 켜졌으면 정상적으로 false를 반환하고, 이 경우 데모/보조 API 키
   * 방식으로 자연스럽게 전환된다.
   */
  async detectLocalServer() {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOCAL_SERVER_HEALTH_TIMEOUT_MS);
      const res = await fetch(`${LOCAL_SERVER_BASE}/api/health`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);
      this._localServerAvailable = res.ok;
    } catch (e) {
      this._localServerAvailable = false;
    }
    this._localServerChecked = true;
    return this._localServerAvailable;
  },

  isLocalServerAvailable() {
    return this._localServerAvailable;
  },

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

  /** 실제 AI 연결이 가능한 상태인지: 로컬 서버가 우선이고, 없으면 보조 API 키를 본다 */
  isConfigured() {
    if (this._localServerAvailable) return true;
    const provider = this.getProvider();
    if (!provider) return false;
    return !!this.getKey(provider);
  },

  /** 현재 실제로 쓰이는 연결 방식 문자열 (배지 표시용) */
  getActiveTransport() {
    if (this._localServerAvailable) return 'claude-code';
    const provider = this.getProvider();
    if (provider && this.getKey(provider)) return provider;
    return 'none';
  },

  /**
   * system + user 프롬프트를 넣고 텍스트 응답을 받는다.
   * meeting-engine.js는 이 함수 하나만 알면 된다 (연결 방식 교체 시 이 함수 내부만 수정).
   * opts.webSearch = true면(외부 벤치마킹 라운드) 로컬 서버가 claude CLI에
   * 웹검색 도구를 허용해서 실행한다 — API 키 방식(Anthropic/OpenAI 직접 호출)에는
   * 웹검색 기능이 없으므로 이 옵션은 로컬 서버 경로에서만 의미가 있다.
   */
  async complete(systemPrompt, userPrompt, opts) {
    if (this._localServerAvailable) {
      return this._callLocalServer(systemPrompt, userPrompt, opts || {});
    }
    const provider = this.getProvider();
    const key = this.getKey(provider);
    if (!provider || !key) {
      throw new Error('AI 연결이 설정되지 않았습니다. 데모 모드로 진행합니다.');
    }
    if (provider === 'openai') return this._callOpenAI(key, systemPrompt, userPrompt);
    return this._callAnthropic(key, systemPrompt, userPrompt);
  },

  async _callLocalServer(systemPrompt, userPrompt, opts) {
    let res;
    try {
      res = await fetch(`${LOCAL_SERVER_BASE}/api/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: systemPrompt,
          prompt: userPrompt,
          webSearch: !!opts.webSearch
        })
      });
    } catch (networkErr) {
      // 회의 도중 서버가 꺼졌거나(창을 닫음) 응답이 없는 경우
      this._localServerAvailable = false;
      throw new Error('이 PC의 Claude Code 연결(로컬 서버)에 연결하지 못했습니다. AI전략회의실.bat 창이 열려있는지 확인해주세요.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 아래서 처리 */ }
    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.message) || `로컬 Claude Code 호출 중 오류가 발생했습니다 (HTTP ${res.status}).`;
      throw new Error(msg);
    }
    return (data.text || '').trim();
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
