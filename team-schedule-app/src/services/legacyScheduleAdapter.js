// 다른 팀(POUR영업운영시스템)의 Firebase Realtime Database에서 팀장님
// 관련 일정만 실시간으로 읽어와, 이 앱의 공통 일정 형태로 변환하는
// 어댑터. 절대로 그 프로젝트에 쓰기(set/update/remove/push)를 하지
// 않는다 — onValue(읽기 전용 리스너)만 사용한다.
//
// 아래 값/필드명은 전부 사용자가 첨부한 "팀장일정_달력연동_필수소스.zip"
// (260722/src/App.jsx)을 직접 읽고 확인한 내용이며 추측으로 만든 값이
// 아니다. 확인한 근거는 각 항목 옆 주석에 원본 파일 기준 줄 번호를 남겨둔다.

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

// 원본 App.jsx 88~96행에서 그대로 확인한 값(다른 팀이 실제 운영 중인
// 프로젝트). 이 앱 자신의 Google Calendar/Firebase 설정과는 완전히
// 무관한 별도 프로젝트이므로, Firebase 앱 인스턴스도 이름을 분리해서
// ("legacyScheduleSource") 두 프로젝트가 서로 섞이지 않게 한다.
const LEGACY_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCzngaCcenhH1tmZ7syugpI3H1wYBVhiJQ',
  authDomain: 'test-168a4.firebaseapp.com',
  databaseURL: 'https://test-168a4-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'test-168a4',
  storageBucket: 'test-168a4.firebasestorage.app',
  messagingSenderId: '955362696992',
  appId: '1:955362696992:web:234b098db17412be27c145',
};

const LEGACY_APP_NAME = 'legacyScheduleSource';

// 팀장님 식별값 — 코드 여러 곳에 흩어놓지 않고 이 상수 하나로만 관리한다.
// 원본 App.jsx에 "한준엽 = 팀장", "한준엽(팀장)"으로 명시적으로 주석이
// 달려 있다(6390, 15746, 18784행 등). assigneeList(1374행)에도 포함된
// 실제 사용자명이다.
export const LEGACY_TEAM_LEAD_NAME = '한준엽';

// 실시간 리스너를 붙일 루트 경로 — 원본 App.jsx 1571~1622행에서 그대로
// 확인(각 경로는 { [id]: 일정객체 } 형태, Object.values()로 배열화해서 씀).
const SOURCE_PATHS = ['pt', 'briefing', 'personal', 'seminar', 'asq', 'vacation', 'meetings', 'sales'];

// 타입별 한글 라벨 — 원본 getTypeStyle(5757행)에서 그대로 가져옴.
const TYPE_LABEL = {
  pt: 'PT',
  briefing: '현설',
  personal: '개인',
  seminar: '세미나',
  asq: '아.스.퀘',
  vacation: '휴가',
  meetings: '회의',
  sales: '영업',
};

// 원본에는 "종료시간" 필드가 어떤 타입에도 없다(date + time(HH:MM, 30분
// 단위 select) 단일 시각만 있음 — 14311~14440행 편집 폼 확인). 여기서는
// 이 앱의 카드 표시/가능시간 계산을 위해 기본 1시간 길이로 가정한다.
// 원본 데이터를 바꾸는 것이 아니라 우리 쪽 화면에서만 쓰는 추정값이다.
const DEFAULT_DURATION_MIN = 60;

function getLegacyApp() {
  const existing = getApps().find((a) => a.name === LEGACY_APP_NAME);
  if (existing) return existing;
  return initializeApp(LEGACY_FIREBASE_CONFIG, LEGACY_APP_NAME);
}

