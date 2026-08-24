/**
 * team-schedule-app 공동 일정 백엔드.
 *
 * 목적: 일반 팀원이 브라우저에서 Google 계정으로 직접 로그인하지 않아도
 * 되게 한다. Google Calendar에 실제로 쓰는 주체는 이 서버(Cloud
 * Functions)뿐이고, 서버는 "서비스 계정(service account)"으로 인증한다.
 * 서비스 계정 키(JSON)는 Firebase Functions의 Secret으로만 저장되며,
 * 프론트엔드(GitHub Pages) 코드에는 어떤 credential도 들어가지 않는다.
 *
 * 데이터 흐름:
 *   - 팀원 요청/개인일정/상태 전이 → 전부 이 파일의 콜러블 함수를 거쳐
 *     Firestore `events` 컬렉션에 기록된다(클라이언트는 이 컬렉션에
 *     직접 쓸 수 없다 — firestore.rules 참고).
 *   - 확정(수락/바로 확정/시간변경 수락)될 때만 서비스 계정으로 실제
 *     팀장 Google Calendar에 이벤트를 생성/수정/삭제한다.
 *   - 팀장 Google Calendar 원본 일정은 `syncGoogleEvents`가 주기적으로
 *     읽어와 `googleEventsCache` 컬렉션에 그대로 미러링한다(클라이언트는
 *     이 컬렉션을 실시간으로 구독만 한다 — Google API를 직접 부르지 않음).
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
// 콜러블 함수(조회 전용 제외)는 진입 시 이 함수를 제일 먼저 부른다.
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
    return '선택한 캘린더를 찾을 수 없습니다. MANAGER_CALENDAR_ID 설정을 확인해주세요.';
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
// 2) 승인대기 요청 생성 (Google 미접촉)
// ---------------------------------------------------------------------
exports.addRequest = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { title, start, end, location, memo } = request.data || {};
  if (!title || !start || !end) throw new HttpsError('invalid-argument', '일정명/시작/종료 시간이 필요합니다.');
  const now = nowISO();
  const doc = {
    title,
    start,
    end,
    location: location || '',
    memo: memo || '',
    requester: '한솔',
    manager: '팀장',
    status: 'pending',
    googleCalendarEventId: null,
    createdAt: now,
    updatedAt: now,
    source: 'platform',
  };
  const ref = await db.collection('events').add(doc);
  return { ok: true, id: ref.id };
});

// ---------------------------------------------------------------------
// 3) 한솔 개인 일정 (승인 절차 없음, Google 미접촉)
// ---------------------------------------------------------------------
exports.addPersonalEvent = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { title, start, end, location, memo } = request.data || {};
  if (!title || !start || !end) throw new HttpsError('invalid-argument', '일정명/시작/종료 시간이 필요합니다.');
  const now = nowISO();
  const doc = {
    title,
    start,
    end,
    location: location || '',
    memo: memo || '',
    requester: '한솔',
    owner: 'hansol',
    status: 'confirmed',
    googleCalendarEventId: null,
    createdAt: now,
    updatedAt: now,
    source: 'hansol_personal',
  };
  const ref = await db.collection('events').add(doc);
  return { ok: true, id: ref.id };
});

// 공통: draft를 곧바로 확정 처리(겹침 확인 → Google 생성 → Firestore 기록).
async function confirmDraftOnGoogle(draft) {
  const calendar = await getCalendarClient();
  const calendarId = MANAGER_CALENDAR_ID.value();
  const conflict = await hasConflict({ calendar, calendarId, startISO: draft.start, endISO: draft.end });
  if (conflict) {
    return { error: '해당 시간에 이미 다른 일정이 등록되어 있습니다.\n다른 시간을 선택해주세요.' };
  }
  let created;
  try {
    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: draft.title,
        location: draft.location || undefined,
        description: draft.memo || undefined,
        start: { dateTime: draft.start, timeZone: 'Asia/Seoul' },
        end: { dateTime: draft.end, timeZone: 'Asia/Seoul' },
        reminders: buildReminders(REMINDER_MODE.value(), REMINDER_MINUTES.value()),
      },
    });
    created = res.data;
  } catch (err) {
    logger.error('confirmDraftOnGoogle insert failed', err);
    return { error: `Google Calendar 일정 등록에 실패했습니다.\n${describeGoogleError(err)}` };
  }
  return { ok: true, googleEventId: created.id };
}

// ---------------------------------------------------------------------
// 4) 한솔이 "승인 없이 바로 확정"
// ---------------------------------------------------------------------
exports.addAndConfirmRequest = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { title, start, end, location, memo } = request.data || {};
  if (!title || !start || !end) throw new HttpsError('invalid-argument', '일정명/시작/종료 시간이 필요합니다.');
  const draft = { title, start, end, location: location || '', memo: memo || '' };
  const result = await confirmDraftOnGoogle(draft);
  if (result.error) return { error: result.error };

  const now = nowISO();
  const ref = await db.collection('events').add({
    ...draft,
    requester: '한솔',
    manager: '팀장',
    status: 'confirmed',
    googleCalendarEventId: result.googleEventId,
    createdAt: now,
    updatedAt: now,
    source: 'platform',
  });
  return { ok: true, id: ref.id };
});

// ---------------------------------------------------------------------
// 5) 팀장 수락 (pending → confirmed, Google 실제 생성)
// ---------------------------------------------------------------------
exports.acceptRequest = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  const ref = db.collection('events').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: '요청을 찾을 수 없습니다.' };
  const target = snap.data();

  const result = await confirmDraftOnGoogle(target);
  if (result.error) return { error: result.error };

  await ref.update({ status: 'confirmed', googleCalendarEventId: result.googleEventId, updatedAt: nowISO() });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 6) 거절 (Google 미접촉)
// ---------------------------------------------------------------------
exports.rejectRequest = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id, reason, detail } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  const now = nowISO();
  await db.collection('events').doc(id).update({
    status: 'rejected',
    rejectionReason: reason || 'unavailable',
    rejectionDetail: detail || '',
    updatedAt: now,
    rejectedAt: now,
  });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 7) 팀장 시간변경 제안 (Google 미접촉)
// ---------------------------------------------------------------------
exports.proposeReschedule = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id, proposedStart, proposedEnd } = request.data || {};
  if (!id || !proposedStart || !proposedEnd) throw new HttpsError('invalid-argument', '필수 값이 없습니다.');
  await db.collection('events').doc(id).update({
    status: 'reschedule_requested',
    proposedStart,
    proposedEnd,
    updatedAt: nowISO(),
  });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 8) 한솔이 시간변경 수락 → confirmed, Google 실제 생성(제안된 시간으로)
// ---------------------------------------------------------------------
exports.acceptReschedule = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  const ref = db.collection('events').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: '요청을 찾을 수 없습니다.' };
  const target = snap.data();
  if (!target.proposedStart || !target.proposedEnd) return { error: '제안된 시간이 없습니다.' };

  const result = await confirmDraftOnGoogle({ ...target, start: target.proposedStart, end: target.proposedEnd });
  if (result.error) return { error: result.error };

  await ref.update({
    start: target.proposedStart,
    end: target.proposedEnd,
    proposedStart: admin.firestore.FieldValue.delete(),
    proposedEnd: admin.firestore.FieldValue.delete(),
    status: 'confirmed',
    googleCalendarEventId: result.googleEventId,
    updatedAt: nowISO(),
  });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 9) "다른 시간 선택" — 제안 거절 처리(Google 미접촉)
// ---------------------------------------------------------------------
exports.cancelReschedule = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  await db.collection('events').doc(id).update({ status: 'rejected', updatedAt: nowISO(), rejectedAt: nowISO() });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 10) 승인대기 요청 취소(요청자 본인) — 아직 Google에 없으므로 그냥 삭제
// ---------------------------------------------------------------------
exports.cancelOwnRequest = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  await db.collection('events').doc(id).delete();
  return { ok: true };
});

// ---------------------------------------------------------------------
// 11) 일정 수정 — pending/개인일정은 Firestore만, confirmed(Google 연동)는
//     겹침 재확인 후 Google도 함께 patch.
// ---------------------------------------------------------------------
exports.updateEvent = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id, patch } = request.data || {};
  if (!id || !patch) throw new HttpsError('invalid-argument', '필수 값이 없습니다.');
  const ref = db.collection('events').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: '일정을 찾을 수 없습니다.' };
  const target = snap.data();

  const nextStart = patch.start ?? target.start;
  const nextEnd = patch.end ?? target.end;
  if (new Date(nextStart) >= new Date(nextEnd)) {
    return { error: '시작 시간이 종료 시간보다 빨라야 합니다.' };
  }

  if (target.status !== 'confirmed' || !target.googleCalendarEventId) {
    await ref.update({ ...patch, updatedAt: nowISO() });
    return { ok: true };
  }

  const calendar = await getCalendarClient();
  const calendarId = MANAGER_CALENDAR_ID.value();
  const conflict = await hasConflict({
    calendar,
    calendarId,
    startISO: nextStart,
    endISO: nextEnd,
    excludeEventId: target.googleCalendarEventId,
  });
  if (conflict) return { error: '해당 시간에 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };

  try {
    await calendar.events.patch({
      calendarId,
      eventId: target.googleCalendarEventId,
      requestBody: {
        summary: patch.title,
        location: patch.location,
        description: patch.memo,
        start: patch.start ? { dateTime: patch.start, timeZone: 'Asia/Seoul' } : undefined,
        end: patch.end ? { dateTime: patch.end, timeZone: 'Asia/Seoul' } : undefined,
        reminders: buildReminders(REMINDER_MODE.value(), REMINDER_MINUTES.value()),
      },
    });
  } catch (err) {
    logger.error('updateEvent patch failed', err);
    return { error: describeGoogleError(err) };
  }

  await ref.update({ ...patch, updatedAt: nowISO() });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 12) 일정 삭제 — confirmed(Google 연동)는 Google에서도 삭제.
// ---------------------------------------------------------------------
exports.deleteEventAction = onCall({ region: REGION, secrets: [GOOGLE_SERVICE_ACCOUNT_KEY] }, async (request) => {
  await assertEditToken(request.data?.token);
  const { id } = request.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id가 필요합니다.');
  const ref = db.collection('events').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { error: '일정을 찾을 수 없습니다.' };
  const target = snap.data();

  if (target.status === 'confirmed' && target.googleCalendarEventId) {
    try {
      const calendar = await getCalendarClient();
      await calendar.events.delete({ calendarId: MANAGER_CALENDAR_ID.value(), eventId: target.googleCalendarEventId });
    } catch (err) {
      // 이미 Google 쪽에서 지워진 경우(404)는 그냥 우리 쪽도 정리하고 넘어간다.
      if (err?.code !== 404) {
        logger.error('deleteEventAction failed', err);
        return { error: describeGoogleError(err) };
      }
    }
  }

  await ref.delete();
  return { ok: true };
});

// ---------------------------------------------------------------------
// 13) 한솔 동행 토글 — 원본 일정을 복제하지 않고 id(Set)만 관리.
// ---------------------------------------------------------------------
exports.toggleAccompany = onCall({ region: REGION }, async (request) => {
  await assertEditToken(request.data?.token);
  const { key } = request.data || {};
  if (!key) throw new HttpsError('invalid-argument', 'key가 필요합니다.');
  const ref = db.collection('settings').doc('accompany');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ids = new Set(snap.exists ? snap.data().ids || [] : []);
    if (ids.has(key)) ids.delete(key);
    else ids.add(key);
    tx.set(ref, { ids: [...ids] });
  });
  return { ok: true };
});

// ---------------------------------------------------------------------
// 14) 팀장 Google Calendar → googleEventsCache 동기화.
//     스케줄(5분 간격) + 수동 트리거(콜러블) 둘 다 제공.
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
// 편집 코드 없이도(=읽기 성격) 호출 가능하지만, 남용 방지를 위해 최소한
// editToken 여부와 무관하게 호출량 자체는 Cloud Functions 기본 과금/쿼터로
// 제한된다. 필요하면 이후 관리자 전용 토큰으로 더 좁혀도 된다.
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
