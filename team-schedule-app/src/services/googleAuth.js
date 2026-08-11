// Google Identity Services(GIS) 기반 OAuth 2.0 로그인.
// 백엔드 서버 없이 브라우저에서만 동작하는 "토큰 클라이언트" 방식이라
// 비밀번호는 물론 client secret도 이 앱 어디에도 저장하지 않는다.
//
// 요청 범위(scope)는 다음 두 가지 + 로그인한 계정 표시용 최소 정보로 제한한다.
//   - https://www.googleapis.com/auth/calendar.readonly  (캘린더 목록/일정 조회)
//   - https://www.googleapis.com/auth/calendar.events     (확정 일정 생성)
//   - openid email profile                                (헤더에 보여줄 이메일만)
// 캘린더를 삭제/공유설정 변경하는 등 더 넓은 권한(https://www.googleapis.com/auth/calendar)은
// 요청하지 않는다.

const CLIENT_ID = typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_CLIENT_ID : undefined;
export const GOOGLE_CONFIGURED = Boolean(CLIENT_ID);

export const GOOGLE_SCOPES =
  'openid email profile ' +
  'https://www.googleapis.com/auth/calendar.readonly ' +
  'https://www.googleapis.com/auth/calendar.events';

const SESSION_KEY = 'team-schedule-app:googleSession';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise = null;
let tokenClient = null;
let pendingResolve = null;
let pendingReject = null;

export function loadGisScript() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경이 아닙니다.'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const onReady = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'));
    };
    if (existing) {
      existing.addEventListener('load', onReady, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

function getTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: GOOGLE_SCOPES,
    callback: (response) => {
      if (response.error) {
        if (pendingReject) pendingReject(response);
        return;
      }
      if (pendingResolve) pendingResolve(response);
    },
    error_callback: (err) => {
      if (pendingReject) pendingReject(err);
    },
  });
  return tokenClient;
}

// prompt: '' (silent, 이미 동의한 사용자만 성공) | 'consent' (매번 동의 화면)
export async function requestAccessToken({ prompt = 'consent' } = {}) {
  if (!GOOGLE_CONFIGURED) {
    throw new Error('VITE_GOOGLE_CLIENT_ID가 설정되어 있지 않습니다.');
  }
  await loadGisScript();
  const client = getTokenClient();
  return new Promise((resolve, reject) => {
    pendingResolve = (response) => {
      pendingResolve = null;
      pendingReject = null;
      resolve(response);
    };
    pendingReject = (err) => {
      pendingResolve = null;
      pendingReject = null;
      reject(err);
    };
    client.requestAccessToken({ prompt });
  });
}

export function revokeAccessToken(accessToken) {
  return new Promise((resolve) => {
    if (!accessToken || !window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    window.google.accounts.oauth2.revoke(accessToken, () => resolve());
  });
}

export async function fetchUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ---- 세션(액세스 토큰) 임시 저장: sessionStorage만 사용(탭 닫으면 사라짐) ----
// refresh token은 순수 프론트엔드 토큰 클라이언트 방식에서 발급되지 않으므로
// 만료되면 사용자가 다시 "Google 캘린더 연결"을 눌러야 한다(문서화됨).
export function saveSession(session) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* noop */
  }
}

export function loadSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.accessToken || !session?.expiresAt) return null;
    if (Date.now() >= session.expiresAt - 30000) return null; // 만료 임박이면 무효 처리
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
