// Google Calendar 연동 어댑터
//
// 지금은 실제 Google OAuth / Calendar API 자격증명이 구성되어 있지 않으므로
// "데모 모드"로 동작한다 (샘플 데이터를 캘린더 응답처럼 반환).
//
// 실제 연동 방법(운영 배포 시 해야 할 일):
// 1. Google Cloud Console에서 OAuth 2.0 클라이언트(웹 애플리케이션) 생성,
//    Calendar API 활성화.
// 2. .env.local 에 VITE_GOOGLE_CLIENT_ID 설정.
// 3. src/services/googleAuth.js(신규)에서 google.accounts.oauth2 로 로그인,
//    access_token 을 이 파일의 fetch 함수들에 Authorization 헤더로 전달.
// 4. 아래 데모 함수들을 실제 fetch('https://www.googleapis.com/calendar/v3/...') 호출로 교체.
//    - list events: GET /calendars/primary/events?timeMin&timeMax
//    - create event: POST /calendars/primary/events
//    - update event: PATCH /calendars/primary/events/{eventId}
// 5. 삼성 캘린더는 Google 계정과의 동기화 설정을 팀장님이 삼성 캘린더 앱에서
//    이미 켜 두었다면 Google Calendar에 생성된 이벤트가 자동으로 반영된다.
//    (플랫폼에서 삼성 캘린더를 직접 제어하지 않는다.)

export const GOOGLE_CALENDAR_CONFIGURED = Boolean(
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID
);

export async function fetchManagerEvents(/* weekStart, weekEnd */) {
  // TODO(실연동): Google Calendar Events.list 호출로 대체.
  // 지금은 상위 store가 sampleData를 사용하므로 여기서는 빈 배열을 반환한다.
  return [];
}

export async function createManagerEvent(/* eventDraft */) {
  // TODO(실연동): Events.insert 호출 후 반환된 이벤트 id를 googleCalendarEventId로 저장.
  return { googleCalendarEventId: null, ok: false, reason: 'not_configured' };
}

export async function updateManagerEvent(/* googleCalendarEventId, patch */) {
  // TODO(실연동): Events.patch 호출.
  return { ok: false, reason: 'not_configured' };
}
