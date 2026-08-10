/**
 * ai-provider.js
 * 실제 AI 모델 호출을 담당하는 부분만 분리한 모듈.
 *
 * 연결 방식은 오직 하나뿐이다: 이 PC에 설치되고 로그인된 "Claude Code CLI".
 * scripts/AI전략회의실.bat(→ scripts/run.ps1)이 그 CLI를 이용해 로컬 서버
 * (http://127.0.0.1:8787)를 띄우고, 브라우저 JS는 로컬 프로세스를 직접
 * 실행할 수 없으므로 이 로컬 서버가 "브라우저 ↔ claude CLI" 사이의 유일한
 * 다리 역할을 한다 — 이 파일은 그 서버의 /api/complete 엔드포인트만 호출할
 * 뿐, 어떤 방식으로도 브라우저 보안 제약을 우회하지 않는다.
 *
 * Anthropic/OpenAI API를 직접 호출하는 코드는 이 프로그램에 존재하지 않는다.
 * 사용자가 API 키라는 개념 자체를 볼 필요가 없어야 하기 때문이다.
 */

const LOCAL_SERVER_BASE = 'http://127.0.0.1:8787';
const LOCAL_SERVER_HEALTH_TIMEOUT_MS = 2500;
const LOCAL_SERVER_STATUS_TIMEOUT_MS = 4000;

// 화면에 보여줄 연결 상태 구분값. 서버가 아예 응답하지 않으면(server-unreachable)
// "왜" 응답하지 않는지는 브라우저 쪽에서 알 방법이 없다 — 그 경우는 run.ps1이 남기는
// logs\run.log 로만 정확한 원인을 알 수 있다(화면 안내 문구에서 이 파일을 안내한다).
const CONN_STATUS = {
  CONNECTED: 'connected',
  NOT_INSTALLED: 'not-installed',
  LOGIN_REQUIRED: 'login-required',
  SERVER_UNREACHABLE: 'server-unreachable'
};

const AiProvider = {
  _localServerAvailable: false,
  _localServerChecked: false,
  _connStatus: CONN_STATUS.SERVER_UNREACHABLE,

  /**
   * 로컬 서버(AI전략회의실.bat이 띄운 claude CLI 브릿지)가 떠 있는지, 그리고
   * (떠 있다면) Claude 설치/로그인이 실제로 되어 있는지까지 한 번에 확인한다.
   * /api/health 로 먼저 "서버 자체가 살아있는지"만 빠르게 확인하고, 살아있으면
   * /api/status 로 claude 설치·로그인 여부를 실시간으로 재확인한다(로그인 세션이
   * 도중에 만료되는 경우까지 정확히 반영하기 위해 캐시하지 않고 매번 다시 묻는다).
   */
  async detectLocalServer() {
    const healthy = await this._ping(`${LOCAL_SERVER_BASE}/api/health`, LOCAL_SERVER_HEALTH_TIMEOUT_MS);
    if (!healthy) {
      this._localServerAvailable = false;
      this._connStatus = CONN_STATUS.SERVER_UNREACHABLE;
      this._localServerChecked = true;
      return false;
    }

    let status = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOCAL_SERVER_STATUS_TIMEOUT_MS);
      const res = await fetch(`${LOCAL_SERVER_BASE}/api/status`, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (res.ok) status = await res.json();
    } catch (e) {
      status = null;
    }

    if (!status) {
      // 서버(health)는 응답했는데 status만 실패하는 드문 경우 — 그래도 서버는
      // 살아있으므로 "연결 안 됨"보다는 조금 더 구체적으로 재시도를 유도한다.
      this._localServerAvailable = false;
      this._connStatus = CONN_STATUS.SERVER_UNREACHABLE;
      this._localServerChecked = true;
      return false;
    }

    if (!status.claudeInstalled) {
      this._localServerAvailable = false;
      this._connStatus = CONN_STATUS.NOT_INSTALLED;
    } else if (!status.loggedIn) {
      this._localServerAvailable = false;
      this._connStatus = CONN_STATUS.LOGIN_REQUIRED;
    } else {
      this._localServerAvailable = true;
      this._connStatus = CONN_STATUS.CONNECTED;
    }
    this._localServerChecked = true;
    return this._localServerAvailable;
  },

  async _ping(url, timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      return res.ok;
    } catch (e) {
      return false;
    }
  },

  isLocalServerAvailable() {
    return this._localServerAvailable;
  },

  /** 'connected' | 'not-installed' | 'login-required' | 'server-unreachable' */
  getConnStatus() {
    return this._connStatus;
  },

  /** 실제 AI 연결이 가능한 상태인지 (= 로컬 Claude Code 서버 연결 + 로그인 여부) */
  isConfigured() {
    return this._localServerAvailable;
  },

  /** 현재 실제로 쓰이는 연결 방식 문자열 (배지 표시용) */
  getActiveTransport() {
    return this._localServerAvailable ? 'claude-code' : 'none';
  },

  /**
   * system + user 프롬프트를 넣고 텍스트 응답을 받는다.
   * meeting-engine.js는 이 함수 하나만 알면 된다.
   * opts.webSearch = true면(외부 벤치마킹 라운드) 로컬 서버가 claude CLI에
   * 웹검색 도구를 허용해서 실행한다.
   */
  async complete(systemPrompt, userPrompt, opts) {
    if (!this._localServerAvailable) {
      throw new Error('Claude Code가 연결되어 있지 않습니다. AI전략회의실.bat으로 실행했는지 확인해주세요.');
    }
    return this._callLocalServer(systemPrompt, userPrompt, opts || {});
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
      this._connStatus = CONN_STATUS.SERVER_UNREACHABLE;
      throw new Error('이 PC의 Claude Code 연결(로컬 서버)에 연결하지 못했습니다. AI전략회의실.bat 창이 열려있는지 확인해주세요.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 아래서 처리 */ }
    if (!res.ok || !data || data.ok === false) {
      const msg = (data && data.message) || `로컬 Claude Code 호출 중 오류가 발생했습니다 (HTTP ${res.status}).`;
      throw new Error(msg);
    }
    return (data.text || '').trim();
  }
};
