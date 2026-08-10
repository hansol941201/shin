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
const LOCAL_SERVER_HEALTH_TIMEOUT_MS = 1500;

const AiProvider = {
  _localServerAvailable: false,
  _localServerChecked: false,

  /**
   * 로컬 서버(AI전략회의실.bat이 띄운 claude CLI 브릿지)가 떠 있는지 확인한다.
   * app.js가 화면을 그리기 전에 한 번 호출해서 결과를 캐시해둔다.
   * file://로 index.html을 직접 열었거나(.bat을 안 쓴 경우) 서버가 아직
   * 안 켜졌으면 정상적으로 false를 반환한다 — 이 경우 실제 회의는 진행하지
   * 않고, 연결이 필요하다는 안내만 명확히 보여준다(데모로 몰래 대체하지 않는다).
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

  /** 실제 AI 연결이 가능한 상태인지 (= 로컬 Claude Code 서버 연결 여부) */
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
