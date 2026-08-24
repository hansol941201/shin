import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { buildSampleEvents } from './sampleData.js';
import { DEFAULT_SETTINGS, getWeekStart, addDays } from '../utils/time.js';
import { makeId } from '../utils/id.js';
import { loadPersistedEvents, persistEvents } from '../services/firebase.js';
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
  getAccompanyIds,
  setAccompanyIds as persistAccompanyIds,
} from '../services/localSettings.js';

const AppContext = createContext(null);

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

function eventsReducer(events, action) {
  switch (action.type) {
    case 'ADD_REQUEST': {
      return [...events, action.event];
    }
    case 'ACCEPT_REQUEST': {
      return events.map((e) =>
        e.id === action.id
          ? {
              ...e,
              status: 'confirmed',
              googleCalendarEventId: e.googleCalendarEventId || action.googleCalendarEventId,
              updatedAt: new Date().toISOString(),
            }
          : e
      );
    }
    case 'REJECT_REQUEST': {
      return events.map((e) =>
        e.id === action.id
          ? {
              ...e,
              status: 'rejected',
              // 'unavailable'(일정 불가) | 'other'(기타, 사유 직접 입력)
              rejectionReason: action.reason || 'unavailable',
              rejectionDetail: action.detail || '',
              updatedAt: new Date().toISOString(),
              rejectedAt: new Date().toISOString(),
            }
          : e
      );
    }
    case 'PROPOSE_RESCHEDULE': {
      return events.map((e) =>
        e.id === action.id
          ? {
              ...e,
              status: 'reschedule_requested',
              proposedStart: action.proposedStart,
              proposedEnd: action.proposedEnd,
              updatedAt: new Date().toISOString(),
            }
          : e
      );
    }
    case 'ACCEPT_RESCHEDULE': {
      return events.map((e) =>
        e.id === action.id
          ? {
              ...e,
              start: e.proposedStart,
              end: e.proposedEnd,
              proposedStart: undefined,
              proposedEnd: undefined,
              status: 'confirmed',
              googleCalendarEventId: e.googleCalendarEventId || action.googleCalendarEventId,
              updatedAt: new Date().toISOString(),
            }
          : e
      );
    }
    case 'CANCEL_RESCHEDULE': {
      // 코디네이터가 "다른 시간 선택"을 고른 경우: 이 요청은 취소(거절 처리)하고
      // 새 요청은 별도 ADD_REQUEST로 생성한다.
      return events.map((e) =>
        e.id === action.id
          ? { ...e, status: 'rejected', updatedAt: new Date().toISOString(), rejectedAt: new Date().toISOString() }
          : e
      );
    }
    case 'EDIT_LOCAL_EVENT': {
      return events.map((e) =>
        e.id === action.id ? { ...e, ...action.patch, updatedAt: new Date().toISOString() } : e
      );
    }
    case 'DELETE_LOCAL_EVENT': {
      return events.filter((e) => e.id !== action.id);
    }
    case 'REPLACE_ALL': {
      return action.events;
    }
    default:
      return events;
  }
}

// 수정/삭제 전 "겹치는 일정이 있는지" 로컬에서 먼저 확인할 때 막힌 시간으로
// 취급할 상태(빈 시간 계산 로직과 동일한 기준).
const BUSY_STATUSES = new Set(['confirmed', 'pending', 'reschedule_requested']);

