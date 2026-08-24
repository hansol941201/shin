// 공동 일정 백엔드(Firestore + Cloud Functions) 클라이언트.
//
// 이 모듈이 하는 일은 딱 두 가지뿐이다:
//   1) `events`/`googleEventsCache`/`settings/*` 컬렉션을 실시간(onSnapshot)
//      으로 구독해서 모든 접속자가 같은 데이터를 본다.
//   2) 추가/수정/삭제 등 쓰기 동작은 전부 Cloud Functions 콜러블 함수를
//      호출한다 — 이 클라이언트는 Firestore에 절대 직접 쓰지 않는다
//      (firestore.rules가 클라이언트 쓰기를 막아두기도 했다).
//
// Google Calendar API는 이 모듈이 직접 부르지 않는다. 서버(Cloud
// Functions)만 서비스 계정으로 Google을 호출하고, 그 결과를
// `googleEventsCache`에 미러링해두면 이 모듈은 그 컬렉션을 구독만 한다.
// 즉 이 프론트엔드 어디에도 Google OAuth Client ID/Secret/서비스 계정
// 키가 들어가지 않는다.
//
// VITE_FIREBASE_* 환경변수가 설정되어 있지 않으면(=아직 관리자가 백엔드
// 설정을 마치지 않은 상태) SHARED_BACKEND_CONFIGURED가 false가 되고,
// store.jsx는 기존 방식(로컬 localStorage + 사용자 Google OAuth)을 그대로
// 쓴다 — 이 파일이 존재한다고 해서 기존 동작이 바뀌지 않는다.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const SHARED_BACKEND_CONFIGURED = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

// 이 앱 고유의 Firebase 프로젝트다 — "다른 팀 Firebase"(legacyScheduleAdapter.js)
// 와는 완전히 별개이므로 앱 인스턴스 이름도 분리한다.
const APP_NAME = 'teamScheduleShared';
const FUNCTIONS_REGION = 'asia-northeast3';

function getApp() {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp(FIREBASE_CONFIG, APP_NAME);
}

let dbInstance = null;
function getDb() {
  if (!dbInstance) dbInstance = getFirestore(getApp());
  return dbInstance;
}

let functionsInstance = null;
function getFns() {
  if (!functionsInstance) functionsInstance = getFunctions(getApp(), FUNCTIONS_REGION);
  return functionsInstance;
}

// ---------------------------------------------------------------------
// 편집 토큰 — "편집 코드" 원문이 아니라, 서버가 검증 성공 후 내려준
// 만료시간이 있는 불투명 토큰만 저장한다. 코드 자체는 브라우저 어디에도
// 남지 않는다.
// ---------------------------------------------------------------------
const EDIT_TOKEN_KEY = 'team-schedule-app:editToken';

export function getEditToken() {
  try {
    return window.localStorage.getItem(EDIT_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function setEditToken(token) {
  try {
    if (token) window.localStorage.setItem(EDIT_TOKEN_KEY, token);
    else window.localStorage.removeItem(EDIT_TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export function clearEditToken() {
  setEditToken('');
}

export function hasEditToken() {
  return Boolean(getEditToken());
}

export async function verifyEditCode(code) {
  const fn = httpsCallable(getFns(), 'verifyEditCode');
  const res = await fn({ code });
  setEditToken(res.data.token);
  return { ok: true };
}

// 쓰기성 콜러블 공통 래퍼. 토큰이 없거나(=아직 편집 코드 확인 전) 서버가
// unauthenticated를 돌려주면(=토큰 만료) needsEditCode를 true로 표시해서
// 호출부(store.jsx)가 편집 코드 팝업을 띄우게 한다.
function callable(name) {
  const fn = httpsCallable(getFns(), name);
  return async (payload = {}) => {
    const token = getEditToken();
    if (!token) return { needsEditCode: true };
    try {
      const res = await fn({ token, ...payload });
      if (res.data?.error) return { error: res.data.error };
      return res.data || { ok: true };
    } catch (err) {
      if (err?.code === 'functions/unauthenticated') {
        clearEditToken();
        return { needsEditCode: true };
      }
      return { error: err?.message || '요청 처리 중 오류가 발생했습니다.' };
    }
  };
}

export const addRequest = callable('addRequest');
export const addPersonalEvent = callable('addPersonalEvent');
export const addAndConfirmRequest = callable('addAndConfirmRequest');
export const acceptRequest = callable('acceptRequest');
export const rejectRequest = callable('rejectRequest');
export const proposeReschedule = callable('proposeReschedule');
export const acceptReschedule = callable('acceptReschedule');
export const cancelReschedule = callable('cancelReschedule');
export const cancelOwnRequest = callable('cancelOwnRequest');
export const updateEvent = callable('updateEvent');
export const deleteEventAction = callable('deleteEventAction');
export const toggleAccompany = callable('toggleAccompany');

// 관리자 설정 화면의 "지금 동기화" 버튼용 — 편집 코드 없이도 부를 수 있게
// 별도 처리(서버 함수 자체는 편집 토큰을 요구하지 않는다).
export async function refreshGoogleEvents() {
  const fn = httpsCallable(getFns(), 'refreshGoogleEvents');
  try {
    const res = await fn({});
    if (res.data?.error) return { error: res.data.error };
    return { ok: true };
  } catch (err) {
    return { error: err?.message || '동기화 요청 중 오류가 발생했습니다.' };
  }
}

// ---------------------------------------------------------------------
// 실시간 구독
// ---------------------------------------------------------------------
export function subscribeEvents(onData) {
  return onSnapshot(collection(getDb(), 'events'), (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// googleEventsCache 문서는 Cloud Functions가 Google Calendar API 응답을
// 그대로 미러링해둔 것(functions/index.js의 runGoogleSync 참고) — 여기서는
// 기존 googleCalendar.js의 mapGoogleEvent()가 만들던 것과 동일한 모양으로
// 한 번 더 감싸서, 화면 쪽(MonthView 등) 코드는 전혀 손대지 않아도 되게 한다.
export function subscribeGoogleEventsCache(onData) {
  return onSnapshot(collection(getDb(), 'googleEventsCache'), (snap) => {
    onData(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: `google_${d.id}`,
          googleEventId: d.id,
          googleCalendarEventId: d.id,
          calendarId: 'primary',
          title: data.title,
          start: data.start,
          end: data.end,
          allDay: Boolean(data.allDay),
          location: data.location || '',
          memo: data.memo || '',
          requester: '팀장',
          manager: '팀장',
          status: 'confirmed',
          createdAt: data.updatedAt,
          updatedAt: data.updatedAt,
          source: 'google',
        };
      })
    );
  });
}

export function subscribeAccompanyIds(onData) {
  return onSnapshot(doc(getDb(), 'settings', 'accompany'), (snap) => {
    onData(new Set(snap.exists() ? snap.data().ids || [] : []));
  });
}

// 관리자 진단 화면용 — Google 서버 동기화 상태(정상/실패/마지막 시각).
export function subscribeSyncStatus(onData) {
  return onSnapshot(doc(getDb(), 'settings', 'sync'), (snap) => {
    onData(snap.exists() ? snap.data() : null);
  });
}
