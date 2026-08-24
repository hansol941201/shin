// 공동(로그인 없는) 백엔드 모드용 provider.
//
// store.jsx의 AppProvider(사용자별 Google OAuth + localStorage)는 이
// 파일이 전혀 건드리지 않는다 — SHARED_BACKEND_CONFIGURED(=VITE_FIREBASE_*
// Secret이 등록된 경우)일 때만 App.jsx가 AppProvider 대신 이 provider를
// 마운트한다. 둘 다 store.jsx가 export하는 같은 AppContext를 쓰므로,
// 모든 화면 컴포넌트는 useApp()만 그대로 쓰면 되고 어느 provider가
// 떠 있는지 알 필요가 없다.
//
// 데이터는 전부 Firestore 실시간 리스너(sharedBackend.js)로 받고, 쓰기는
// 전부 Cloud Functions 콜러블로 보낸다. 이 파일 자체는 Google API를
// 절대 직접 부르지 않는다(그건 서버 쪽 일).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext } from './store.jsx';
import { DEFAULT_SETTINGS, getWeekStart, addDays } from '../utils/time.js';
import { subscribeSharedSchedules } from '../services/legacyScheduleAdapter.js';
import * as backend from '../services/sharedBackend.js';

export function SharedAppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [role, setRole] = useState('coordinator');
  const [view] = useState('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const currentWeekStart = useMemo(() => getWeekStart(cursorDate), [cursorDate]);

  const [focusedEvent, setFocusedEvent] = useState(null);
  const focusEvent = useCallback((event) => {
    if (!event) return;
    const start = new Date(event.start);
    setCursorDate(new Date(start.getFullYear(), start.getMonth(), 1));
    setFocusedEvent(event);
  }, []);
  const clearFocusedEvent = useCallback(() => setFocusedEvent(null), []);

  // ---- Firestore 실시간 구독 ----
  const [platformEvents, setPlatformEvents] = useState([]); // events 컬렉션(승인대기/확정/거절/개인일정)
  const [googleEvents, setGoogleEvents] = useState([]); // googleEventsCache 컬렉션
  const [accompanyIds, setAccompanyIds] = useState(new Set());
  const [syncStatus, setSyncStatus] = useState(null);

  useEffect(() => backend.subscribeEvents(setPlatformEvents), []);
  useEffect(() => backend.subscribeGoogleEventsCache(setGoogleEvents), []);
  useEffect(() => backend.subscribeAccompanyIds(setAccompanyIds), []);
  useEffect(() => backend.subscribeSyncStatus(setSyncStatus), []);

  // ---- 다른 팀 Firebase(읽기 전용) — 기존 store.jsx와 동일한 방식 재사용 ----
  const [sharedEvents, setSharedEvents] = useState([]);
  const [sharedStatus, setSharedStatus] = useState(null);
  useEffect(() => {
    const unsubscribe = subscribeSharedSchedules(setSharedEvents, setSharedStatus);
    return () => unsubscribe();
  }, []);

  // ---- 편집 코드 게이트 ----
  const [editCodeGateOpen, setEditCodeGateOpen] = useState(false);
  const [editCodeError, setEditCodeError] = useState('');
  const [editCodeSubmitting, setEditCodeSubmitting] = useState(false);

  const submitEditCode = useCallback(async (code) => {
    setEditCodeSubmitting(true);
    setEditCodeError('');
    const res = await backend.verifyEditCode(code).catch((err) => ({ error: err?.message || '확인 중 오류가 발생했습니다.' }));
    setEditCodeSubmitting(false);
    if (res?.error) {
      setEditCodeError(res.error);
      return res;
    }
    setEditCodeGateOpen(false);
    return { ok: true };
  }, []);

  const closeEditCodeGate = useCallback(() => {
    setEditCodeGateOpen(false);
    setEditCodeError('');
  }, []);

  // 쓰기 콜러블 공통 처리: needsEditCode면 게이트를 띄우고, 화면에는
  // 안내 메시지를 하나 돌려준다(기존 컴포넌트들이 이미 .error를 처리함).
  const guarded = useCallback((fn) => async (...args) => {
    const res = await fn(...args);
    if (res?.needsEditCode) {
      setEditCodeGateOpen(true);
      return { error: '이 일정을 등록/수정하려면 편집 코드 확인이 먼저 필요합니다.' };
    }
    return res;
  }, []);

  const addRequest = useMemo(() => guarded(backend.addRequest), [guarded]);
  const addPersonalEvent = useMemo(() => guarded(backend.addPersonalEvent), [guarded]);
  const addAndConfirmRequest = useMemo(
    () => guarded((draft) => backend.addAndConfirmRequest(draft)),
    [guarded]
  );
  const acceptRequest = useMemo(() => guarded((id) => backend.acceptRequest({ id })), [guarded]);
  const rejectRequest = useMemo(
    () => guarded((id, reason, detail) => backend.rejectRequest({ id, reason, detail })),
    [guarded]
  );
  const proposeReschedule = useMemo(
    () => guarded((id, proposedStart, proposedEnd) => backend.proposeReschedule({ id, proposedStart, proposedEnd })),
    [guarded]
  );
  const acceptReschedule = useMemo(() => guarded((id) => backend.acceptReschedule({ id })), [guarded]);
  const cancelReschedule = useMemo(() => guarded((id) => backend.cancelReschedule({ id })), [guarded]);
  const cancelOwnRequest = useMemo(() => guarded((id) => backend.cancelOwnRequest({ id })), [guarded]);
  const updateEvent = useMemo(() => guarded((id, patch) => backend.updateEvent({ id, patch })), [guarded]);
  const deleteEventAction = useMemo(() => guarded((id) => backend.deleteEventAction({ id })), [guarded]);

  // 한솔 동행 — 원본 일정을 복제하지 않고 id(googleEventId 또는 공유
  // 일정 id)만 태그한다(기존 store.jsx와 동일한 규칙).
  const accompanyKeyOf = useCallback((event) => {
    if (!event) return null;
    if (event.source === 'google') return event.googleEventId || null;
    if (event.source === 'shared_team_calendar') return event.id || null;
    return null;
  }, []);
  const toggleAccompanyRaw = useMemo(() => guarded((key) => backend.toggleAccompany({ key })), [guarded]);
  const toggleAccompany = useCallback(
    (event) => {
      const key = accompanyKeyOf(event);
      if (key) toggleAccompanyRaw(key);
    },
    [accompanyKeyOf, toggleAccompanyRaw]
  );

  // ---- 병합된 events (기존 store.jsx의 로직과 동일) ----
  const events = useMemo(() => {
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
    const tagAccompany = (list) =>
      list.map((e) => {
        const key = accompanyKeyOf(e);
        return key && accompanyIds.has(key) ? { ...e, hansolAccompany: true } : e;
      });

    const sharedVisible = tagAccompany(sharedEvents.filter((s) => !isDuplicateOfGoogle(s, googleEvents)));
    const hansolConfirmedGoogleIds = new Set(
      platformEvents
        .filter((e) => e.source === 'platform' && e.status === 'confirmed' && e.googleCalendarEventId)
        .map((e) => e.googleCalendarEventId)
    );
    const googleVisible = tagAccompany(
      googleEvents.filter((g) => !(g.googleEventId && hansolConfirmedGoogleIds.has(g.googleEventId)))
    );
    return [...googleVisible, ...platformEvents, ...sharedVisible];
  }, [platformEvents, googleEvents, sharedEvents, accompanyIds, accompanyKeyOf]);

  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      role,
      setRole,
      view,
      setView: () => {}, // 월간 전용 — 기존 정책과 동일
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
      focusedEvent,
      focusEvent,
      clearFocusedEvent,
      // 이 모드에서는 "Google 미설정/연결" UI 자체가 없다 — 대신
      // sharedBackendActive + googleSyncStatus로 관리자 진단만 보여준다.
      sharedBackendActive: true,
      googleSyncStatus: syncStatus,
      googleConfigured: true,
      googleClientIdValid: true,
      googleActive: true,
      googleSignedIn: true,
      googleUserEmail: '',
      googleAuthLoading: false,
      googleAuthError: '',
      googleRestoring: false,
      signInGoogle: () => {},
      signOutGoogle: () => {},
      calendars: [],
      calendarsLoading: false,
      calendarsError: '',
      managerCalendarId: 'primary',
      selectManagerCalendar: () => {},
      googleEventsLoading: false,
      googleEventsError: syncStatus && syncStatus.ok === false ? syncStatus.message : '',
      refreshGoogleEvents: backend.refreshGoogleEvents,
      reminderMode: 'app',
      setReminderMode: () => {},
      reminderMinutes: 30,
      setReminderMinutes: () => {},
      sharedStatus,
      sharedEventCount: sharedEvents.length,
      toggleAccompany,
      demoMode: false,
      setDemoMode: () => {},
      // 편집 코드 게이트
      editCodeGateOpen,
      editCodeError,
      editCodeSubmitting,
      submitEditCode,
      closeEditCodeGate,
      hasEditToken: backend.hasEditToken,
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
      syncStatus,
      sharedStatus,
      sharedEvents,
      toggleAccompany,
      editCodeGateOpen,
      editCodeError,
      editCodeSubmitting,
      submitEditCode,
      closeEditCodeGate,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
