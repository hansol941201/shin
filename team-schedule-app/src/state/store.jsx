import React, { createContext, useCallback, useContext, useMemo, useReducer, useState } from 'react';
import { buildSampleEvents } from './sampleData.js';
import { DEFAULT_SETTINGS, getWeekStart } from '../utils/time.js';
import { makeId } from '../utils/id.js';
import { loadPersistedEvents, persistEvents } from '../services/firebase.js';
import { createManagerEvent, updateManagerEvent } from '../services/googleCalendar.js';

const AppContext = createContext(null);

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
    case 'REPLACE_ALL': {
      return action.events;
    }
    default:
      return events;
  }
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [role, setRole] = useState('coordinator'); // 'coordinator' | 'manager'
  const [view, setView] = useState('week'); // 'week' | 'month'
  // cursorDate: 사용자가 현재 보고 있는 기준 날짜. 주간뷰는 이 날짜가 속한 주,
  // 월간뷰는 이 날짜가 속한 달을 보여준다. (주 시작일을 직접 들고 있으면 월 이동 시
  // "그 달 1일이 속한 주"로 정확히 되돌아오지 못하는 경계 버그가 생겨 cursorDate로 분리함)
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const currentWeekStart = useMemo(() => getWeekStart(cursorDate), [cursorDate]);

  const [events, dispatch] = useReducer(eventsReducer, null, () => {
    const persisted = loadPersistedEvents();
    if (persisted && Array.isArray(persisted) && persisted.length) return persisted;
    return buildSampleEvents(getWeekStart(new Date()));
  });

  const persist = useCallback((next) => {
    persistEvents(next);
  }, []);

  const dispatchAndPersist = useCallback((action) => {
    dispatch(action);
  }, []);

  // events 변경 시마다 저장(데모: localStorage / 운영: Firestore로 교체)
  React.useEffect(() => {
    persist(events);
  }, [events, persist]);

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

  const acceptRequest = useCallback(async (id) => {
    const res = await createManagerEvent();
    dispatchAndPersist({ type: 'ACCEPT_REQUEST', id, googleCalendarEventId: res.googleCalendarEventId });
  }, [dispatchAndPersist]);

  const rejectRequest = useCallback((id) => {
    dispatchAndPersist({ type: 'REJECT_REQUEST', id });
  }, [dispatchAndPersist]);

  const proposeReschedule = useCallback((id, proposedStart, proposedEnd) => {
    dispatchAndPersist({ type: 'PROPOSE_RESCHEDULE', id, proposedStart, proposedEnd });
  }, [dispatchAndPersist]);

  const acceptReschedule = useCallback(async (id) => {
    const res = await createManagerEvent();
    dispatchAndPersist({ type: 'ACCEPT_RESCHEDULE', id, googleCalendarEventId: res.googleCalendarEventId });
  }, [dispatchAndPersist]);

  const cancelReschedule = useCallback((id) => {
    dispatchAndPersist({ type: 'CANCEL_RESCHEDULE', id });
  }, [dispatchAndPersist]);

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
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// unused import guard removal helper (kept for clarity of intent)
void updateManagerEvent;
