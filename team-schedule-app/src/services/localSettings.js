// 브라우저에만 저장되는 작은 환경설정 값들 (비밀번호/토큰 아님).
// - demoMode: Google 연동이 안 됐을 때만 쓰는 개발용 샘플 데이터 스위치
// - managerCalendarId: 코디네이터가 선택한 "팀장님 캘린더"의 Google calendarId
// - reminderMode/reminderMinutes: 팀장 Google Calendar에 확정 일정을 만들 때
//   붙일 알림(reminders) 설정. 'google_default'면 캘린더 자체 기본 알림을
//   그대로 쓰고(useDefault:true), 'app'이면 이 앱이 지정한 분(minutes) 전
//   팝업 알림을 명시적으로 붙인다.
// - accompanyIds: "한솔 동행" 표시가 켜진 일정의 식별자 목록. 원본 일정을
//   복제하지 않고 이 id 목록만 이 앱 저장소에 따로 저장한다 — Google
//   Calendar/공유 Firebase 어느 쪽에도 쓰지 않는다. 식별자는 Google
//   일정이면 googleEventId, 공유 일정이면 그 일정의 id를 그대로 쓴다.

const DEMO_MODE_KEY = 'team-schedule-app:demoMode';
const MANAGER_CALENDAR_KEY = 'team-schedule-app:managerCalendarId';
const REMINDER_MODE_KEY = 'team-schedule-app:reminderMode';
const REMINDER_MINUTES_KEY = 'team-schedule-app:reminderMinutes';
const ACCOMPANY_IDS_KEY = 'team-schedule-app:hansolAccompanyIds';

export const REMINDER_MINUTE_OPTIONS = [
  { value: 10, label: '10분 전' },
  { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' },
  { value: 1440, label: '하루 전' },
];

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

// 기본값: 앱이 지정한 알림(30분 전) 사용.
export function getReminderMode() {
  try {
    const v = window.localStorage.getItem(REMINDER_MODE_KEY);
    return v === 'google_default' ? 'google_default' : 'app';
  } catch {
    return 'app';
  }
}

export function setReminderMode(mode) {
  try {
    window.localStorage.setItem(REMINDER_MODE_KEY, mode === 'google_default' ? 'google_default' : 'app');
  } catch {
    /* noop */
  }
}

export function getReminderMinutes() {
  try {
    const v = Number(window.localStorage.getItem(REMINDER_MINUTES_KEY));
    return REMINDER_MINUTE_OPTIONS.some((o) => o.value === v) ? v : 30;
  } catch {
    return 30;
  }
}

export function setReminderMinutes(minutes) {
  try {
    window.localStorage.setItem(REMINDER_MINUTES_KEY, String(minutes));
  } catch {
    /* noop */
  }
}

export function getAccompanyIds() {
  try {
    const raw = window.localStorage.getItem(ACCOMPANY_IDS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function setAccompanyIds(ids) {
  try {
    window.localStorage.setItem(ACCOMPANY_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* noop */
  }
}
