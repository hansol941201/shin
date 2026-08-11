// Google Calendar API v3 연동 (브라우저에서 액세스 토큰으로 직접 REST 호출).
//
// 모든 함수는 예외를 던지지 않고 { ok: true, ... } 또는
// { ok: false, status, message } 형태로 결과를 반환한다. message는 화면에
// 그대로 보여줘도 되는 한글 문구로 만든다(콘솔에만 남기지 않기 위함).

import { addMinutes, startOfDay } from '../utils/time.js';

const API_BASE = 'https://www.googleapis.com/calendar/v3';

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function parseErrorMessage(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 응답이 JSON이 아닐 수 있음 */
  }
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status;
  if (res.status === 401) {
    return { code: 'UNAUTHORIZED', message: 'Google 로그인이 만료되었습니다. 다시 연결해주세요.' };
  }
  if (res.status === 403) {
    return {
      code: 'FORBIDDEN',
      message:
        '이 캘린더에는 일정 등록 권한이 없습니다.\n' +
        '팀장님이 Google Calendar 공유 설정에서 일정 변경 권한을 허용해야 합니다.',
    };
  }
  if (res.status === 404) {
    return { code: 'NOT_FOUND', message: '선택한 캘린더를 찾을 수 없습니다. 캘린더 선택을 다시 확인해주세요.' };
  }
  if (res.status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
    return { code: 'RATE_LIMIT', message: 'Google Calendar 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { code: 'UNKNOWN', message: `Google Calendar 요청 중 오류가 발생했습니다. (HTTP ${res.status})` };
}

// ---------- 캘린더 목록 ----------
export async function fetchCalendarList(accessToken) {
  try {
    const res = await fetch(`${API_BASE}/users/me/calendarList?minAccessRole=reader&maxResults=250`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) {
      const err = await parseErrorMessage(res);
      return { ok: false, ...err };
    }
    const data = await res.json();
    const calendars = (data.items || []).map((c) => ({
      id: c.id,
      summary: c.summaryOverride || c.summary,
      primary: Boolean(c.primary),
      accessRole: c.accessRole, // 'owner' | 'writer' | 'reader' | 'freeBusyReader'
    }));
    return { ok: true, calendars };
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: '캘린더 목록을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.' };
  }
}

// ---------- 일정 매핑 ----------
// Google Calendar 이벤트 -> 이 앱의 일정 구조로 변환.
// 하루종일(all-day) 일정은 start.date/end.date만 있으므로, 화면의 09~18시
// 시간표에 표시할 수 있도록 근무시간 전체를 차지하는 종일 일정으로 변환한다.
export function mapGoogleEvent(gEvent, calendarId, settings) {
  const isAllDay = Boolean(gEvent.start?.date && !gEvent.start?.dateTime);
  let start;
  let end;

  if (isAllDay) {
    const dayBase = startOfDay(new Date(`${gEvent.start.date}T00:00:00`));
    start = addMinutes(dayBase, settings.workStartMin).toISOString();
    end = addMinutes(dayBase, settings.workEndMin).toISOString();
  } else {
    start = gEvent.start.dateTime;
    end = gEvent.end.dateTime;
  }

  return {
    id: `google_${gEvent.id}`,
    googleEventId: gEvent.id,
    googleCalendarEventId: gEvent.id, // 내부 상태 전이 코드와의 호환을 위한 동일 값
    calendarId,
    title: gEvent.summary || '(제목 없음)',
    start,
    end,
    location: gEvent.location || '',
    memo: gEvent.description || '',
    requester: '팀장',
    manager: '팀장',
    status: 'confirmed',
    createdAt: gEvent.created || new Date().toISOString(),
    updatedAt: gEvent.updated || new Date().toISOString(),
    source: 'google',
    allDay: isAllDay,
  };
}

// ---------- 일정 목록 조회 (기간 지정, 반복 일정은 개별 일정으로 펼침) ----------
export async function fetchEvents({ accessToken, calendarId, timeMinISO, timeMaxISO, settings }) {
  const events = [];
  let pageToken = '';
  let guard = 0;

  try {
    do {
      const params = new URLSearchParams({
        timeMin: timeMinISO,
        timeMax: timeMaxISO,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        showDeleted: 'false',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(
        `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        { headers: authHeaders(accessToken) }
      );
      if (!res.ok) {
        const err = await parseErrorMessage(res);
        return { ok: false, ...err };
      }
      const data = await res.json();
      for (const gEvent of data.items || []) {
        if (gEvent.status === 'cancelled') continue;
        if (!gEvent.start) continue;
        events.push(mapGoogleEvent(gEvent, calendarId, settings));
      }
      pageToken = data.nextPageToken || '';
      guard += 1;
    } while (pageToken && guard < 20);

    return { ok: true, events };
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: '일정을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.' };
  }
}

// ---------- 특정 시간대에 이미 다른 일정이 있는지 재확인(중복 방지) ----------
export async function hasConflict({ accessToken, calendarId, startISO, endISO }) {
  try {
    const params = new URLSearchParams({
      timeMin: startISO,
      timeMax: endISO,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '10',
    });
    const res = await fetch(
      `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: authHeaders(accessToken) }
    );
    if (!res.ok) {
      const err = await parseErrorMessage(res);
      return { ok: false, ...err };
    }
    const data = await res.json();
    const active = (data.items || []).filter((e) => e.status !== 'cancelled');
    return { ok: true, conflict: active.length > 0 };
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: '일정 중복 확인 중 오류가 발생했습니다. 인터넷 연결을 확인해주세요.' };
  }
}

// ---------- 확정 일정 생성 ----------
export async function createEvent({ accessToken, calendarId, title, location, description, startISO, endISO }) {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
    const res = await fetch(`${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        summary: title,
        location: location || undefined,
        description: description || undefined,
        start: { dateTime: startISO, timeZone },
        end: { dateTime: endISO, timeZone },
      }),
    });
    if (!res.ok) {
      const err = await parseErrorMessage(res);
      return { ok: false, ...err };
    }
    const created = await res.json();
    return { ok: true, googleEventId: created.id };
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: '일정 생성 중 오류가 발생했습니다. 인터넷 연결을 확인해주세요.' };
  }
}
