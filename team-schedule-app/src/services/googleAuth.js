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

// .env.local 값은 그대로 신뢰하지 않는다. 복사/붙여넣기 과정에서 앞뒤
// 공백이나 따옴표가 섞여 들어오면 Google 서버가 "invalid_client / Client
// missing a project id"처럼 원인을 알기 어려운 오류를 돌려주므로, 여기서
// 한 번 정리(trim, 따옴표 제거)하고 형식(.apps.googleusercontent.com로
// 끝나는지)까지 검증한다.
function sanitizeClientId(raw) {
  if (!raw) return '';
  let v = String(raw).trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const RAW_CLIENT_ID = typeof import.meta !== 'undefined' ? import.meta.env.VITE_GOOGLE_CLIENT_ID : undefined;
const CLIENT_ID = sanitizeClientId(RAW_CLIENT_ID);

export const GOOGLE_CONFIGURED = Boolean(CLIENT_ID);
// 형식까지 정상인지(끝이 .apps.googleusercontent.com이고 충분히 긴 값인지).
// 이메일 주소나 client secret을 잘못 넣은 경우도 대부분 여기서 걸러진다.
export const GOOGLE_CLIENT_ID_VALID =
  GOOGLE_CONFIGURED && CLIENT_ID.endsWith(CLIENT_ID_SUFFIX) && CLIENT_ID.length > CLIENT_ID_SUFFIX.length + 5;

// 화면에는 전체 값을 절대 보여주지 않고, 마지막 일부만 마스킹해서 노출한다.
export function maskedClientId() {
  if (!CLIENT_ID) return '';
  if (CLIENT_ID.length <= 10) return '••••';
  return `••••${CLIENT_ID.slice(-10)}`;
}

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
  if (!GOOGLE_CLIENT_ID_VALID) {
    throw new Error(
      'Google Client ID 형식이 올바르지 않습니다. ".apps.googleusercontent.com"으로 ' +
      '끝나는 값인지 확인해주세요. (구글연동설정.bat을 다시 실행해 값을 다시 입력하면 됩니다)'
    );
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

// ---- 세션(액세스 토큰) 저장 ----
// localStorage를 사용해 앱을 완전히 껐다가 다시 켜도(데스크톱 앱 창을 새로
// 열어도) 이전 로그인 정보가 남아있게 한다. 액세스 토큰 자체는 Google이
// 발급한 짧은 수명(보통 1시간)의 토큰이라 그대로 저장해도 유출 시 위험이
// 제한적이며, 순수 프론트엔드 토큰 클라이언트 방식에는애초에 refresh
// token이 발급되지 않는다. 만료된 토큰은 loadSession()에서 자동으로
// 무효 처리되고, 대신 EVER_CONNECTED_KEY를 별도로 남겨 "이전에 최소 한 번
// 연결에 성공한 사용자"인지를 기억한다 — 이 값이 있으면 앱 실행 시 사용자
// 상호작용 없이 조용히 토큰 재획득(prompt: '')을 시도하고, 그마저 실패할
// 때만(=Google 세션 자체가 끊긴 경우) "Google 캘린더 연결" 버튼을 다시
// 누르게 한다(Google Identity Services 권장 방식).
export function saveSession(session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* noop */
  }
}

export function loadSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
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
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

const EVER_CONNECTED_KEY = 'team-schedule-app:googleEverConnected';

export function hasEverConnectedGoogle() {
  try {
    return window.localStorage.getItem(EVER_CONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markEverConnectedGoogle() {
  try {
    window.localStorage.setItem(EVER_CONNECTED_KEY, '1');
  } catch {
    /* noop */
  }
}

export function clearEverConnectedGoogle() {
  try {
    window.localStorage.removeItem(EVER_CONNECTED_KEY);
  } catch {
    /* noop */
  }
}
