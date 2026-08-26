/**
 * team-schedule-app 공동 일정 백엔드 (팀장 전용 달력).
 *
 * 목적: 팀원이 브라우저에서 Google 계정으로 직접 로그인하지 않아도
 * 되게 한다. Google Calendar에 실제로 쓰는 주체는 이 서버(Cloud
 * Functions)뿐이고, 서버는 "서비스 계정(service account)"으로 인증한다.
 * 서비스 계정 키(JSON)는 Firebase Functions의 Secret으로만 저장되며,
 * 프론트엔드(GitHub Pages) 코드에는 어떤 credential도 들어가지 않는다.
 *
 * 데이터 흐름:
 *   - 일정 추가/수정/삭제 → 이 파일의 콜러블 함수를 거쳐 서비스 계정으로
 *     실제 팀장 Google Calendar에 반영하고, 그 결과를 `googleEventsCache`
 *     컬렉션에도 즉시 반영한다(클라이언트는 이 컬렉션을 실시간으로
 *     구독만 하므로, 다음 정기 동기화를 기다리지 않고 바로 화면에
 *     반영된다).
 *   - `syncGoogleEvents`가 5분마다 팀장 Google Calendar 전체를 다시 읽어
 *     `googleEventsCache`를 최신 상태로 맞춘다 — 팀장님이 휴대폰에서
 *     직접 등록/수정/삭제한 일정도 이 주기 안에 반영된다.
 *   - 편집(추가/수정/삭제) 기능을 쓰려면 "편집 코드"를 한 번 확인받아야
 *     한다(verifyEditCode). 코드 원문은 서버 Secret에만 있고, 검증에
 *     성공하면 만료시간이 있는 불투명 토큰만 클라이언트에 내려준다 —
 *     그 토큰 자체는 코드가 아니므로 브라우저에 저장해도 안전하다.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------
// 설정값 — Secret은 `firebase functions:secrets:set <이름>`으로 등록.
// ---------------------------------------------------------------------
const EDIT_CODE = defineSecret('EDIT_CODE');
const GOOGLE_SERVICE_ACCOUNT_KEY = defineSecret('GOOGLE_SERVICE_ACCOUNT_KEY');
const MANAGER_CALENDAR_ID = defineString('MANAGER_CALENDAR_ID', { default: 'primary' });
const REMINDER_MODE = defineString('REMINDER_MODE', { default: 'app' }); // 'app' | 'google_default'
const REMINDER_MINUTES = defineString('REMINDER_MINUTES', { default: '30' });

const EDIT_TOKEN_TTL_DAYS = 90;
const REGION = 'asia-northeast3'; // 서울 리전

// ---------------------------------------------------------------------
// 공용 유틸
// ---------------------------------------------------------------------
function nowISO() {
  return new Date().toISOString();
}

function makeToken() {
  return [...Array(32)]
    .map(() => Math.floor(Math.random() * 36).toString(36))
    .join('');
}

function buildReminders(mode, minutes) {
  if (mode === 'google_default') return { useDefault: true };
  return { useDefault: false, overrides: [{ method: 'popup', minutes: Number(minutes) || 30 }] };
}

// 편집 토큰 검증 — 만료됐거나 없으면 HttpsError를 던진다. 모든 쓰기성
// 콜러블 함수는 진입 시 이 함수를 제일 먼저 부른다.
async function assertEditToken(token) {
  if (!token || typeof token !== 'string') {
    throw new HttpsError('unauthenticated', '편집 코드 확인이 필요합니다.');
  }
  const snap = await db.collection('editTokens').doc(token).get();
  if (!snap.exists) {
    throw new HttpsError('unauthenticated', '편집 코드 확인이 필요합니다.');
  }
  const data = snap.data();
  if (!data.expiresAt || data.expiresAt.toMillis() < Date.now()) {
    await snap.ref.delete().catch(() => {});
    throw new HttpsError('unauthenticated', '편집 코드 확인이 만료됐습니다. 다시 확인해주세요.');
  }
}

let calendarClientPromise = null;
function getCalendarClient() {
  if (calendarClientPromise) return calendarClientPromise;
  calendarClientPromise = (async () => {
    const raw = GOOGLE_SERVICE_ACCOUNT_KEY.value();
    if (!raw) throw new HttpsError('failed-precondition', 'GOOGLE_SERVICE_ACCOUNT_KEY Secret이 설정되지 않았습니다.');
    let key;
    try {
      key = JSON.parse(raw);
    } catch {
      throw new HttpsError('failed-precondition', 'GOOGLE_SERVICE_ACCOUNT_KEY 값이 올바른 JSON이 아닙니다.');
    }
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    await auth.authorize();
    return google.calendar({ version: 'v3', auth });
  })();
  return calendarClientPromise;
}

// Google Calendar API 오류를 화면에 그대로 보여줘도 되는 한글 메시지로 변환.
function describeGoogleError(err) {
  const status = err?.code || err?.response?.status;
  if (status === 403) {
    return '이 캘린더에는 일정 등록 권한이 없습니다. 팀장님 Google Calendar 공유 설정에서 서비스 계정에 "일정 변경" 권한을 부여했는지 확인해주세요.';
  }
  if (status === 404) {
    return '선택한 캘린더나 일정을 찾을 수 없습니다.';
  }
  if (status === 429) {
    return 'Google Calendar 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  }
  return `Google Calendar 요청 중 오류가 발생했습니다. (${err?.message || status || 'unknown'})`;
}

async function hasConflict({ calendar, calendarId, startISO, endISO, excludeEventId }) {
  const res = await calendar.events.list({
    calendarId,
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: true,
    maxResults: 50,
  });
  const items = (res.data.items || []).filter((e) => e.status !== 'cancelled' && e.id !== excludeEventId);
  return items.length > 0;
}

// Google Calendar API가 돌려준 이벤트 하나를 googleEventsCache 문서
// 형태로 변환해서 즉시 반영한다(다음 정기 동기화를 기다리지 않고
// 클라이언트 화면에 바로 보이게 하기 위함).
async function upsertCacheDoc(gEvent) {
  const isAllDay = Boolean(gEvent.start?.date && !gEvent.start?.dateTime);
  await db
    .collection('googleEventsCache')
    .doc(gEvent.id)
    .set({
      googleEventId: gEvent.id,
      title: gEvent.summary || '(제목 없음)',
      start: isAllDay ? `${gEvent.start.date}T00:00:00+09:00` : gEvent.start.dateTime,
      end: isAllDay ? `${gEvent.end.date}T00:00:00+09:00` : gEvent.end.dateTime,
      allDay: isAllDay,
      location: gEvent.location || '',
      memo: gEvent.description || '',
      updatedAt: gEvent.updated || nowISO(),
    });
}

// ---------------------------------------------------------------------
// 1) 편집 코드 확인
// ---------------------------------------------------------------------
exports.verifyEditCode = onCall({ region: REGION, secrets: [EDIT_CODE] }, async (request) => {
  const code = String(request.data?.code || '').trim();
  const expected = EDIT_CODE.value();
  if (!expected) {
    throw new HttpsError('failed-precondition', 'EDIT_CODE Secret이 아직 설정되지 않았습니다.');
  }
  if (!code || code !== expected) {
    throw new HttpsError('permission-denied', '편집 코드가 올바르지 않습니다.');
  }
  const token = makeToken();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + EDIT_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.collection('editTokens').doc(token).set({ createdAt: nowISO(), expiresAt });
  return { token, expiresAt: expiresAt.toMillis() };
});

// ---------------------------------------------------------------------
// 2) 일정 추가 — 승인 절차 없이 곧바로 확정하고 실제 Google Calendar에
//    생성한다(팀장 전용 달력이라 요청/승인 개념이 없다).
// ---------------------------------------------------------------------
exports.addAndConfirmRequest = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { title, start, end, location, memo } = request.data || {};
  if (!title || !start || !end) throw new HttpsError('invalid-argument', '일정명/시작/종료 시간이 필요합니다.');

  const calendar = await getCalendarClient();
  const calendarId = MANAGER_CALENDAR_ID.value();
  const conflict = await hasConflict({ calendar, calendarId, startISO: start, endISO: end });
  if (conflict) {
    return { error: '해당 시간에 이미 다른 일정이 등록되어 있습니다.\n다른 시간을 선택해주세요.' };
  }

  let created;
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        location: location || undefined,
        description: memo || undefined,
        start: { dateTime: start, timeZone: 'Asia/Seoul' },
        end: { dateTime: end, timeZone: 'Asia/Seoul' },
        reminders: buildReminders(REMINDER_MODE.value(), REMINDER_MINUTES.value()),
      },
    });
    created = res.data;
  } catch (err) {
    logger.error('addAndConfirmRequest insert failed', err);
    return { error: `Google Calendar 일정 등록에 실패했습니다.\n${describeGoogleError(err)}` };
  }

  await upsertCacheDoc(created);
  return { ok: true, googleEventId: created.id };
});

// ---------------------------------------------------------------------
// 3) 일정 수정 — 겹침 재확인 후 Google Calendar에도 반영.
// ---------------------------------------------------------------------
exports.updateEvent = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { googleEventId, patch } = request.data || {};
  if (!googleEventId || !patch) throw new HttpsError('invalid-argument', '필수 값이 없습니다.');

  const calendar = await getCalendarClient();
  const calendarId = MANAGER_CALENDAR_ID.value();

  if (patch.start && patch.end) {
    const conflict = await hasConflict({
      calendar,
      calendarId,
      startISO: patch.start,
      endISO: patch.end,
      excludeEventId: googleEventId,
    });
    if (conflict) return { error: '해당 시간에 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
  }

  let patched;
  try {
    const res = await calendar.events.patch({
      calendarId,
      eventId: googleEventId,
      requestBody: {
        summary: patch.title,
        location: patch.location,
        description: patch.memo,
        start: patch.start ? { dateTime: patch.start, timeZone: 'Asia/Seoul' } : undefined,
        end: patch.end ? { dateTime: patch.end, timeZone: 'Asia/Seoul' } : undefined,
        reminders: buildReminders(REMINDER_MODE.value(), REMINDER_MINUTES.value()),
      },
    });
    patched = res.data;
  } catch (err) {
    logger.error('updateEvent patch failed', err);
    return { error: describeGoogleError(err) };
  }

  await upsertCacheDoc(patched);
  return { ok: true };
});

// ---------------------------------------------------------------------
// 4) 일정 삭제 — Google Calendar에서 삭제하고 캐시에서도 즉시 제거.
// ---------------------------------------------------------------------
exports.deleteEventAction = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { googleEventId } = request.data || {};
  if (!googleEventId) throw new HttpsError('invalid-argument', 'googleEventId가 필요합니다.');

  try {
    const calendar = await getCalendarClient();
    await calendar.events.delete({ calendarId: MANAGER_CALENDAR_ID.value(), eventId: googleEventId });
  } catch (err) {
    // 이미 Google 쪽에서 지워진 경우(404)는 캐시만 정리하고 넘어간다.
    if (err?.code !== 404) {
      logger.error('deleteEventAction failed', err);
      return { error: describeGoogleError(err) };
    }
  }

  await db.collection('googleEventsCache').doc(googleEventId).delete().catch(() => {});
  return { ok: true };
});

// ---------------------------------------------------------------------
// 5) 팀장 Google Calendar → googleEventsCache 동기화.
//    스케줄(5분 간격) + 수동 트리거(콜러블) 둘 다 제공.
// ---------------------------------------------------------------------
async function runGoogleSync() {
  const calendar = await getCalendarClient();
  const calendarId = MANAGER_CALENDAR_ID.value();
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 최근 30일
  const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(); // 앞으로 180일

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    maxResults: 2500,
  });
  const items = (res.data.items || []).filter((e) => e.status !== 'cancelled');

  const batch = db.batch();
  const coll = db.collection('googleEventsCache');
  const existing = await coll.listDocuments();
  const seenIds = new Set(items.map((e) => e.id));
  // 더 이상 존재하지 않는(=Google에서 삭제된) 캐시 문서 정리.
  existing.forEach((docRef) => {
    if (!seenIds.has(docRef.id)) batch.delete(docRef);
  });
  items.forEach((e) => {
    const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
    batch.set(coll.doc(e.id), {
      googleEventId: e.id,
      title: e.summary || '(제목 없음)',
      start: isAllDay ? `${e.start.date}T00:00:00+09:00` : e.start.dateTime,
      end: isAllDay ? `${e.end.date}T00:00:00+09:00` : e.end.dateTime,
      allDay: isAllDay,
      location: e.location || '',
      memo: e.description || '',
      updatedAt: e.updated || nowISO(),
    });
  });
  await batch.commit();

  await db.collection('settings').doc('sync').set({
    ok: true,
    lastSyncAt: nowISO(),
    eventCount: items.length,
    message: '',
  });
}

exports.syncGoogleEvents = onSchedule(
  { schedule: 'every 5 minutes', region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] },
  async () => {
    try {
      await runGoogleSync();
    } catch (err) {
      logger.error('syncGoogleEvents failed', err);
      await db.collection('settings').doc('sync').set({
        ok: false,
        lastSyncAt: nowISO(),
        message: describeGoogleError(err),
      });
    }
  }
);

// 관리자 설정 화면의 "지금 동기화" 버튼 등에서 즉시 호출할 수 있는 수동 트리거.
exports.refreshGoogleEvents = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async () => {
  try {
    await runGoogleSync();
    return { ok: true };
  } catch (err) {
    logger.error('refreshGoogleEvents failed', err);
    await db.collection('settings').doc('sync').set({
      ok: false,
      lastSyncAt: nowISO(),
      message: describeGoogleError(err),
    });
    return { error: describeGoogleError(err) };
  }
});
