import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { buildSampleEvents } from './sampleData.js';
import { DEFAULT_SETTINGS, getWeekStart, addDays } from '../utils/time.js';
import { makeId } from '../utils/id.js';
import { loadPersistedEvents, persistEvents } from '../services/firebase.js';
import * as googleCalendarApi from '../services/googleCalendar.js';
import {
  GOOGLE_CONFIGURED,
  GOOGLE_CLIENT_ID_VALID,
  maskedClientId,
  requestAccessToken,
  revokeAccessToken,
  fetchUserInfo,
  saveSession,
  loadSession,
  clearSession,
  hasEverConnectedGoogle,
  markEverConnectedGoogle,
  clearEverConnectedGoogle,
} from '../services/googleAuth.js';
import {
  getDemoModeFlag,
  setDemoModeFlag,
  getManagerCalendarId,
  setManagerCalendarId as persistManagerCalendarId,
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
      '구글연동설정.bat으로 Client ID를 다시 확인/입력해주세요.'
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
          ? { ...e, status: 'rejected', updatedAt: new Date().toISOString(), rejectedAt: new Date().toISOString() }
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
  const [view, setView] = useState('week'); // 'week' | 'month'
  // cursorDate: 사용자가 현재 보고 있는 기준 날짜. 주간뷰는 이 날짜가 속한 주,
  // 월간뷰는 이 날짜가 속한 달을 보여준다.
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const currentWeekStart = useMemo(() => getWeekStart(cursorDate), [cursorDate]);

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

  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleEventsLoading, setGoogleEventsLoading] = useState(false);
  const [googleEventsError, setGoogleEventsError] = useState('');
  // 앱을 새로 열었을 때 "이전에 연결한 적이 있는데 조용히 재연결을 시도
  // 중"인지 표시하기 위한 상태. 이 동안은 "Google 캘린더 연결" 버튼을
  // 성급하게 노출하지 않는다(잠깐 껐다 켰다 하는 것처럼 보이는 걸 방지).
  const [googleRestoring, setGoogleRestoring] = useState(hasEverConnectedGoogle());

  const googleActive = GOOGLE_CONFIGURED && googleSignedIn && Boolean(managerCalendarId) && Boolean(accessToken);

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

  // 앱을 껐다가 다시 켜도(데스크톱 앱 창을 새로 열어도) 매번 "Google 캘린더
  // 연결"을 다시 누를 필요가 없도록 세션 복원을 시도한다.
  // 1) 아직 유효한 토큰이 로컬에 남아있으면 그대로 복원.
  // 2) 토큰은 만료됐지만 예전에 최소 한 번 연결에 성공한 적이 있다면,
  //    사용자 상호작용 없이 조용히 재획득(prompt: '')을 시도한다. 이미 이
  //    브라우저에 Google 로그인이 되어 있고 이 앱에 동의한 이력이 있으면
  //    보통 팝업 없이 성공한다(Google 권장 방식).
  // 3) 그마저 실패하면(=Google 세션 자체가 끊겼거나 동의가 철회됨) 조용히
  //    포기하고 "Google 캘린더 연결" 버튼을 그대로 보여준다 — 오류 팝업을
  //    띄우지 않는다.
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setAccessToken(session.accessToken);
      setGoogleUserEmail(session.email || '');
      setGoogleSignedIn(true);
      setGoogleRestoring(false);
      loadCalendars(session.accessToken);
      return;
    }

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
        const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
        const info = await fetchUserInfo(response.access_token);
        if (cancelled) return;
        const newSession = { accessToken: response.access_token, expiresAt, email: info?.email || '' };
        saveSession(newSession);
        setAccessToken(newSession.accessToken);
        setGoogleUserEmail(newSession.email);
        setGoogleSignedIn(true);
        await loadCalendars(newSession.accessToken);
      } catch {
        // 조용히 실패 처리: 사용자가 직접 "Google 캘린더 연결"을 누르게 둔다.
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
      const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
      const info = await fetchUserInfo(response.access_token);
      const session = { accessToken: response.access_token, expiresAt, email: info?.email || '' };
      saveSession(session);
      markEverConnectedGoogle();
      setAccessToken(session.accessToken);
      setGoogleUserEmail(session.email);
      setGoogleSignedIn(true);
      await loadCalendars(session.accessToken);
    } catch (err) {
      setGoogleAuthError(describeGoogleAuthError(err));
    } finally {
      setGoogleAuthLoading(false);
    }
  }, [loadCalendars]);

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
  // 승인대기/시간변경 요청. 이미 Google 쪽에서 확인된(confirmed) 로컬
  // 레코드는 중복 표시되지 않도록 제외한다.
  const events = useMemo(() => {
    if (!googleActive) return localEvents;
    const platformVisible = localEvents.filter((e) => {
      if (e.status === 'rejected') return false;
      if (e.status === 'confirmed') {
        return !googleEvents.some((g) => g.googleEventId && g.googleEventId === e.googleCalendarEventId);
      }
      return true;
    });
    return [...googleEvents, ...platformVisible];
  }, [googleActive, googleEvents, localEvents]);

  const addRequest = useCallback((draft) => {
    const now = new Date().toISOString();
    const event = {
      id: makeId('req'),
      title: draft.title,
      start: draft.start,
      end: draft.end,
      location: draft.location || '',
      memo: draft.memo || '',
      requester: '코디네이터',
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
      });
      if (!created.ok) {
        if (created.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: created.message };
      }

      dispatchAndPersist({ type: 'ACCEPT_REQUEST', id, googleCalendarEventId: created.googleEventId });
      fetchGoogleEvents();
      return { ok: true };
    },
    [localEvents, googleActive, accessToken, managerCalendarId, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
  );

  const rejectRequest = useCallback((id) => {
    dispatchAndPersist({ type: 'REJECT_REQUEST', id });
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
      });
      if (!created.ok) {
        if (created.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: created.message };
      }

      dispatchAndPersist({ type: 'ACCEPT_RESCHEDULE', id, googleCalendarEventId: created.googleEventId });
      fetchGoogleEvents();
      return { ok: true };
    },
    [localEvents, googleActive, accessToken, managerCalendarId, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
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
      });
      if (!patched.ok) {
        if (patched.code === 'UNAUTHORIZED') signOutGoogle();
        return { error: patched.message };
      }

      await fetchGoogleEvents();
      return { ok: true };
    },
    [events, googleActive, accessToken, managerCalendarId, dispatchAndPersist, signOutGoogle, fetchGoogleEvents]
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
      acceptRequest,
      rejectRequest,
      proposeReschedule,
      acceptReschedule,
      cancelReschedule,
      cancelOwnRequest,
      updateEvent,
      deleteEventAction,
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
      acceptRequest,
      rejectRequest,
      proposeReschedule,
      acceptReschedule,
      cancelReschedule,
      cancelOwnRequest,
      updateEvent,
      deleteEventAction,
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