// 레코드 하나에서 "관련자 이름" 목록을 최대한 안전하게 뽑아낸다. 타입마다
// 담당자 필드명이 다르다는 걸 원본 코드로 확인했다:
//   - pt        : ptAssignee (문자열 1명, 871/1074행)
//   - briefing  : assignee (문자열, "/" 또는 "," 로 여러 명 구분, 1975행)
//   - meetings  : attendees (문자열 배열, 2266행)
//   - seminar/asq/personal/vacation : assignees (문자열 배열, 14312행 등)
//   - sales     : 두 개의 서로 다른 등록 경로가 있어(6199·13504행) 문자열
//                 assignee와 배열 assignees가 둘 다 나타날 수 있음
//                 (8192행에서도 assignees 우선, 없으면 assignee/ptAssignee
//                  순으로 fallback 하는 걸 확인) — 그래서 존재하는 필드를
//                  전부 모아서 검사한다.
//   - hiworks 동기화 휴가 : userName (2457행)
function extractNames(raw) {
  const names = new Set();
  if (Array.isArray(raw.assignees)) {
    raw.assignees.forEach((n) => { if (n) names.add(String(n).trim()); });
  }
  if (Array.isArray(raw.attendees)) {
    raw.attendees.forEach((n) => { if (n) names.add(String(n).trim()); });
  }
  if (typeof raw.assignee === 'string') {
    raw.assignee.split(/[\/,]/).forEach((n) => { if (n.trim()) names.add(n.trim()); });
  }
  if (typeof raw.ptAssignee === 'string' && raw.ptAssignee.trim()) names.add(raw.ptAssignee.trim());
  if (typeof raw.userName === 'string' && raw.userName.trim()) names.add(raw.userName.trim());
  return [...names];
}

function isTeamLeadRecord(raw, teamLeadName) {
  return extractNames(raw).some((n) => n.replace(/님$/, '') === teamLeadName);
}