function hasLocalOverlap(events, excludeId, startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return events.some((e) => {
    if (e.id === excludeId) return false;
    if (!BUSY_STATUSES.has(e.status)) return false;
    const eStart = new Date(e.start);
    const eEnd = new Date(e.end);
    return eStart < end && start < eEnd;
  });
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [role, setRole] = useState('coordinator'); // 'coordinator' | 'manager'
  // 월간 화면만 사용하는 정책으로 전환 — 항상 'month'로 시작한다.
  // 'week'/setView/WeekView 관련 코드는 다른 기능이 깨질 위험을 피하려고
  // 그대로 남겨뒀지만, UI에서는 더 이상 도달할 방법이 없다(진입점 삭제됨).
  const [view, setView] = useState('month'); // 'week' | 'month'
  // cursorDate: 사용자가 현재 보고 있는 기준 날짜. 주간뷰는 이 날짜가 속한 주,
  // 월간뷰는 이 날짜가 속한 달을 보여준다.
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const currentWeekStart = useMemo(() => getWeekStart(cursorDate), [cursorDate]);

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

  // ---------------------------------------------------------------------
  // 로컬(플랫폼) 일정: 승인대기/시간변경/거절, 그리고 데모 모드일 때만 쓰는
  // 샘플 확정 일정. 실제 Google 연동이 켜져 있으면 "확정" 일정은 Google
  // 쪽 데이터가 우선이므로, 아래 REPLACE_ALL 판단에서 데모 여부를 본다.
  // ---------------------------------------------------------------------
  const [demoMode, setDemoModeState] = useState(getDemoModeFlag);

  const [localEvents, dispatch] = useReducer(eventsReducer, null, () => {
    const persisted = loadPersistedEvents();
    if (persisted && Array.isArray(persisted)) return persisted;
    return getDemoModeFlag() ? buildSampleEvents(getWeekStart(new Date())) : [];
  });

  const dispatchAndPersist = useCallback((action) => {
    dispatch(action);
  }, []);

  useEffect(() => {
    persistEvents(localEvents);
  }, [localEvents]);

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

  const setDemoMode = useCallback(
    (next) => {
      setDemoModeState(next);
      setDemoModeFlag(next);
      dispatchAndPersist({
        type: 'REPLACE_ALL',
        events: next ? buildSampleEvents(getWeekStart(new Date())) : [],
      });
    },
    [dispatchAndPersist]
  );

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

  // 한솔 요청이 수락돼 Google Calendar에 실제 일정을 만들 때 붙일 알림
  // 설정. 'app'이면 아래 reminderMinutes(기본 30분) 전 팝업 알림을 명시
  // 붙이고, 'google_default'면 팀장님이 그 캘린더에 이미 설정해둔 기본
  // 알림을 그대로 쓴다.
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

  // ---------------------------------------------------------------------
  // 한솔 동행: 원본 팀장 일정(Google, 또는 향후 공유 일정)을 복제하지 않고
  // "이 일정에 한솔이 같이 간다"는 식별자 목록만 이 앱 저장소에 따로
  // 저장한다. Google 일정이면 googleEventId를, 공유 일정이면 그 일정의
  // id를 키로 쓴다 — 두 경우 다 events 병합 시점에 태그만 붙이므로 팀장이
  // Google에서 시간/제목/장소를 바꾸면 다음 조회 때 자동으로 최신값이
  // 반영되고, 원본을 삭제하면 태그가 붙을 대상 자체가 없어져 화면에서도
  // 자동으로 사라진다(고아 데이터가 눈에 보이는 일이 없음).
  const [accompanyIds, setAccompanyIdsState] = useState(() => new Set(getAccompanyIds()));

  const accompanyKeyOf = useCallback((event) => {
    if (!event) return null;
    if (event.source === 'google') return event.googleEventId || null;
    if (event.source === 'shared_team_calendar') return event.id || null;
    return null;
  }, []);

  const toggleAccompany = useCallback(
    (event) => {
      const key = accompanyKeyOf(event);
      if (!key) return;
      setAccompanyIdsState((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        persistAccompanyIds([...next]);
        return next;
      });
    },
    [accompanyKeyOf]
  );

  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleEventsLoading, setGoogleEventsLoading] = useState(false);
  const [googleEventsError, setGoogleEventsError] = useState('');
  // 앱을 새로 열었을 때 "이전에 연결한 적이 있는데 조용히 재연결을 시도
  // 중"인지 표시하기 위한 상태. 이 동안은 "Google 캘린더 연결" 버튼을
  // 성급하게 노출하지 않는다(잠깐 껐다 켰다 하는 것처럼 보이는 걸 방지).
  const [googleRestoring, setGoogleRestoring] = useState(hasEverConnectedGoogle());

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

    if (!hasEverConnectedGoogle() || !GOOGLE_CONFIGURED || !GOOGLE_CLIENT_ID_VALID) {
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
  // 현재 보고 있는 주간/월간 범위의 Google 일정 조회
  // ---------------------------------------------------------------------
  const visibleRange = useMemo(() => {
    if (view === 'month') {
      const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
      const gridStart = getWeekStart(monthAnchor);
      return { start: gridStart, end: addDays(gridStart, 42) };
    }
    return { start: currentWeekStart, end: addDays(currentWeekStart, 7) };
  }, [view, cursorDate, currentWeekStart]);

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

  // 화면에 보여줄 최종 일정 목록: Google에서 가져온 확정 일정 + 우리 쪽
  // 승인대기/시간변경/확정 요청. 한솔이 요청해서 확정된 일정은 실제로는
  // Google Calendar에도 생성돼 있지만, 화면에는 "한솔 요청 출처"가 살아있는
  // 로컬(platform) 버전을 그대로 보여준다 — 팀장/한솔 필터가 source 필드로
  // 구분해야 하는데, Google 쪽 사본만 남기면 그 출처 정보가 사라지기
  // 때문이다(요구사항: 수락돼도 한솔 화면에서 계속 보여야 함). 대신 같은
  // 일정이 두 번 표시되지 않도록, 그 일정에 대응하는 Google 쪽 사본은
  // 목록에서 제외한다.
  const events = useMemo(() => {
    // 공유 일정(다른 팀 Firebase)이 Google Calendar에도 같은 내용으로
    // 이미 등록돼 있으면 화면에 두 번 보이지 않도록 걸러낸다(요구사항:
    // 원본 데이터는 그대로 두고 표시만 한 번). 판단 기준: 같은 날짜 +
    // 시작 시각이 5분 이내로 같음 + 제목이 (공백 무시) 서로 같거나 한쪽을
    // 포함 — 확실하지 않으면 중복으로 보지 않는다(요구사항).
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
    // "한솔 동행" 태그는 원본을 복제하지 않고 화면에 표시할 때만 붙인다 —
    // Google/공유 쪽에서 매번 새로 조회한 최신 데이터에 매번 다시 태그를
    // 씌우는 방식이라, 팀장이 시간/제목/장소를 바꾸면 자동으로 최신값에
    // 태그가 붙고, 원본이 삭제되면 태그를 붙일 대상 자체가 사라진다.
    const tagAccompany = (list) =>
      list.map((e) => {
        const key = accompanyKeyOf(e);
        return key && accompanyIds.has(key) ? { ...e, hansolAccompany: true } : e;
      });

    const sharedVisible = tagAccompany(sharedEvents.filter((s) => !isDuplicateOfGoogle(s, googleEvents)));

    if (!googleActive) return [...localEvents, ...sharedVisible];
    const hansolConfirmedGoogleIds = new Set(
      localEvents
        .filter((e) => e.source === 'platform' && e.status === 'confirmed' && e.googleCalendarEventId)
        .map((e) => e.googleCalendarEventId)
    );
    const googleVisible = tagAccompany(
      googleEvents.filter((g) => !(g.googleEventId && hansolConfirmedGoogleIds.has(g.googleEventId)))
    );
    // 거절된 요청도 이제 한솔 화면에 빨간색으로 계속 보여줘야 하므로 더 이상
    // status로 걸러내지 않는다(취소된 승인대기 요청은 DELETE_LOCAL_EVENT로
    // 배열에서 아예 제거되므로 여기 남아있는 rejected는 전부 "팀장이 실제로
    // 거절 처리한" 요청뿐이다).
    return [...googleVisible, ...localEvents, ...sharedVisible];
  }, [googleActive, googleEvents, localEvents, sharedEvents, accompanyIds, accompanyKeyOf]);

  const addRequest = useCallback((draft) => {
    const now = new Date().toISOString();
    const event = {
      id: makeId('req'),
      title: draft.title,
      start: draft.start,
      end: draft.end,
      location: draft.location || '',
      memo: draft.memo || '',
      requester: '한솔',
      manager: '팀장',
      status: 'pending',
      googleCalendarEventId: null,
      createdAt: now,
      updatedAt: now,
      source: 'platform',
    };
    dispatchAndPersist({ type: 'ADD_REQUEST', event });
    return event;
  }, [dispatchAndPersist]);

  // "무조건 승인대기"가 아니라, 한솔이 직접 바로 확정할 수 있게 하는
  // 흐름 — 승인 절차(pending → 팀장 수락)를 건너뛰고 acceptRequest와
  // 동일한 검증/Google 등록을 거쳐 곧바로 confirmed 상태로 등록한다.
  // addRequest로 만든 뒤 곧바로 acceptRequest(id)를 부르는 방식은 쓰지
  // 않는다 — dispatch 직후 localEvents state가 아직 갱신되지 않아
  // acceptRequest가 방금 만든 요청을 못 찾는 타이밍 문제가 생기므로,
  // draft를 그대로 받아 한 번에 처리한다.
  const addAndConfirmRequest = useCallback(
    async (draft) => {
      const now = new Date().toISOString();
      const base = {
        id: makeId('req'),
        title: draft.title,
        start: draft.start,
        end: draft.end,
        location: draft.location || '',
        memo: draft.memo || '',
        requester: '한솔',
        manager: '팀장',
        googleCalendarEventId: null,
        createdAt: now,
        updatedAt: now,
        source: 'platform',
      };

      if (!googleActive) {
        const event = { ...base, status: 'confirmed', googleCalendarEventId: `demo_${base.id}` };
        dispatchAndPersist({ type: 'ADD_REQUEST', event });
        return { ok: true, event };
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

      const event = { ...base, status: 'confirmed', googleCalendarEventId: created.googleEventId };
      dispatchAndPersist({ type: 'ADD_REQUEST', event });
      fetchGoogleEvents();
      return { ok: true, event };
    },
    [googleActive, accessToken, managerCalendarId, reminderMode, reminderMinutes, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  // 한솔 개인 일정: 팀장님 승인 절차가 없다 — 저장 즉시 confirmed로 만들고
  // googleCalendarEventId는 절대 채우지 않는다(=Google Calendar API 호출
  // 없이 앱 내부 데이터로만 관리, updateEvent/deleteEventAction도 이
  // 필드가 없으면 로컬 전용으로 동작하므로 그대로 재사용 가능).
  const addPersonalEvent = useCallback((draft) => {
    const now = new Date().toISOString();
    const event = {
      id: makeId('personal'),
      title: draft.title,
      start: draft.start,
      end: draft.end,
      location: draft.location || '',
      memo: draft.memo || '',
      requester: '한솔',
      owner: 'hansol',
      status: 'confirmed',
      googleCalendarEventId: null,
      createdAt: now,
      updatedAt: now,
      source: 'hansol_personal',
    };
    dispatchAndPersist({ type: 'ADD_REQUEST', event });
    return event;
  }, [dispatchAndPersist]);

  // 팀장 수락: Google 연동이 켜져 있으면 (1) 그 사이 다른 일정이 생기지
  // 않았는지 재확인 -> (2) 실제 Google Calendar에 이벤트 생성 -> (3) 성공
  // 시에만 confirmed로 전환한다. 연동이 꺼져 있으면(데모) 기존처럼 즉시
  // 확정 처리한다.
  const acceptRequest = useCallback(
    async (id) => {
      const target = localEvents.find((e) => e.id === id);
      if (!target) return { error: '요청을 찾을 수 없습니다.' };

      if (!googleActive) {
        dispatchAndPersist({ type: 'ACCEPT_REQUEST', id, googleCalendarEventId: `demo_${id}` });
        return { ok: true };
      }

      const conflict = await googleCalendarApi.hasConflict({
        accessToken,
        calendarId: managerCalendarId,
        startISO: target.start,
        endISO: target.end,
      });
      if (!conflict.ok) {
        if (conflict.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: conflict.message };
      }
      if (conflict.conflict) {
        return { error: '해당 시간에 새로운 일정이 등록되어 있습니다.\n다른 시간을 선택해주세요.' };
      }

      const created = await googleCalendarApi.createEvent({
        accessToken,
        calendarId: managerCalendarId,
        title: target.title,
        location: target.location,
        description: target.memo,
        startISO: target.start,
        endISO: target.end,
        reminders: googleCalendarApi.buildReminders(reminderMode, reminderMinutes),
      });
      if (!created.ok) {
        if (created.code === 'UNAUTHORIZED') signOutGoogle();
        // 앱에서만 확정 처리하지 않는다 — Google 쪽 생성이 실패하면 로컬
        // 상태도 그대로 pending으로 남겨두고 실패 사실을 명확히 알린다.
        return { error: `Google Calendar 일정 등록에 실패했습니다.\n${created.message}` };
      }

      dispatchAndPersist({ type: 'ACCEPT_REQUEST', id, googleCalendarEventId: created.googleEventId });
      fetchGoogleEvents();
      return { ok: true };
    },
    [localEvents, googleActive, accessToken, managerCalendarId, reminderMode, reminderMinutes, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  // reason: 'unavailable'(일정 불가) | 'other'(기타). detail: 'other'일 때
  // 팀장이 직접 입력한 사유 텍스트.
  const rejectRequest = useCallback((id, reason, detail) => {
    dispatchAndPersist({ type: 'REJECT_REQUEST', id, reason, detail });
  }, [dispatchAndPersist]);

  const proposeReschedule = useCallback((id, proposedStart, proposedEnd) => {
    dispatchAndPersist({ type: 'PROPOSE_RESCHEDULE', id, proposedStart, proposedEnd });
  }, [dispatchAndPersist]);

  // 코디네이터가 팀장의 시간변경 제안을 수락하는 경우도 동일하게 처리한다.
  const acceptReschedule = useCallback(
    async (id) => {
      const target = localEvents.find((e) => e.id === id);
      if (!target) return { error: '요청을 찾을 수 없습니다.' };

      if (!googleActive) {
        dispatchAndPersist({ type: 'ACCEPT_RESCHEDULE', id, googleCalendarEventId: `demo_${id}` });
        return { ok: true };
      }

      const conflict = await googleCalendarApi.hasConflict({
        accessToken,
        calendarId: managerCalendarId,
        startISO: target.proposedStart,
        endISO: target.proposedEnd,
      });
      if (!conflict.ok) {
        if (conflict.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: conflict.message };
      }
      if (conflict.conflict) {
        return { error: '해당 시간에 새로운 일정이 등록되어 있습니다.\n다른 시간을 선택해주세요.' };
      }

      const created = await googleCalendarApi.createEvent({
        accessToken,
        calendarId: managerCalendarId,
        title: target.title,
        location: target.location,
        description: target.memo,
        startISO: target.proposedStart,
        endISO: target.proposedEnd,
        reminders: googleCalendarApi.buildReminders(reminderMode, reminderMinutes),
      });
      if (!created.ok) {
        if (created.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: `Google Calendar 일정 등록에 실패했습니다.\n${created.message}` };
      }

      dispatchAndPersist({ type: 'ACCEPT_RESCHEDULE', id, googleCalendarEventId: created.googleEventId });
      fetchGoogleEvents();
      return { ok: true };
    },
    [localEvents, googleActive, accessToken, managerCalendarId, reminderMode, reminderMinutes, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  const cancelReschedule = useCallback((id) => {
    dispatchAndPersist({ type: 'CANCEL_RESCHEDULE', id });
  }, [dispatchAndPersist]);

  // 요청자가 승인대기 요청 자체를 취소(수락되기 전). 아직 Google Calendar에
  // 생성된 적이 없으므로 Google API는 호출하지 않고 로컬에서만 제거한다.
  const cancelOwnRequest = useCallback((id) => {
    dispatchAndPersist({ type: 'DELETE_LOCAL_EVENT', id });
  }, [dispatchAndPersist]);

  // 일정 수정(제목/날짜/시간/장소/메모). 상태에 따라 처리 방식이 다르다:
  // - pending(승인대기): 아직 Google에 없으므로 로컬만 수정.
  // - confirmed + 실제 Google 연동 이벤트: Google에서 겹침 재확인 후
  //   events.patch로 실제 캘린더도 함께 수정. 실패 시 화면은 그대로 두고
  //   오류만 보여준다(로컬 상태를 먼저 바꾸지 않음).
  // - confirmed + 데모/로컬 전용: 로컬만 수정.
  const updateEvent = useCallback(
    async (id, patch) => {
      const target = events.find((e) => e.id === id);
      if (!target) return { error: '일정을 찾을 수 없습니다.' };

      const nextStart = patch.start ?? target.start;
      const nextEnd = patch.end ?? target.end;
      if (new Date(nextStart) >= new Date(nextEnd)) {
        return { error: '시작 시간이 종료 시간보다 빨라야 합니다.' };
      }

      if (target.status === 'pending') {
        if (hasLocalOverlap(events, id, nextStart, nextEnd)) {
          return { error: '해당 시간에 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
        }
        dispatchAndPersist({ type: 'EDIT_LOCAL_EVENT', id, patch });
        return { ok: true };
      }

      if (target.status !== 'confirmed') {
        return { error: '지금 상태에서는 수정할 수 없습니다.' };
      }

      const isGoogleBacked =
        googleActive && target.googleCalendarEventId && !String(target.googleCalendarEventId).startsWith('demo_');

      if (!isGoogleBacked) {
        if (hasLocalOverlap(events, id, nextStart, nextEnd)) {
          return { error: '해당 시간에 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
        }
        dispatchAndPersist({ type: 'EDIT_LOCAL_EVENT', id, patch });
        return { ok: true };
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
    [events, googleActive, accessToken, managerCalendarId, reminderMode, reminderMinutes, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  // 일정 삭제. pending/reschedule_requested는 아직 Google에 없으므로 로컬만
  // 제거. confirmed + 실제 Google 이벤트는 events.delete로 실제 캘린더에서도
  // 삭제한 뒤에만 화면에서 제거한다(실패 시 그대로 둠).
  const deleteEventAction = useCallback(
    async (id) => {
      const target = events.find((e) => e.id === id);
      if (!target) return { error: '일정을 찾을 수 없습니다.' };

      if (target.status === 'pending' || target.status === 'reschedule_requested') {
        dispatchAndPersist({ type: 'DELETE_LOCAL_EVENT', id });
        return { ok: true };
      }

      if (target.status !== 'confirmed') {
        return { error: '지금 상태에서는 삭제할 수 없습니다.' };
      }

      const isGoogleBacked =
        googleActive && target.googleCalendarEventId && !String(target.googleCalendarEventId).startsWith('demo_');

      if (!isGoogleBacked) {
        dispatchAndPersist({ type: 'DELETE_LOCAL_EVENT', id });
        return { ok: true };
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
    [events, googleActive, accessToken, managerCalendarId, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      role,
      setRole,
      view,
      setView,
      currentWeekStart,
      cursorDate,
      setCursorDate,
      events,
      addRequest,
      addAndConfirmRequest,
      addPersonalEvent,
      acceptRequest,
      rejectRequest,
      proposeReschedule,
      acceptReschedule,
      cancelReschedule,
      cancelOwnRequest,
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
      // 한솔 동행 표시(원본 팀장 일정 복제 없이 id만 태그)
      toggleAccompany,
      // 데모 모드(개발용)
      demoMode,
      setDemoMode,
    }),
    [
      settings,
      updateSettings,
      role,
      view,
      currentWeekStart,
      cursorDate,
      events,
      addRequest,
      addAndConfirmRequest,
      addPersonalEvent,
      acceptRequest,
      rejectRequest,
      proposeReschedule,
      acceptReschedule,
      cancelReschedule,
      cancelOwnRequest,
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
      toggleAccompany,
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
