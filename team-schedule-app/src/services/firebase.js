// Firestore 연동 어댑터
//
// 데모 모드: 실제 Firebase 프로젝트 설정(.env.local의 VITE_FIREBASE_*)이 없으면
// localStorage를 임시 저장소로 사용해 새로고침해도 상태가 유지되게만 한다.
// 운영 배포 시 아래 두 함수(loadEvents/persistEvents)를 Firestore
// collection('events') 의 onSnapshot/setDoc 호출로 교체하면 된다.
//
// 권장 Firestore 구조:
//   events/{eventId} = {
//     title, start, end, location, memo,
//     requester, manager, status,
//     googleCalendarEventId, createdAt, updatedAt
//   }
// 보안 규칙: 코디네이터는 read + create, 팀장은 read + update(status 전이)만 허용.

const STORAGE_KEY = 'team-schedule-app:events:v1';

export const FIREBASE_CONFIGURED = Boolean(
  typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_FIREBASE_API_KEY
);

export function loadPersistedEvents() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistEvents(events) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 저장 실패는 데모 기능에 치명적이지 않으므로 무시한다.
  }
}

export function resetPersistedEvents() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
