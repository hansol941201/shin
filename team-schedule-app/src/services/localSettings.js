// 브라우저에만 저장되는 작은 환경설정 값들 (비밀번호/토큰 아님).
// - demoMode: Google 연동이 안 됐을 때만 쓰는 개발용 샘플 데이터 스위치
// - managerCalendarId: 코디네이터가 선택한 "팀장님 캘린더"의 Google calendarId

const DEMO_MODE_KEY = 'team-schedule-app:demoMode';
const MANAGER_CALENDAR_KEY = 'team-schedule-app:managerCalendarId';

export function getDemoModeFlag() {
  try {
    return window.localStorage.getItem(DEMO_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDemoModeFlag(enabled) {
  try {
    window.localStorage.setItem(DEMO_MODE_KEY, enabled ? '1' : '0');
  } catch {
    /* noop */
  }
}

export function getManagerCalendarId() {
  try {
    return window.localStorage.getItem(MANAGER_CALENDAR_KEY) || '';
  } catch {
    return '';
  }
}

export function setManagerCalendarId(calendarId) {
  try {
    if (calendarId) window.localStorage.setItem(MANAGER_CALENDAR_KEY, calendarId);
    else window.localStorage.removeItem(MANAGER_CALENDAR_KEY);
  } catch {
    /* noop */
  }
}
