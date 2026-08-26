import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildSampleEvents } from './sampleData.js';
import { DEFAULT_SETTINGS, getWeekStart, addDays } from '../utils/time.js';
import * as googleCalendarApi from '../services/googleCalendar.js';
import { subscribeSharedSchedules } from '../services/legacyScheduleAdapter.js';
import {
  GOOGLE_CONFIGURED,
  GOOGLE_CLIENT_ID_VALID,
  IS_DEV,
  maskedClientId,
  requestAccessToken,
  revokeAccessToken,
  fetchUserInfo,
  clearSession,
  hasEverConnectedGoogle,
  markEverConnectedGoogle,
  clearEverConnectedGoogle,
  getLastConnectedEmail,
  setLastConnectedEmail,
} from '../services/googleAuth.js';
import {
  getDemoModeFlag,
  setDemoModeFlag,
  getManagerCalendarId,
  setManagerCalendarId as persistManagerCalendarId,
  getReminderMode,
  setReminderMode as persistReminderMode,
  getReminderMinutes,
  setReminderMinutes as persistReminderMinutes,
} from '../services/localSettings.js';

// 다른 provider(SharedAppProvider, sharedStore.jsx)도 같은 context를 그대로
// 써서 useApp()이 어느 provider 아래에서든 동일하게 동작하게 한다 —
// AppProvider 자체의 로직은 아래 그대로 두고 절대 건드리지 않는다.
export const AppContext = createContext(null);