function toEvent(id, raw, sourceType) {
  if (!raw || typeof raw !== 'object' || !raw.date) return null;
  const timeStr = /^\d{1,2}:\d{2}$/.test(raw.time) ? raw.time : '09:00';
  const [h, m] = timeStr.split(':').map(Number);
  const start = new Date(`${raw.date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000);

  const names = extractNames(raw);
  return {
    id: `legacy_${sourceType}_${id}`,
    source: 'shared_team_calendar',
    sourceType,
    title: raw.title || raw.siteName || raw.company || TYPE_LABEL[sourceType] || '공유 일정',
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'confirmed',
    assignee: raw.ptAssignee || raw.assignee || (Array.isArray(raw.assignees) ? raw.assignees.join(', ') : ''),
    attendees: names,
    location: raw.siteName || raw.location || raw.address || '',
    memo: raw.note || '',
    // 종료시간이 실제 데이터가 아니라 이 앱의 추정값임을 상세 팝오버에서
    // 안내하기 위한 플래그.
    approximateTime: true,
    originalData: raw,
  };
}

// 하이웍스 동기화 휴가는 date/start_time/end_time/hours가 실제로 존재한다
// (원본 2451~2470행). vacation 경로(RTDB 내부 수기 입력)와는 별도 출처.
function toVacationEventFromHiworks(v) {
  if (!v || !v.date) return null;
  const start = new Date(`${v.date}T00:00:00`);
  const end = new Date(`${v.date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  if (/^\d{1,2}:\d{2}/.test(v.start_time || '')) {
    const [h, m] = v.start_time.split(':').map(Number);
    start.setHours(h, m, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  if (/^\d{1,2}:\d{2}/.test(v.end_time || '')) {
    const [h, m] = v.end_time.split(':').map(Number);
    end.setHours(h, m, 0, 0);
  } else {
    end.setHours(18, 0, 0, 0);
  }
  if (end <= start) end.setTime(start.getTime() + DEFAULT_DURATION_MIN * 60000);

  return {
    id: `legacy_hiworks_${v.office_user_no || ''}_${v.date}_${v.start_time || ''}`,
    source: 'shared_team_calendar',
    sourceType: 'vacation',
    title: v.vacation_type_title || '휴가',
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'confirmed',
    assignee: v.user_name || '',
    attendees: v.user_name ? [v.user_name] : [],
    location: '',
    memo: v.hours ? `${v.hours}시간` : '',
    approximateTime: false,
    originalData: v,
  };
}

// 구독 시작. onUpdate(events)를 실시간(onValue)으로 계속 호출한다.
// onStatus({ok, message})로 연결/오류 상태를 알려준다(설정 화면 진단용).
// 구독 해제 함수를 반환한다.
export function subscribeLegacySchedules(onUpdate, onStatus, teamLeadName = LEGACY_TEAM_LEAD_NAME) {
  let app;
  let db;
  try {
    app = getLegacyApp();
    db = getDatabase(app);
  } catch (e) {
    onStatus?.({ ok: false, message: `공유 일정 연동 초기화 실패: ${e?.message || e}` });
    return () => {};
  }

  const byPath = {};
  let hiworksVacations = [];
  const pathOk = {};
  let settled = false;

  // onValue의 error 콜백은 "권한 거부"처럼 Firebase가 명확히 거절할 때만
  // 불린다 — 네트워크 자체가 막혀 있으면(방화벽/프록시 등) SDK가 내부적으로
  // 계속 재시도만 하고 성공도 실패도 알려주지 않을 수 있다. 그래서 일정
  // 시간 안에 응답이 하나도 없으면 "시간 초과"로 명확히 알려준다(무한
  // "확인 중…" 방지).
  const timeoutId = setTimeout(() => {
    if (!settled) {
      onStatus?.({
        ok: false,
        message: '연결 확인 시간 초과 — 네트워크 또는 Firebase 프로젝트 접근 권한을 확인해주세요.',
      });
    }
  }, 8000);

  function emit() {
    const all = [];
    for (const path of SOURCE_PATHS) {
      const data = byPath[path];
      if (!data) continue;
      for (const [id, raw] of Object.entries(data)) {
        if (!raw || typeof raw !== 'object') continue;
        if (!isTeamLeadRecord(raw, teamLeadName)) continue;
        const ev = toEvent(id, raw, path);
        if (ev) all.push(ev);
      }
    }
    for (const v of hiworksVacations) {
      if ((v.user_name || '').replace(/님$/, '') !== teamLeadName) continue;
      const ev = toVacationEventFromHiworks(v);
      if (ev) all.push(ev);
    }
    onUpdate(all);
  }

  function reportStatus() {
    const allPathsOk = SOURCE_PATHS.every((p) => pathOk[p]);
    if (allPathsOk) {
      settled = true;
      clearTimeout(timeoutId);
      onStatus?.({ ok: true, message: '' });
    }
  }

  const unsubs = SOURCE_PATHS.map((path) => {
    const r = ref(db, path);
    return onValue(
      r,
      (snapshot) => {
        byPath[path] = snapshot.val() || {};
        pathOk[path] = true;
        reportStatus();
        emit();
      },
      (error) => {
        pathOk[path] = false;
        settled = true;
        clearTimeout(timeoutId);
        onStatus?.({ ok: false, message: `공유 일정(${path}) 읽기 실패 — ${error?.message || error}` });
      }
    );
  });

  const hiworksRef = ref(db, 'hiworks_vacation_sync');
  const unsubHiworks = onValue(
    hiworksRef,
    (snapshot) => {
      const result = snapshot.val();
      const list = [];
      if (result && result.data && typeof result.data === 'object') {
        Object.values(result.data).forEach((monthData) => {
          if (Array.isArray(monthData)) list.push(...monthData);
        });
      }
      hiworksVacations = list.filter(
        (v) => v && (v.approval_status === '결재완료' || v.approval_status === '결재중')
      );
      emit();
    },
    (error) => {
      // 이 경로만 실패해도 나머지 일정(pt/briefing 등)은 계속 동작해야
      // 하므로 조용히 무시하지 않고 상태만 남긴다.
      onStatus?.({ ok: false, message: `휴가 동기화 데이터 읽기 실패 — ${error?.message || error}` });
    }
  );

  return () => {
    clearTimeout(timeoutId);
    unsubs.forEach((u) => u());
    unsubHiworks();
  };
}