// Google 로그인 실패 원인을 콘솔이 아니라 화면에 한글로 보여주기 위한 매핑.
// requestAccessToken()이 던지는 일반 Error(형식 오류 등)와, GIS 콜백이
// 넘겨주는 { error, error_description } 형태를 모두 처리한다.
function describeGoogleAuthError(err) {
  if (err instanceof Error && err.message) return err.message;
  const code = err?.error || err?.type;
  if (code === 'popup_closed_by_user' || code === 'popup_closed') {
    return '로그인 창을 닫아서 연결이 취소되었습니다.';
  }
  if (code === 'access_denied') {
    return '권한 요청을 거부했습니다. 다시 연결하려면 모든 권한에 동의해주세요.';
  }
  if (code === 'invalid_client') {
    return (
      'Google Client ID가 올바르지 않습니다("invalid_client"). ' +
      (IS_DEV
        ? '구글연동설정.bat으로 Client ID를 다시 확인/입력해주세요.'
        : '저장소 Secret(VITE_GOOGLE_CLIENT_ID) 값을 확인한 뒤 재배포해주세요.')
    );
  }
  if (err?.error_description) return err.error_description;
  return 'Google 로그인에 실패했거나 취소되었습니다.';
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // 팀장 전용 달력이다 — 역할/화면 전환 개념 자체가 없다.
  const [cursorDate, setCursorDate] = useState(() => new Date());

  // 상단 검색창에서 결과를 클릭했을 때 "그 일정이 있는 달로 이동 + 상세
  // 팝오버 열기"를 하기 위한 상태. 검색 시점에 이미 찾아낸 event 객체를
  // 그대로 들고 있다가 MonthView가 화면에 그 상세를 띄운 뒤 비운다(같은
  // id를 다시 조회하지 않으므로 월 이동에 따른 재조회 타이밍 문제가 없음).
  const [focusedEvent, setFocusedEvent] = useState(null);
  const focusEvent = useCallback((event) => {
    if (!event) return;
    const start = new Date(event.start);
    setCursorDate(new Date(start.getFullYear(), start.getMonth(), 1));
    setFocusedEvent(event);
  }, []);
  const clearFocusedEvent = useCallback(() => setFocusedEvent(null), []);

  const [demoMode, setDemoModeState] = useState(getDemoModeFlag);

  // ---------------------------------------------------------------------
  // 공유 일정(다른 팀 Firebase, 읽기 전용): Google 연동 여부와 무관하게
  // 앱이 열리는 즉시 항상 구독을 시작한다 — 완전히 별도의 실시간 소스다.
  // 이 앱은 이 데이터를 절대 쓰지/지우지 않는다(subscribeSharedSchedules
  // 내부도 onValue만 사용, set/update/remove 없음).
  // ---------------------------------------------------------------------
  const [sharedEvents, setSharedEvents] = useState([]);
  const [sharedStatus, setSharedStatus] = useState({ ok: null, message: '연결 확인 중…' });

  useEffect(() => {
    const unsubscribe = subscribeSharedSchedules(setSharedEvents, setSharedStatus);
    return () => {
      unsubscribe();
    };
  }, []);

  const setDemoMode = useCallback((next) => {
    setDemoModeState(next);
    setDemoModeFlag(next);
  }, []);

  // ---------------------------------------------------------------------
  // Google 로그인 상태
  // ---------------------------------------------------------------------
  const [googleSignedIn, setGoogleSignedIn] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [googleUserEmail, setGoogleUserEmail] = useState('');
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState('');

  const [calendars, setCalendars] = useState([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);
  const [calendarsError, setCalendarsError] = useState('');
  const [managerCalendarId, setManagerCalendarIdState] = useState(getManagerCalendarId);

  // 확정 일정을 Google Calendar에 만들 때 붙일 알림 설정. 'app'이면 아래
  // reminderMinutes(기본 30분) 전 팝업 알림을 명시 붙이고, 'google_default'
  // 면 팀장님이 그 캘린더에 이미 설정해둔 기본 알림을 그대로 쓴다.
  const [reminderMode, setReminderModeState] = useState(getReminderMode);
  const [reminderMinutes, setReminderMinutesState] = useState(getReminderMinutes);

  const setReminderMode = useCallback((mode) => {
    setReminderModeState(mode);
    persistReminderMode(mode);
  }, []);
  const setReminderMinutes = useCallback((minutes) => {
    setReminderMinutesState(minutes);
    persistReminderMinutes(minutes);
  }, []);

  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleEventsLoading, setGoogleEventsLoading] = useState(false);
  const [googleEventsError, setGoogleEventsError] = useState('');
  // 앱을 새로 열었을 때 "이전에 연결한 적이 있는데 조용히 재연결을 시도
  // 중"인지 표시하기 위한 상태. 이 동안은 "Google 캘린더 연결" 버튼을
  // 성급하게 노출하지 않는다(잠깐 껐다 켰다 하는 것처럼 보이는 걸 방지).
  const [googleRestoring, setGoogleRestoring] = useState(GOOGLE_CONFIGURED && GOOGLE_CLIENT_ID_VALID);

  const googleActive = GOOGLE_CONFIGURED && googleSignedIn && Boolean(managerCalendarId) && Boolean(accessToken);

  // 로그인한 Google 계정이 지난번과 달라졌으면, 예전 계정 기준으로
  // 기억해둔 팀장 캘린더 선택을 그대로 쓰지 않고 초기화해서 다시
  // 고르게 한다(같은 계정이면 아무것도 하지 않고 그대로 유지).
  const reconcileAccountEmail = useCallback((email) => {
    if (!email) return;
    const last = getLastConnectedEmail();
    if (last && last !== email) {
      setManagerCalendarIdState('');
      persistManagerCalendarId('');
    }
    setLastConnectedEmail(email);
  }, []);

  const loadCalendars = useCallback(async (token) => {
    const tok = token;
    if (!tok) return;
    setCalendarsLoading(true);
    setCalendarsError('');
    const res = await googleCalendarApi.fetchCalendarList(tok);
    setCalendarsLoading(false);
    if (!res.ok) {
      setCalendarsError(res.message);
      return;
    }
    setCalendars(res.calendars);
  }, []);

  // 앱을 껐다가 다시 켜도(탭 새로고침 포함) 매번 "Google 캘린더 연결"을
  // 다시 누를 필요가 없도록, access token은 저장하지 않고 매번 조용히
  // 다시 발급받는 방식으로 세션을 복원한다.
  // 1) 예전에 최소 한 번이라도 연결에 성공한 적이 있다면(hasEverConnectedGoogle),
  //    사용자 상호작용 없이 조용히 토큰 재획득(prompt: '')을 시도한다. 이미
  //    이 브라우저에 Google 로그인이 되어 있고 이 앱에 동의한 이력이 있으면
  //    보통 팝업 없이 성공한다(Google Identity Services 권장 방식).
  // 2) 실패하면(=Google 세션 자체가 끊겼거나 동의가 철회된 경우 — 예: 계정
  //    로그아웃, 권한 철회, 브라우저 정책으로 자동 인증 불가) 조용히 포기
  //    하고 "Google 다시 연결" 버튼을 그대로 보여준다 — 오류 팝업을
  //    띄우지 않는다. 매번 무조건 연결 버튼을 보여주는 게 아니라, 이
  //    자동 재획득이 실패했을 때만 버튼을 노출하는 것이 핵심이다.
  useEffect(() => {
    // 과거 버전이 localStorage에 남겨뒀을 수 있는 access token 흔적 정리.
    clearSession();

    if (!GOOGLE_CONFIGURED || !GOOGLE_CLIENT_ID_VALID) {
      setGoogleRestoring(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // 조용한 재연결 시도는 화면을 무한정 "연결 확인 중…"으로 막아두면
        // 안 되므로 짧게 시간 제한을 둔다(정상적으로 성공/실패하면 보통
        // 1~2초 안에 끝나고, 네트워크 상태에 따라 오래 걸리는 경우에도
        // 사용자가 금방 직접 버튼을 누를 수 있게 한다).
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('silent-reauth-timeout')), 6000));
        const response = await Promise.race([requestAccessToken({ prompt: '' }), timeout]);
        if (cancelled) return;
        const info = await fetchUserInfo(response.access_token);
        if (cancelled) return;
        // access token은 여기서 끝 — localStorage에는 저장하지 않고
        // React state(메모리)에만 둔다.
        setAccessToken(response.access_token);
        setGoogleUserEmail(info?.email || '');
        reconcileAccountEmail(info?.email || '');
        setGoogleSignedIn(true);
        await loadCalendars(response.access_token);
      } catch {
        // 조용히 실패 처리: 사용자가 직접 "Google 다시 연결"을 누르게 둔다.
      } finally {
        if (!cancelled) setGoogleRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInGoogle = useCallback(async () => {
    setGoogleAuthLoading(true);
    setGoogleAuthError('');
    try {
      // 버튼 클릭은 실제 사용자 제스처이므로(페이지 로드 시 자동 시도와 달리
      // 팝업 차단에 걸리지 않는다) 먼저 조용히(prompt: '') 재사용을 시도한다.
      // 이미 이 브라우저에 Google 로그인이 되어 있고 이 앱에 동의한 이력이
      // 있으면, 무거운 계정 선택/동의 화면 없이 거의 즉시 성공한다. 그
      // 조건이 하나라도 안 맞아 실패할 때만 정식 동의 화면(prompt:
      // 'consent')으로 넘어간다 — 최초 연결이거나 권한이 철회된 경우.
      let response;
      try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('silent-reauth-timeout')), 6000));
        response = await Promise.race([requestAccessToken({ prompt: '' }), timeout]);
      } catch {
        response = await requestAccessToken({ prompt: 'consent' });
      }
      const info = await fetchUserInfo(response.access_token);
      // access token은 localStorage에 저장하지 않는다 — "다음에도 이
      // 계정으로 연결한 적이 있다"는 사실만 markEverConnectedGoogle()로
      // 기억해두고, 실제 토큰은 React state(메모리)에만 둔다.
      markEverConnectedGoogle();
      setAccessToken(response.access_token);
      setGoogleUserEmail(info?.email || '');
      reconcileAccountEmail(info?.email || '');
      setGoogleSignedIn(true);
      await loadCalendars(response.access_token);
    } catch (err) {
      setGoogleAuthError(describeGoogleAuthError(err));
    } finally {
      setGoogleAuthLoading(false);
    }
  }, [loadCalendars, reconcileAccountEmail]);

  // 사용자가 명시적으로 연결을 끊는 경우에만 "다음에 앱을 열 때도 조용히
  // 재연결을 시도"하는 표시(everConnected)까지 지운다. 그래야 로그아웃한
  // 뒤 앱을 다시 열었을 때 또 자동으로 연결되는 이상한 상황을 피한다.
  const signOutGoogle = useCallback(async () => {
    await revokeAccessToken(accessToken);
    clearSession();
    clearEverConnectedGoogle();
    setAccessToken(null);
    setGoogleUserEmail('');
    setGoogleSignedIn(false);
    setCalendars([]);
    setGoogleEvents([]);
    setCalendarsError('');
    setGoogleEventsError('');
  }, [accessToken]);

  const selectManagerCalendar = useCallback((id) => {
    setManagerCalendarIdState(id);
    persistManagerCalendarId(id);
  }, []);

  // ---------------------------------------------------------------------
  // 현재 보고 있는 월간 범위의 Google 일정 조회
  // ---------------------------------------------------------------------
  const visibleRange = useMemo(() => {
    const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const gridStart = getWeekStart(monthAnchor);
    return { start: gridStart, end: addDays(gridStart, 42) };
  }, [cursorDate]);

  const fetchGoogleEvents = useCallback(async () => {
    if (!googleActive) return;
    setGoogleEventsLoading(true);
    setGoogleEventsError('');
    const res = await googleCalendarApi.fetchEvents({
      accessToken,
      calendarId: managerCalendarId,
      timeMinISO: visibleRange.start.toISOString(),
      timeMaxISO: visibleRange.end.toISOString(),
      settings,
    });
    setGoogleEventsLoading(false);
    if (!res.ok) {
      setGoogleEventsError(res.message);
      if (res.code === 'UNAUTHORIZED') {
        // 토큰이 만료된 상태 -> 로그인 정보 초기화(사용자가 다시 연결하도록)
        clearSession();
        setAccessToken(null);
        setGoogleSignedIn(false);
      }
      return;
    }
    setGoogleEvents(res.events);
  }, [googleActive, accessToken, managerCalendarId, visibleRange, settings]);

  useEffect(() => {
    fetchGoogleEvents();
  }, [fetchGoogleEvents]);

  // 팀장님이 휴대폰 Google 캘린더에서 추가·수정·삭제한 일정도 이 화면에
  // 자동 반영한다. 페이지가 열려 있는 동안 1분마다 갱신하고, 다른 앱이나
  // 잠금 화면에서 돌아온 즉시 한 번 더 갱신한다.
  useEffect(() => {
    if (!googleActive) return undefined;

    const refresh = () => {
      if (document.visibilityState === 'visible') fetchGoogleEvents();
    };
    const intervalId = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [googleActive, fetchGoogleEvents]);

  // 화면에 보여줄 최종 일정 목록: Google 확정 일정 + 다른 팀 공유 일정
  // (읽기 전용) + (Google 미연동일 때만) 데모 샘플 일정.
  const events = useMemo(() => {
    // 공유 일정(다른 팀 Firebase)이 Google Calendar에도 같은 내용으로
    // 이미 등록돼 있으면 화면에 두 번 보이지 않도록 걸러낸다. 판단 기준:
    // 같은 날짜 + 시작 시각이 5분 이내로 같음 + 제목이(공백 무시) 서로
    // 같거나 한쪽을 포함 — 확실하지 않으면 중복으로 보지 않는다.
    const isDuplicateOfGoogle = (shared, googleList) => {
      const sStart = new Date(shared.start);
      return googleList.some((g) => {
        const gStart = new Date(g.start);
        if (
          gStart.getFullYear() !== sStart.getFullYear() ||
          gStart.getMonth() !== sStart.getMonth() ||
          gStart.getDate() !== sStart.getDate()
        ) {
          return false;
        }
        if (Math.abs(gStart.getTime() - sStart.getTime()) > 5 * 60000) return false;
        const a = (g.title || '').replace(/\s+/g, '').toLowerCase();
        const b = (shared.title || '').replace(/\s+/g, '').toLowerCase();
        if (!a || !b) return false;
        return a === b || a.includes(b) || b.includes(a);
      });
    };

    const sharedVisible = sharedEvents.filter((s) => !isDuplicateOfGoogle(s, googleEvents));

    if (googleActive) return [...googleEvents, ...sharedVisible];
    // Google 미연동 상태에서는 개발/시연용 샘플 일정만 대신 보여준다
    // (한 번 실행마다 매번 새로 만들면 화면이 계속 바뀌어 보이므로,
    // 그 주의 월요일 기준으로 고정해서 만든다).
    const sample = demoMode ? buildSampleEvents(getWeekStart(new Date())) : [];
    return [...sample, ...sharedVisible];
  }, [googleActive, googleEvents, sharedEvents, demoMode]);

  // 일정 추가 — 팀장 전용 달력이라 승인 절차 없이 곧바로 확정하고 실제
  // Google Calendar에 생성한다. Google이 연동되어 있지 않으면 추가할 수
  // 없다(어디에도 쓸 곳이 없으므로).
  const addEvent = useCallback(
    async (draft) => {
      if (!googleActive) {
        return { error: 'Google Calendar가 연결되어 있지 않아 일정을 추가할 수 없습니다.' };
      }
      const conflict = await googleCalendarApi.hasConflict({
        accessToken,
        calendarId: managerCalendarId,
        startISO: draft.start,
        endISO: draft.end,
      });
      if (!conflict.ok) {
        if (conflict.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: conflict.message };
      }
      if (conflict.conflict) {
        return { error: '해당 시간에 이미 다른 일정이 등록되어 있습니다.\n다른 시간을 선택해주세요.' };
      }

      const created = await googleCalendarApi.createEvent({
        accessToken,
        calendarId: managerCalendarId,
        title: draft.title,
        location: draft.location,
        description: draft.memo,
        startISO: draft.start,
        endISO: draft.end,
        reminders: googleCalendarApi.buildReminders(reminderMode, reminderMinutes),
      });
      if (!created.ok) {
        if (created.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: `Google Calendar 일정 등록에 실패했습니다.\n${created.message}` };
      }

      await fetchGoogleEvents();
      return { ok: true };
    },
    [googleActive, accessToken, managerCalendarId, reminderMode, reminderMinutes, signOutGoogle, fetchGoogleEvents]
  );

  // 일정 수정 — Google 확정 일정만 대상이다(공유 일정은 읽기 전용이라
  // 이 함수에 도달하지 않도록 EventDetailPopover가 이미 막아둔다).
  const updateEvent = useCallback(
    async (id, patch) => {
      const target = events.find((e) => e.id === id);
      if (!target) return { error: '일정을 찾을 수 없습니다.' };
      if (target.source !== 'google' || !target.googleCalendarEventId) {
        return { error: '이 일정은 수정할 수 없습니다.' };
      }

      const nextStart = patch.start ?? target.start;
      const nextEnd = patch.end ?? target.end;
      if (new Date(nextStart) >= new Date(nextEnd)) {
        return { error: '시작 시간이 종료 시간보다 빨라야 합니다.' };
      }

      const calendarId = target.calendarId || managerCalendarId;
      const conflict = await googleCalendarApi.hasConflict({
        accessToken,
        calendarId,
        startISO: nextStart,
        endISO: nextEnd,
        excludeEventId: target.googleCalendarEventId,
      });
      if (!conflict.ok) {
        if (conflict.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: conflict.message };
      }
      if (conflict.conflict) {
        return { error: '해당 시간에 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
      }

      const patched = await googleCalendarApi.patchEvent({
        accessToken,
        calendarId,
        eventId: target.googleCalendarEventId,
        title: patch.title,
        location: patch.location,
        description: patch.memo,
        startISO: patch.start,
        endISO: patch.end,
        // 일정 수정 시에도 현재 알림 설정을 다시 실어 보내 변경된 시간
        // 기준으로 알림이 유지되게 한다.
        reminders: googleCalendarApi.buildReminders(reminderMode, reminderMinutes),
      });
      if (!patched.ok) {
        if (patched.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: patched.message };
      }

      await fetchGoogleEvents();
      return { ok: true };
    },
    [events, accessToken, managerCalendarId, reminderMode, reminderMinutes, signOutGoogle, fetchGoogleEvents]
  );

  // 일정 삭제 — Google 확정 일정만 대상이다.
  const deleteEventAction = useCallback(
    async (id) => {
      const target = events.find((e) => e.id === id);
      if (!target) return { error: '일정을 찾을 수 없습니다.' };
      if (target.source !== 'google' || !target.googleCalendarEventId) {
        return { error: '이 일정은 삭제할 수 없습니다.' };
      }

      const calendarId = target.calendarId || managerCalendarId;
      const deleted = await googleCalendarApi.deleteEvent({
        accessToken,
        calendarId,
        eventId: target.googleCalendarEventId,
      });
      if (!deleted.ok) {
        if (deleted.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: deleted.message };
      }

      await fetchGoogleEvents();
      return { ok: true };
    },
    [events, accessToken, managerCalendarId, signOutGoogle, fetchGoogleEvents]
  );

  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      cursorDate,
      setCursorDate,
      events,
      addEvent,
      updateEvent,
      deleteEventAction,
      // 상단 검색창 → 일정 클릭 시 이동
      focusedEvent,
      focusEvent,
      clearFocusedEvent,
      // Google 연동
      googleConfigured: GOOGLE_CONFIGURED,
      googleClientIdValid: GOOGLE_CLIENT_ID_VALID,
      googleClientIdMasked: maskedClientId(),
      googleActive,
      googleSignedIn,
      googleUserEmail,
      googleAuthLoading,
      googleAuthError,
      googleRestoring,
      signInGoogle,
      signOutGoogle,
      calendars,
      calendarsLoading,
      calendarsError,
      managerCalendarId,
      selectManagerCalendar,
      googleEventsLoading,
      googleEventsError,
      refreshGoogleEvents: fetchGoogleEvents,
      // Google 일정 알림(reminders) 설정
      reminderMode,
      setReminderMode,
      reminderMinutes,
      setReminderMinutes,
      // 공유 일정(다른 팀 Firebase, 읽기 전용) 연동 상태 — 설정 화면 진단용
      sharedStatus,
      sharedEventCount: sharedEvents.length,
      // 데모 모드(개발용)
      demoMode,
      setDemoMode,
    }),
    [
      settings,
      updateSettings,
      cursorDate,
      events,
      addEvent,
      updateEvent,
      deleteEventAction,
      focusedEvent,
      focusEvent,
      clearFocusedEvent,
      googleActive,
      googleSignedIn,
      googleUserEmail,
      googleAuthLoading,
      googleAuthError,
      googleRestoring,
      signInGoogle,
      signOutGoogle,
      calendars,
      calendarsLoading,
      calendarsError,
      managerCalendarId,
      selectManagerCalendar,
      googleEventsLoading,
      googleEventsError,
      fetchGoogleEvents,
      reminderMode,
      setReminderMode,
      reminderMinutes,
      setReminderMinutes,
      sharedStatus,
      sharedEvents,
      demoMode,
      setDemoMode,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
