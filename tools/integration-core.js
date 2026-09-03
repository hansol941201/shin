/* ===========================================================================
 * integration-core.js — 원본 파트너 대시보드 데이터 → 업체 단위 통합 로직
 *
 * Node(빌드 스크립트)와 브라우저(목록 HTML의 동기화 버튼)가 **같은 코드**를 쓰도록
 * 분리한 모듈입니다. 파일 입출력도 네트워크 호출도 하지 않는 순수 함수입니다.
 *
 *   const payload = IntegrationCore.build({
 *     DATA,             // 원본 index.html 의 `const DATA` 시드 (필수)
 *     overrides,        // Firebase/localStorage 수정분 (선택, 기본 {})
 *     changelog, checklist,
 *     generatedAt, sourceUpdatedAt, sourceUrl,
 *   });
 *
 * 원본 사이트는 시드 위에 Firebase 수정분을 덮어써서 화면을 그립니다.
 * applySiteOverrides() 가 그 병합을 원본과 같은 규칙으로 재현합니다.
 * =========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IntegrationCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ─────────────────────────────────────────────────────────────
// 원본 사이트의 수정분 병합 재현
//
// 원본은 Firebase Realtime Database 의 partner/* 키를 localStorage 로 내려받아
// 시드 데이터에 덮어씁니다. 아래는 원본의 applyAdds() / applyOverrides() /
// getPartnerListData() 와 같은 규칙입니다.
// ─────────────────────────────────────────────────────────────
const FB_KEY_ESCAPES = [['.', '%2E'], ['#', '%23'], ['$', '%24'], ['/', '%2F'], ['[', '%5B'], [']', '%5D']];
function fbUnescapeKeys(val) {
  if (Array.isArray(val)) return val.map(fbUnescapeKeys);
  if (val && typeof val === 'object') {
    const out = {};
    Object.keys(val).forEach(k => {
      let real = k;
      FB_KEY_ESCAPES.forEach(([ch, esc]) => { real = real.split(esc).join(ch); });
      out[real] = fbUnescapeKeys(val[k]);
    });
    return out;
  }
  return val;
}

/** Firebase 스냅샷(partner/*)을 원본 규칙대로 시드에 반영한 새 DATA 를 돌려준다. */
function applySiteOverrides(seed, rawOverrides) {
  const DATA = JSON.parse(JSON.stringify(seed));
  const o = fbUnescapeKeys(rawOverrides || {});
  const get = (k, def) => (o[k] === undefined || o[k] === null ? def : o[k]);
  const applied = [];

  // 1) 신규 MOU — 추가 → 수정 → 삭제 (원본 순서와 동일)
  const newMouAdds = get('newMouAdds', []);
  if (Array.isArray(newMouAdds) && newMouAdds.length) {
    newMouAdds.forEach(item => {
      if (item && item.company && !DATA.newMou.some(c => c.company === item.company)) {
        DATA.newMou.push(Object.assign({}, item, { _added: true }));
      }
    });
    applied.push(`newMouAdds ${newMouAdds.length}건`);
  }
  const mouOverrides = get('mouOverrides', {});
  const moKeys = Object.keys(mouOverrides || {});
  if (moKeys.length) {
    DATA.newMou.forEach(c => {
      if (mouOverrides[c.company]) Object.assign(c, mouOverrides[c.company], { _modified: true });
    });
    applied.push(`mouOverrides ${moKeys.length}건`);
  }
  const mouDeleted = get('mouDeleted', []);
  if (Array.isArray(mouDeleted) && mouDeleted.length) {
    const del = new Set(mouDeleted);
    DATA.newMou = DATA.newMou.filter(c => !del.has(c.company));
    applied.push(`mouDeleted ${mouDeleted.length}건`);
  }

  // 2) 등급 — 추가 → 수정 → 삭제
  const gradeAdds = get('gradeAdds', []);
  if (Array.isArray(gradeAdds) && gradeAdds.length) {
    gradeAdds.forEach(item => {
      if (!item || !item.name) return;
      const g = item.grade || String(item.y25 || 'N')[0] || 'N';
      if (!DATA.grades[g]) DATA.grades[g] = [];
      const exists = Object.keys(DATA.grades).some(k => (DATA.grades[k] || []).some(c => c.name === item.name));
      if (!exists) {
        const copy = Object.assign({}, item); delete copy.grade;
        DATA.grades[g].push(Object.assign(copy, { _added: true }));
      }
    });
    applied.push(`gradeAdds ${gradeAdds.length}건`);
  }
  const gradeOverrides = get('gradeOverrides', {});
  const goKeys = Object.keys(gradeOverrides || {});
  if (goKeys.length) {
    Object.keys(DATA.grades).forEach(g => {
      (DATA.grades[g] || []).forEach(c => {
        if (gradeOverrides[c.name]) Object.assign(c, gradeOverrides[c.name], { _modified: true });
      });
    });
    applied.push(`gradeOverrides ${goKeys.length}건`);
  }
  const gradeDeleted = get('gradeDeleted', []);
  if (Array.isArray(gradeDeleted) && gradeDeleted.length) {
    const del = new Set(gradeDeleted);
    Object.keys(DATA.grades).forEach(g => { DATA.grades[g] = (DATA.grades[g] || []).filter(c => !del.has(c.name)); });
    applied.push(`gradeDeleted ${gradeDeleted.length}건`);
  }

  // 3) 협력업체 리스트 — 삭제 → 수정 → 추가 (원본 getPartnerListData 와 동일)
  ['internal', 'contractor', 'external'].forEach(view => {
    const base = (DATA.partnerList && DATA.partnerList[view]) || [];
    const ov = get('partnerList_' + view + '_overrides', {}) || {};
    const adds = get('partnerList_' + view + '_adds', []) || [];
    const dels = get('partnerList_' + view + '_deletes', []) || [];
    if (!Object.keys(ov).length && !adds.length && !dels.length) return;
    let data = base.filter(c => dels.indexOf(c.company) < 0)
                   .map(c => (ov[c.company] ? Object.assign({}, c, ov[c.company], { _modified: true }) : c));
    data = data.concat(adds.map(c => {
      const merged = ov[c.company] ? Object.assign({}, c, ov[c.company]) : c;
      return Object.assign({}, merged, { _added: true });
    }));
    DATA.partnerList[view] = data;
    applied.push(`${view}: 수정 ${Object.keys(ov).length} / 추가 ${adds.length} / 삭제 ${dels.length}`);
  });

  // 4) 허들·보류 액션 결정 — 원본에서는 화면 셀렉트로만 쓰이므로 별도로 넘긴다
  const hurdleActions = fbUnescapeKeys(get('hurdleActions', {})) || {};

  return { DATA, hurdleActions, applied };
}

/**
 * 원본 index.html 문자열에서 내장 데이터를 꺼낸다.
 * 원본은 빌드 단계가 없는 단일 HTML 이고 기준 데이터가 `const DATA = {...}` 한 줄에 들어 있다.
 */
function parseSourceHtml(html) {
  const m = html.match(/^const DATA = (\{.*\});\s*$/m);
  if (!m) throw new Error('index.html 에서 const DATA 시드를 찾지 못했습니다. 원본 구조가 바뀌었을 수 있습니다.');
  const DATA = JSON.parse(m[1]);

  // `const NAME = [ ... ];` 블록을 대괄호 균형으로 잘라 JSON5 없이 평가한다.
  function arrayConst(name) {
    const at = html.indexOf('const ' + name + ' = [');
    if (at < 0) return [];
    const open = html.indexOf('[', at);
    let depth = 0, end = -1, inStr = null, esc = false;
    for (let i = open; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) return [];
    try { return Function('"use strict";return (' + html.slice(open, end) + ');')(); }
    catch (e) { return []; }
  }

  return { DATA, changelog: arrayConst('CHANGELOG'), checklist: arrayConst('CHECKLIST_DATA') };
}

/**
 * 통합 payload → 목록 화면용 경량 행 배열.
 * 빌드 시점과 동기화 시점이 같은 함수를 쓰도록 코어에 둔다.
 */
function toListRows(payload) {
  return payload.companies.map(function (c, i) {
    return {
      n: i + 1,
      id: c.id,
      name: c.companyName,
      names: c.originalNames,
      code: c.companyCode,
      bizno: c.businessNumber,
      status: c.mou.status,
      cand: c.mou.statusCandidate,
      stage: c.mou.stage,
      partner: c.isExistingPartner,
      newco: c.isNewCompany,
      grade: c.grade,
      mou: c.mou.signedAt,
      year: c.mou.signedAt ? c.mou.signedAt.slice(0, 4) : null,
      qs: c.mou.questionnaireSentAt,
      qr: c.mou.questionnaireReceivedAt,
      m1: c.mou.firstMeetingCompletedAt,
      m2: c.mou.secondMeetingCompletedAt,
      raw: c.mou.rawLabels,
      skipped: c.mou.skippedSteps || [],
      mouSource: c.mou.signedAtSource,
      dateRes: c.dateResolution,
      plMark: c.mou.partnerListMouMark,
      attempts: (c.mou.attempts || []).length > 1 ? c.mou.attempts : null,
      last: c.lastActivityAt,
      days: c.mou.elapsedDays,
      stalled: c.mou.isStalled,
      hold: c.hold.isOnHold,
      holdReason: c.hold.reason,
      action: c.mou.nextAction,
      suspect: c.hold.isSuspectedHold,
      tabs: c.sourceTabs,
      region: c.profile.region,
      ceo: c.profile.ceo,
      phone: c.profile.phone,
      email: c.profile.email,
      addr: c.profile.address,
      capital: c.profile.capital,
      sites: c.sites.map(function (x) { return x.rawText; }),
      notes: c.notes,
      gh: c.gradeHistory,
      sales: c.salesTotal,
      v: c.validation,
    };
  });
}

/** 통합 실행 */
function build(input) {
  const DATA = input.DATA;
  const HURDLE_ACTIONS = input.hurdleActions || {};
  const CHANGELOG = input.changelog || [];
  const CHECKLIST_DATA = input.checklist || [];
  const GENERATED_AT = input.generatedAt;
  const SOURCE_PUBLISHED_AT = input.sourceUpdatedAt;
  const SOURCE_URL = input.sourceUrl;
  const OVERRIDES_APPLIED = input.overridesApplied || null;

// ─────────────────────────────────────────────────────────────
// 1. 상수 / 유틸
// ─────────────────────────────────────────────────────────────
const STATUS = {
  DONE:      'MOU 체결 완료',
  DONE_NODATE: 'MOU 체결 완료·체결일 미확인',
  ONGOING:   'MOU 진행 중',
  HOLD:      '허들·보류',
  CLOSED:    '종결',
  PARTNER_UNKNOWN: '기존 협력업체·MOU 상태 확인 필요',
  CONFLICT:  '상태 충돌·담당자 확인 필요',
};

/** 원본 사이트 recalcStage() 와 동일한 단계 산출 (사이트가 화면에 실제로 그리는 값) */
const STAGE = {
  0: '질문서 발송·회신 대기',
  1: '1차 미팅 대기',
  2: '1차 미팅 완료',
  3: '2차 미팅 대기',
  4: '2차 미팅 완료·MOU 체결 준비',
  5: 'MOU 체결',
};
function recalcStage(c) {
  if (c.mouDone) return 5;
  if (c.m2Done || c.m2Skipped) return 4;
  if (c.m2Scheduled) return 3;
  if (c.m1Done || c.m1Skipped) return 2;
  if (c.qReplyDone || c.qReplySkipped || c.m1Scheduled) return 1;
  return 0;
}

const LEGAL_RE = /㈜|\(주\)|（주）|주식회사|\(유\)|유한회사|\(사\)|\(재\)|\(합\)|\(주\s*\)/g;
const normName = (s) => String(s || '').replace(LEGAL_RE, '').replace(/\s+/g, '').toLowerCase();
const looseName = (s) => normName(s).replace(/[.·・\-_,'"()[\]&/]/g, '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const pad2 = (n) => String(n).padStart(2, '0');

/** "ㅇ 24.04.17" · "o 23.11.29" · "24.2.29" → "2024-04-17". 그 외 → null */
function parseDotDate(raw) {
  if (raw == null) return null;
  const mm = String(raw).trim().match(/^[^\d]*?(\d{2})\.(\d{1,2})\.(\d{1,2})[^\d]*$/);
  if (!mm) return null;
  const y = 2000 + +mm[1], mo = +mm[2], dd = +mm[3];
  const d = new Date(Date.UTC(y, mo - 1, dd));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== dd) return null;
  return `${y}-${pad2(mo)}-${pad2(dd)}`;
}
const isoOr = (iso, label) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : parseDotDate(label));
const rawOf = (v) => { const s = v == null ? '' : String(v).trim(); return s || null; };
const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) : null);

// 보류 의심 표현 (요구사항: 진행 현황에 있으나 비고가 보류성인 경우)
/**
 * MOU 체결일 출처 우선순위 (숫자가 작을수록 우선)
 *   1 체결 완료 메뉴
 *   2 MOU 진행 이력 (진행 현황 / 허들·보류) — 체결 관련 원본 자료
 *   3 협력업체 리스트(내부용)
 *   4 기타 화면
 */
function MOU_DATE_PRIORITY(menu) {
  if (menu === MENU.DONE) return 1;
  if (menu === MENU.PROGRESS || menu === MENU.HOLD) return 2;
  if (menu === MENU.PL_INTERNAL) return 3;
  return 4;
}

const HOLD_WORDS = ['협약보류', '협약진행안함', '협약진행x', '진행x', '중단', '종결', '재검토', '추후진행', '연락두절'];
const squash = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

// ─────────────────────────────────────────────────────────────
// 2. 메뉴별 원본 행 수집
// ─────────────────────────────────────────────────────────────
const NEWMOU_EXCLUDE = new Set(['S','A','B','C','D','N','F','9','S등급','A등급','B등급','C등급','D등급','N등급','F등급','업체명','총계','구분','등급','구분(등급)','고객군 총계','등급설정X 및 입주자대표']);
const newMou = (DATA.newMou || []).filter(c => c && c.company && String(c.company).trim() && !NEWMOU_EXCLUDE.has(String(c.company).trim()));

const MENU = {
  PROGRESS: '진행 현황',
  DONE: '체결 완료',
  HOLD: '허들·보류',
  PL_INTERNAL: '협력업체 리스트(내부용)',
  PL_CONTRACTOR: '협력업체 리스트(시공사 발송용)',
  PL_EXTERNAL: '협력업체 리스트(외부 발송용)',
  GRADES: '등급 현황',
  Y25: '연도별 등급(2025)',
  Y24: '연도별 등급(2024)',
  Y23: '연도별 등급(2023)',
};

const tabProgress = newMou.filter(c => !c.hurdle && !c.mouDone);
const tabDone     = newMou.filter(c => !c.hurdle && c.mouDone);
const tabHold     = newMou.filter(c => c.hurdle);
const plInternal   = DATA.partnerList.internal   || [];
const plContractor = DATA.partnerList.contractor || [];
const plExternal   = DATA.partnerList.external   || [];
const isAggregateRow = (n) => !n || NEWMOU_EXCLUDE.has(String(n).trim());
const gradeRows = Object.entries(DATA.grades || {}).flatMap(([g, rows]) => rows.map(r => ({ grade: g, ...r })));
const y25all = DATA.year25 || [], y24all = DATA.year24 || [], y23all = DATA.year23 || [];
// 연도별 등급 표에는 '총계'·'고객군 총계'·'등급설정X 및 입주자대표' 같은 집계 행이 섞여 있어 업체에서 제외한다.
const y25 = y25all.filter(r => !isAggregateRow(r.name));
const y24 = y24all.filter(r => !isAggregateRow(r.name));
const y23 = y23all.filter(r => !isAggregateRow(r.name));
const aggregateRowsSkipped = [...y25all, ...y24all, ...y23all].filter(r => isAggregateRow(r.name)).map(r => r.name);

// 메뉴가 화면에 표시하는 건수(사이트 자체 집계) vs 실제 수집 건수
const menuCounts = [
  { menu: MENU.PROGRESS,      siteShows: DATA.meta.newMouPending,        collected: tabProgress.length },
  { menu: MENU.DONE,          siteShows: DATA.meta.newMouDone,           collected: tabDone.length },
  { menu: MENU.HOLD,          siteShows: DATA.meta.newMouHurdle,         collected: tabHold.length },
  { menu: MENU.PL_INTERNAL,   siteShows: plInternal.length,              collected: plInternal.length },
  { menu: MENU.PL_CONTRACTOR, siteShows: plContractor.length,            collected: plContractor.length },
  { menu: MENU.PL_EXTERNAL,   siteShows: plExternal.length,              collected: plExternal.length },
  { menu: MENU.GRADES,        siteShows: DATA.meta.totalGradeCompanies,  collected: gradeRows.length },
  { menu: MENU.Y25,           siteShows: y25all.length,                  collected: y25.length },
  { menu: MENU.Y24,           siteShows: y24all.length,                  collected: y24.length },
  { menu: MENU.Y23,           siteShows: y23all.length,                  collected: y23.length },
].map(r => ({
  ...r,
  match: r.siteShows === r.collected,
  note: r.siteShows === r.collected ? null
    : `표시 건수에 업체가 아닌 집계 행(${[...new Set(aggregateRowsSkipped)].join(', ')})이 포함되어 있어 업체 수집에서 제외했습니다.`,
}));

// ─────────────────────────────────────────────────────────────
// 3. 업체 통합 레지스트리
//    식별 우선순위: ① 업체코드 → ② 사업자등록번호 → ③ 정규화 업체명
//    (①②로 이어붙은 경우에도 원본 표기는 전부 보존한다)
// ─────────────────────────────────────────────────────────────
const byName = new Map();   // 정규화 업체명 → rec
const byCode = new Map();   // 업체코드 → rec
const byBizno = new Map();  // 사업자번호(숫자) → rec
const all = [];

function newRec(name) {
  return {
    names: [], nameKeys: new Set(), codes: [], biznos: [],
    menus: [], notes: [], siteNotes: [], attempts: [],
    inProgress: false, inDone: false, inHold: false, inPartner: false, inGrades: false,
    mouDoneFlag: false,
    dates: { qSent: null, qReply: null, m1: null, m2: null, mou: null },
    rawLabels: { qSent: null, qReply: null, m1: null, m2: null, mou: null },
    mouSources: [],           // [{menu, date}]
    stageNum: null, seedStage: null,
    holdReason: null,
    profile: { region: null, ceo: null, address: null, phone: null, fax: null, email: null, capital: null, partnerNo: null, partnerNote: null },
    partnerMouMark: null,
    grade: null, gradeSales: null, gradeHistory: [],
    sitesRaw: [],
    identifiedBy: new Set(),
    conflicts: [], dateErrors: [], dupNotes: [], reviews: [], changeHistory: [],
    dateResolution: null, mouDateSource: null,
    _firstName: String(name).trim(),
  };
}

/**
 * 업체 하나를 레지스트리에서 찾거나 만든다.
 *
 * 식별 우선순위는 업체코드 → 사업자등록번호 → 정규화 업체명 이지만,
 * **자동 병합은 정규화 업체명이 일치할 때만** 수행한다.
 * 코드나 사업자번호만 같고 상호가 다른 경우는 상호 변경일 수도, 잘못 입력한 것일 수도 있어
 * 임의로 합치지 않고 '중복 의심'으로만 표시한다.
 */
const codeOwners = new Map();   // 업체코드 → [rec, ...]
const biznoOwners = new Map();  // 사업자번호 → [rec, ...]

function resolve(name, code, bizno) {
  const nk = normName(name);
  const ck = String(code || '').trim();
  const bk = digits(bizno);

  let rec = byName.get(nk) || null;
  let matchedBy = rec ? '정규화 업체명' : null;

  if (!rec && ck) {
    const owner = (codeOwners.get(ck) || []).find(r => r.nameKeys.has(nk));
    if (owner) { rec = owner; matchedBy = '업체코드'; }
  }
  if (!rec && bk) {
    const owner = (biznoOwners.get(bk) || []).find(r => r.nameKeys.has(nk));
    if (owner) { rec = owner; matchedBy = '사업자등록번호'; }
  }
  if (!rec) { rec = newRec(name); all.push(rec); matchedBy = '정규화 업체명'; }

  if (nk && !rec.nameKeys.has(nk)) { rec.nameKeys.add(nk); byName.set(nk, rec); }
  if (ck) {
    if (!rec.codes.includes(ck)) rec.codes.push(ck);
    const owners = codeOwners.get(ck) || [];
    if (!owners.includes(rec)) owners.push(rec);
    codeOwners.set(ck, owners);
  }
  if (bk) {
    if (!rec.biznos.includes(bk)) rec.biznos.push(bk);
    const owners = biznoOwners.get(bk) || [];
    if (!owners.includes(rec)) owners.push(rec);
    biznoOwners.set(bk, owners);
  }
  rec.identifiedBy.add(matchedBy);
  const n = String(name).trim();
  if (n && !rec.names.includes(n)) rec.names.push(n);
  return rec;
}
const addMenu = (rec, m) => { if (!rec.menus.includes(m)) rec.menus.push(m); };
const addNote = (rec, source, text) => {
  const t = rawOf(text); if (!t) return;
  if (!rec.notes.some(n => n.source === source && n.text === t)) rec.notes.push({ source, text: t });
};

// 3-1) 신규 MOU 3개 메뉴 ------------------------------------------------
// 같은 업체가 여러 행으로 존재할 수 있다(예: 1차 시도가 허들 처리된 뒤 재접근해 체결).
// 행을 뭉개서 섞지 않고 행 단위로 attempts 에 보존한 뒤, 가장 진행된 행을 대표 타임라인으로 삼는다.
for (const c of newMou) {
  const menu = c.hurdle ? MENU.HOLD : (c.mouDone ? MENU.DONE : MENU.PROGRESS);
  const rec = resolve(c.company, null, null);
  addMenu(rec, menu);
  if (menu === MENU.PROGRESS) rec.inProgress = true;
  if (menu === MENU.DONE) rec.inDone = true;
  if (menu === MENU.HOLD) rec.inHold = true;
  rec.mouDoneFlag = rec.mouDoneFlag || !!c.mouDone;

  const attempt = {
    menu,
    sourceName: String(c.company).trim(),
    stageNumber: recalcStage(c),
    stage: STAGE[recalcStage(c)],
    seedStage: c.stage,
    isHold: !!c.hurdle,
    dates: {
      qSent: isoOr(c.qSent, c.qSentLabel), qReply: isoOr(c.qReply, c.qReplyLabel),
      m1: isoOr(c.m1, c.m1Label), m2: isoOr(c.m2, c.m2Label), mou: isoOr(c.mou, c.mouLabel),
    },
    rawLabels: {
      qSent: rawOf(c.qSentLabel), qReply: rawOf(c.qReplyLabel),
      m1: rawOf(c.m1Label), m2: rawOf(c.m2Label), mou: rawOf(c.mouLabel),
    },
    note: rawOf(c.note),
    siteText: rawOf(c.site),
  };
  rec.attempts.push(attempt);

  if (attempt.dates.mou) rec.mouSources.push({ menu, date: attempt.dates.mou });
  if (c.site) {
    for (const line of String(c.site).split(/[\n;]+/).map(x => x.trim()).filter(Boolean)) {
      rec.sitesRaw.push({ text: line, menu });
    }
  }
  addNote(rec, menu, c.note);
  if (c.hurdle) rec.holdReason = rec.holdReason || rawOf(c.note);
}

// 대표 타임라인 확정 — 가장 진행된 행(동률이면 최근 날짜)의 값만 사용한다.
for (const rec of all) {
  if (!rec.attempts.length) continue;
  const rank = (a) => {
    const d = a.dates;
    return [a.stageNumber, (d.mou || d.m2 || d.m1 || d.qReply || d.qSent || '')].join('|');
  };
  const primary = [...rec.attempts].sort((x, y) => (rank(x) < rank(y) ? 1 : -1))[0];
  rec.primaryAttempt = primary;
  rec.dates = { ...primary.dates };
  rec.rawLabels = { ...primary.rawLabels };
  rec.stageNum = primary.stageNumber;
  rec.seedStage = primary.seedStage;
  rec.seedStageMismatchRows = rec.attempts.filter(a => a.seedStage != null && a.seedStage !== a.stageNumber).length;

  if (rec.attempts.length > 1) {
    rec.reviews.push(
      `신규 MOU 프로세스에 이 업체 행이 ${rec.attempts.length}건 있습니다 — ` +
      rec.attempts.map(a => `[${a.menu}] ${a.sourceName} (${a.stage}${a.dates.mou ? ', 체결 ' + a.dates.mou : ''})`).join(' / ') +
      `. 값을 섞지 않고 가장 진행된 행([${primary.menu}])을 대표 타임라인으로 삼았으며 나머지는 mou.attempts 에 원본 그대로 보존했습니다.`);
    // 허들 행의 '현장' 칸에 사유처럼 보이는 텍스트가 들어간 경우
    for (const a of rec.attempts) {
      if (a.isHold && !a.note && a.siteText) {
        rec.reviews.push(`허들·보류 행의 사유 칸은 비어 있고 '현장' 칸에 "${a.siteText}" 가 입력되어 있습니다 — 사유가 잘못된 칸에 들어갔을 가능성. 원본 값을 옮기지 않고 그대로 두었습니다.`);
      }
    }
  }
}

// 3-2) 협력업체 리스트 (내부용이 원장) ----------------------------------
function absorbPartner(rows, menu, master) {
  for (const r of rows) {
    if (!r || !r.company || !String(r.company).trim()) continue;
    const rec = resolve(r.company, r.code, r.bizno);
    addMenu(rec, menu);
    rec.inPartner = true;
    if (master) {
      const p = rec.profile;
      p.partnerNo = r.no ?? p.partnerNo;
      p.region = rawOf(r.region) || p.region;
      p.ceo = rawOf(r.ceo) || p.ceo;
      p.address = rawOf(r.address) || p.address;
      p.phone = rawOf(r.phone) || p.phone;
      p.fax = rawOf(r.fax) || p.fax;
      p.email = rawOf(r.email) || p.email;
      p.capital = rawOf(r.capital) || p.capital;
      p.partnerNote = rawOf(r.note) || p.partnerNote;
      addNote(rec, menu, r.note);
      const mouRaw = rawOf(r.mou);
      if (mouRaw) {
        rec.partnerMouMark = mouRaw;
        const d = parseDotDate(mouRaw);
        if (d) {
          rec.mouSources.push({ menu, date: d });
          if (!rec.dates.mou) rec.dates.mou = d;
        }
      }
    } else {
      const p = rec.profile;
      p.region = p.region || rawOf(r.region);
      p.ceo = p.ceo || rawOf(r.ceo);
      p.address = p.address || rawOf(r.address);
      p.phone = p.phone || rawOf(r.phone);
      p.fax = p.fax || rawOf(r.fax);
    }
  }
}
absorbPartner(plInternal, MENU.PL_INTERNAL, true);
absorbPartner(plContractor, MENU.PL_CONTRACTOR, false);
absorbPartner(plExternal, MENU.PL_EXTERNAL, false);

// 3-3) 등급 현황 --------------------------------------------------------
for (const g of gradeRows) {
  if (!g.name || NEWMOU_EXCLUDE.has(String(g.name).trim())) continue;
  const rec = resolve(g.name, null, null);
  addMenu(rec, MENU.GRADES);
  rec.inGrades = true;
  rec.grade = g.grade;
  if (typeof g.sales === 'number' && g.sales > 0) rec.gradeSales = g.sales;
  const hist = { 2025: g.y25, 2024: g.y24, 2023: g.y23, 2022: g.y22 };
  for (const [y, v] of Object.entries(hist)) {
    if (v) rec.gradeHistory.push({ year: +y, grade: v, source: MENU.GRADES });
  }
}
// 3-4) 연도별 등급 ------------------------------------------------------
function absorbYear(rows, menu, baseYear, keys) {
  for (const r of rows) {
    if (!r || !r.name || NEWMOU_EXCLUDE.has(String(r.name).trim())) continue;
    const rec = resolve(r.name, null, null);
    addMenu(rec, menu);
    keys.forEach((k, idx) => {
      const v = r[k];
      if (v) rec.gradeHistory.push({ year: baseYear - idx, grade: v, source: menu });
    });
    if (typeof r.sales === 'number' && r.sales > 0 && baseYear === 2025 && rec.gradeSales == null) rec.gradeSales = r.sales;
    addNote(rec, menu, r.note);
  }
}
absorbYear(y25, MENU.Y25, 2025, ['y25', 'y24', 'y23', 'y22']);
absorbYear(y24, MENU.Y24, 2024, ['y_cur', 'y_p1', 'y_p2', 'y_p3']);
absorbYear(y23, MENU.Y23, 2023, ['y_cur', 'y_p1', 'y_p2', 'y_p3']);

// ─────────────────────────────────────────────────────────────
// 4. 레코드별 파생값 / 검증
// ─────────────────────────────────────────────────────────────
for (const rec of all) {
  // 4-1) 등급 이력 정리 (연도별 1건, 출처 병합, 불일치 표시)
  const gh = new Map();
  for (const h of rec.gradeHistory) {
    if (!gh.has(h.year)) gh.set(h.year, { year: h.year, grade: h.grade, sources: [h.source], conflictingGrades: [] });
    else {
      const e = gh.get(h.year);
      if (!e.sources.includes(h.source)) e.sources.push(h.source);
      if (e.grade !== h.grade && !e.conflictingGrades.some(x => x.grade === h.grade)) {
        e.conflictingGrades.push({ grade: h.grade, source: h.source });
      }
    }
  }
  rec.gradeHistory = [...gh.values()].sort((a, b) => b.year - a.year);
  for (const e of rec.gradeHistory) {
    if (e.conflictingGrades.length) {
      rec.reviews.push(`${e.year}년 등급이 메뉴마다 다릅니다 — ${e.sources.join('/')}: ${e.grade} vs ${e.conflictingGrades.map(c => `${c.source}: ${c.grade}`).join(', ')}`);
    }
  }

  // 4-2) MOU 체결일 출처 대조
  // 사용자 확정 규칙에 따라 출처 우선순위로 최종 체결일을 결정한다.
  //   1순위 체결 완료 메뉴 → 2순위 MOU 진행 이력(진행 현황·허들·보류) → 3순위 협력업체 리스트(내부용) → 4순위 기타
  // 1순위에 날짜가 있으면 다른 메뉴에 다른 날짜가 있어도 1순위 값을 최종값으로 쓴다.
  // 다른 메뉴의 원본 값은 지우지 않고 dateResolution.originalValues 에 보존한다.
  const uniqDates = [...new Set(rec.mouSources.map(s => s.date))];
  rec.mouDateMismatch = uniqDates.length > 1;

  const byPriority = rec.mouSources.map(s => ({ ...s, rank: MOU_DATE_PRIORITY(s.menu) }))
                                   .sort((a, b) => a.rank - b.rank);
  const completedDates = [...new Set(rec.mouSources.filter(s => s.menu === MENU.DONE).map(s => s.date))];
  const previousDisplayed = rec.dates.mou;   // 규칙 적용 전 표시값

  if (byPriority.length) {
    const top = byPriority[0];
    rec.dates.mou = top.date;
    rec.mouDateSource = top.menu;

    if (!rec.mouDateMismatch) {
      rec.dateResolution = {
        status: 'single_source',
        selectedDate: top.date,
        selectedSource: top.menu,
        originalValues: rec.mouSources.map(s => ({ source: s.menu, value: s.date })),
        rule: '메뉴 간 불일치 없음 — 기록된 체결일을 그대로 사용',
        resolutionStatus: 'resolved',
        resolutionMethod: 'single_source',
        needsReview: false,
      };
    } else if (completedDates.length === 1) {
      rec.dateResolution = {
        status: 'resolved_by_source_priority',
        selectedDate: completedDates[0],
        selectedSource: MENU.DONE,
        originalValues: rec.mouSources.map(s => ({ source: s.menu, value: s.date })),
        rule: '체결 완료 메뉴의 날짜를 최종 체결일로 사용',
        resolutionStatus: 'resolved',
        resolutionMethod: 'completed_menu_priority',
        needsReview: false,
      };
      rec.dates.mou = completedDates[0];
      rec.mouDateSource = MENU.DONE;
    } else if (completedDates.length > 1) {
      rec.dateResolution = {
        status: 'unresolved_multiple_in_completed',
        selectedDate: top.date,
        selectedSource: top.menu,
        originalValues: rec.mouSources.map(s => ({ source: s.menu, value: s.date })),
        rule: '체결 완료 메뉴 안에서 서로 다른 체결일이 발견되어 자동 확정 불가',
        resolutionStatus: 'unresolved',
        resolutionMethod: 'completed_menu_priority',
        needsReview: true,
      };
      rec.reviews.push(`[체결 완료] 메뉴 안에서 서로 다른 MOU 체결일이 발견되었습니다 — ${completedDates.join(' / ')}. 자동 확정할 수 없어 담당자 확인이 필요합니다.`);
    } else {
      rec.dateResolution = {
        status: 'unresolved_no_completed_date',
        selectedDate: top.date,
        selectedSource: top.menu,
        originalValues: rec.mouSources.map(s => ({ source: s.menu, value: s.date })),
        rule: `체결 완료 메뉴에 체결일이 없어 차순위(${top.menu}) 날짜를 사용 — 담당자 확인 필요`,
        resolutionStatus: 'unresolved',
        resolutionMethod: 'fallback_priority',
        needsReview: true,
      };
      rec.reviews.push(`MOU 체결일이 메뉴마다 다른데 [체결 완료] 메뉴에는 체결일이 없습니다 — ${rec.mouSources.map(s => `${s.menu}: ${s.date}`).join(' / ')}. 우선순위에 따라 ${top.menu} 값을 사용했으나 담당자 확인이 필요합니다.`);
    }
  } else {
    rec.dateResolution = null;
    rec.mouDateSource = null;
  }

  // 불일치를 규칙으로 처리한 사실을 변경 이력에 남긴다.
  // 표시값이 실제로 바뀌었는지(changed)까지 기록해 감사 때 구분할 수 있게 한다.
  if (rec.mouDateMismatch && rec.dateResolution) {
    rec.changeHistory.push({
      type: 'mou_date_resolution',
      previousDisplayedDate: previousDisplayed || null,
      newDisplayedDate: rec.dates.mou,
      changed: previousDisplayed !== rec.dates.mou,
      selectedSource: rec.dateResolution.selectedSource,
      conflictingValues: rec.dateResolution.originalValues,
      resolutionStatus: rec.dateResolution.resolutionStatus,
      reason: rec.dateResolution.needsReview
        ? '체결 완료 메뉴로 자동 확정할 수 없어 우선순위 차순위 값을 사용 — 담당자 확인 필요'
        : '사용자 확정 규칙에 따라 체결 완료 메뉴 날짜 우선 적용',
    });
  }

  // 허들·보류 '액션 결정' — 동기화로 Firebase 에서 받아온 경우에만 값이 있다.
  // (정적 배포 데이터에는 없어 기본은 null → '결정 미입력')
  rec.hurdleAction = null;
  for (const n of rec.names) { if (HURDLE_ACTIONS[n]) { rec.hurdleAction = HURDLE_ACTIONS[n]; break; } }

  // 4-3) 상태 판정 (우선순위) + 충돌 검출
  const holdWordHit = HOLD_WORDS.find(w => rec.notes.some(n => squash(n.text).includes(w)));
  const doneMark = rec.inDone || rec.mouDoneFlag || !!rec.partnerMouMark;

  let candidate;
  if (rec.dates.mou) candidate = STATUS.DONE;
  else if (doneMark) candidate = STATUS.DONE_NODATE;
  else if (rec.inHold) candidate = STATUS.HOLD;
  else if (rec.inProgress) candidate = STATUS.ONGOING;
  else candidate = STATUS.PARTNER_UNKNOWN;

  if (rec.inProgress && rec.inHold) rec.conflicts.push('같은 업체가 [진행 현황]과 [허들·보류]에 동시 등록되어 있습니다.');
  if (rec.inDone && rec.inHold) rec.conflicts.push('같은 업체가 [체결 완료]와 [허들·보류]에 동시 등록되어 있습니다.');
  if (rec.inProgress && rec.dates.mou) {
    rec.conflicts.push(`[진행 현황](미체결)에 있으나 MOU 체결일(${rec.dates.mou})이 ${rec.mouSources.map(s => s.menu).join('/')}에 입력되어 있습니다.`);
  }
  if (rec.inHold && rec.dates.mou) rec.conflicts.push(`[허들·보류]에 있으나 MOU 체결일(${rec.dates.mou})이 입력되어 있습니다.`);
  if (rec.inProgress && holdWordHit) {
    rec.conflicts.push(`[진행 현황]에 있으나 비고에 보류성 표현("${holdWordHit}")이 있습니다 — 보류 의심.`);
    rec.holdSuspect = true;
  }

  rec.statusCandidate = candidate;
  // 체결일이 확인된 업체는 다른 메뉴에 미체결로 남아 있더라도 결국 MOU 를 체결한 곳이므로
  // 최종 상태를 'MOU 체결 완료'로 둔다. 충돌 사실은 지우지 않고 validation.statusConflict 와
  // 검증 메시지로 계속 표시한다. 체결 근거가 없는 충돌만 '상태 충돌·담당자 확인 필요'로 남긴다.
  rec.status = (rec.conflicts.length && !rec.dates.mou) ? STATUS.CONFLICT : candidate;
  rec.conflictResolvedBySigning = rec.conflicts.length > 0 && !!rec.dates.mou;
  if (rec.conflictResolvedBySigning) {
    rec.reviews.push(`다른 메뉴에 미체결(진행 현황 또는 허들·보류)로 남아 있으나 MOU 체결일(${rec.dates.mou})이 확인되어 최종 상태를 'MOU 체결 완료'로 두었습니다. 원본의 미체결 기록은 그대로 보존했으니 원본 사이트 정리가 필요합니다.`);
  }

  // 허들·보류 액션 결정이 '종결'로 확인되면 최종 상태를 '종결'로 둔다.
  // (이 값은 동기화로 Firebase 에서 받아온 경우에만 존재한다.)
  if (rec.status === STATUS.HOLD && rec.hurdleAction === '종결') rec.status = STATUS.CLOSED;

  // 4-4) 진행 단계
  if (rec.dates.mou) rec.stageNum = 5;  // 체결일이 확인되면 단계는 MOU 체결 (원본 행별 단계는 attempts 에 보존)
  rec.stageLabel = rec.stageNum == null ? null : STAGE[rec.stageNum];
  rec.seedStageMismatch = rec.seedStage != null && rec.stageNum != null && rec.seedStage !== rec.stageNum;

  // 현재 단계 진입일 = 해당 단계를 성립시킨 마지막 날짜
  const stageEntry = { 0: rec.dates.qSent, 1: rec.dates.qReply, 2: rec.dates.m1, 3: null, 4: rec.dates.m2, 5: rec.dates.mou };
  rec.currentStageDate = rec.stageNum != null ? (stageEntry[rec.stageNum] || null) : null;
  rec.lastActivityAt = rec.dates.mou || rec.dates.m2 || rec.dates.m1 || rec.dates.qReply || rec.dates.qSent || null;
  rec.elapsedDays = daysBetween(rec.currentStageDate || rec.lastActivityAt, GENERATED_AT);
  rec.isStalled = (rec.status === STATUS.ONGOING || rec.status === STATUS.HOLD || rec.statusCandidate === STATUS.ONGOING || rec.statusCandidate === STATUS.HOLD)
    && rec.elapsedDays != null && rec.elapsedDays >= 180;

  // 4-5) 날짜 순서 검증
  const seq = [['질문서 발송일', rec.dates.qSent], ['질문서 회신일', rec.dates.qReply],
               ['1차 미팅 완료일', rec.dates.m1], ['2차 미팅 완료일', rec.dates.m2], ['MOU 체결일', rec.dates.mou]]
              .filter(x => x[1]);
  for (let i = 1; i < seq.length; i++) {
    if (seq[i][1] < seq[i - 1][1]) {
      rec.dateErrors.push(`${seq[i - 1][0]}(${seq[i - 1][1]}) 보다 ${seq[i][0]}(${seq[i][1]})이(가) 더 빠릅니다.`);
    }
  }

  // 4-6) 확인 필요 사항
  if (rec.status === STATUS.DONE_NODATE || rec.statusCandidate === STATUS.DONE_NODATE) {
    rec.reviews.push('체결 완료로 표시되어 있으나 체결일이 확인되지 않습니다. 날짜를 추정하지 않고 미확인으로 둡니다.');
  }
  if (rec.statusCandidate === STATUS.PARTNER_UNKNOWN) {
    rec.reviews.push('협력업체 리스트/등급 현황에만 존재하고 MOU 진행·체결 근거가 없습니다.');
  }
  // 이후 체결이 확인된 허들 이력은 결정을 기다리는 보류가 아니라 지나간 이력이다.
  rec.holdResolvedBySigning = rec.inHold && !!rec.dates.mou;
  const holdOpen = rec.inHold && !rec.holdResolvedBySigning;
  if (holdOpen && !rec.holdReason) {
    rec.reviews.push('허들·보류 사유가 기재되어 있지 않습니다.');
    const holdAttempt = rec.attempts.find(a => a.isHold && a.siteText);
    if (holdAttempt && rec.attempts.length === 1) {
      rec.reviews.push(`허들·보류 사유 칸은 비어 있고 '현장' 칸에 "${holdAttempt.siteText}" 가 입력되어 있습니다 — 사유가 잘못된 칸에 들어갔을 가능성. 원본 값을 그대로 두었습니다.`);
    }
  }
  if (holdOpen && !rec.hurdleAction) rec.reviews.push('허들·보류 액션 결정(재접근/종결/보류 유지/재발송/확인 필요)이 원본 공개 데이터에 없습니다.');
  if (rec.holdResolvedBySigning) rec.reviews.push('허들·보류에 등록된 이력이 있으나 이후 MOU 체결이 확인되어 결정 대기 대상에서 제외했습니다.');
  // 중간 단계 건너뛰기
  // 미팅 없이 바로 체결하거나 1차를 건너뛰고 체결하는 경우가 실제로 있으므로,
  // 체결이 확인된 업체는 단계가 비어 있어도 오류로 보지 않는다.
  // 대신 어떤 단계에 날짜 기록이 없는지를 중립 정보(mou.skippedSteps)로만 남긴다.
  // 아직 체결되지 않은 업체는 입력 누락일 수 있으므로 확인 필요로 계속 표시한다.
  const hasPipeline = !!(rec.dates.qSent || rec.dates.qReply || rec.dates.m1 || rec.dates.m2);
  if (rec.dates.mou) {
    rec.skippedSteps = hasPipeline
      ? [['질문서 발송', rec.dates.qSent], ['질문서 회신', rec.dates.qReply],
         ['1차 미팅', rec.dates.m1], ['2차 미팅', rec.dates.m2]]
        .filter(x => !x[1]).map(x => x[0])
      : [];
  } else {
    rec.skippedSteps = [];
    if (rec.dates.m1 && !rec.dates.qReply) rec.reviews.push('1차 미팅 기록은 있으나 질문서 회신일이 비어 있습니다.');
    if (rec.dates.m2 && !rec.dates.m1) rec.reviews.push('2차 미팅 기록은 있으나 1차 미팅일이 비어 있습니다.');
  }
  if (rec.dates.mou && !rec.inPartner) rec.reviews.push('MOU 체결일이 있으나 협력업체 리스트(내부용)에서 확인되지 않습니다.');
  if (rec.inPartner && !rec.codes.length) rec.reviews.push('협력업체 리스트에 있으나 업체코드가 비어 있습니다.');
  if (rec.seedStageMismatch) {
    rec.reviews.push(`원본 HTML 시드에 저장된 stage 값(${rec.seedStage})과 사이트가 화면에 실제로 그리는 단계(${rec.stageNum}: ${STAGE[rec.stageNum]})가 다릅니다. 사이트는 로드 시 recalcStage() 로 단계를 다시 계산하므로 화면 표시값을 채택했습니다.`);
  }
  if (rec.isStalled) rec.reviews.push(`마지막 진행 기록(${rec.lastActivityAt}) 이후 ${rec.elapsedDays}일간 후속 기록이 없습니다 — 장기 미진행.`);
  if (rec.names.length > 1) {
    rec.dupNotes.push(`원본에 표기가 다른 ${rec.names.length}건으로 등장하여 업체코드/사업자번호/정규화 업체명 기준으로 한 레코드로 통합했습니다: ${rec.names.join(' / ')}`);
  }
  if (rec.codes.length > 1) {
    rec.dupNotes.push(`같은 업체에 서로 다른 업체코드가 ${rec.codes.length}건 있습니다: ${rec.codes.join(', ')}`);
  }
}

// 4-7) 중복 "의심" (자동 병합하지 않음)
const looseGroups = new Map();
for (const rec of all) {
  for (const n of rec.names) {
    const lk = looseName(n);
    if (!lk) continue;
    if (!looseGroups.has(lk)) looseGroups.set(lk, new Set());
    looseGroups.get(lk).add(rec);
  }
}
for (const [, set] of looseGroups) {
  const grp = [...set];
  if (grp.length > 1) {
    for (const rec of grp) {
      rec.dupNotes.push(`표기(특수문자·띄어쓰기)만 다른 유사 업체명이 별도 레코드로 존재합니다: ${grp.filter(x => x !== rec).map(x => x.names[0]).join(', ')} — 자동 병합하지 않았습니다. 담당자 확인 필요.`);
    }
  }
}
// 업체코드를 서로 다른 레코드가 공유
for (const [code, owners] of codeOwners) {
  if (owners.length > 1) {
    for (const rec of owners) {
      rec.dupNotes.push(`업체코드 ${code} 를 상호가 다른 레코드와 공유합니다: ${owners.filter(x => x !== rec).map(x => x.names[0]).join(', ')} — 자동 병합하지 않았습니다. 담당자 확인 필요.`);
    }
  }
}

// 사업자번호 공유 (서로 다른 상호)
const biznoGroups = new Map();
for (const r of plInternal) {
  const b = digits(r.bizno); if (!b) continue;
  if (!biznoGroups.has(b)) biznoGroups.set(b, []);
  biznoGroups.get(b).push(r.company);
}
for (const [b, names] of biznoGroups) {
  const uniq = [...new Set(names)];
  if (uniq.length > 1) {
    for (const nm of uniq) {
      const rec = byName.get(normName(nm));
      if (rec && !rec.names.some(x => uniq.filter(y => y !== nm).includes(x))) {
        rec.dupNotes.push(`사업자등록번호 ${b} 를 다른 상호(${uniq.filter(x => x !== nm).join(', ')})와 공유합니다 — 상호 변경 또는 중복 등록 가능성. 자동 병합하지 않았습니다. 담당자 확인 필요.`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 고객관리카드용 JSON 조립
// ─────────────────────────────────────────────────────────────
const slug = (s, i) => 'C' + String(i + 1).padStart(4, '0');

const companies = all
  .sort((a, b) => a.names[0].localeCompare(b.names[0], 'ko'))
  .map((rec, i) => {
    const code = rec.codes[0] || null;
    const uniq = (arr) => [...new Set(arr)];
    const reviews = uniq(rec.reviews);
    const conflicts = uniq(rec.conflicts);
    const dateErrors = uniq(rec.dateErrors);
    const dupNotes = uniq(rec.dupNotes);

    const contacts = [];
    if (rec.profile.ceo) {
      contacts.push({
        name: rec.profile.ceo, role: '대표자', phone: rec.profile.phone || null,
        email: rec.profile.email || null, isInternal: false,
        note: null, source: MENU.PL_INTERNAL,
      });
    }

    const sales = rec.gradeSales != null ? [{ year: 2025, amount: rec.gradeSales, source: MENU.GRADES }] : [];

    return {
      id: slug(rec.names[0], i),
      companyCode: code,
      companyName: rec.names[0],
      originalNames: rec.names,
      businessNumber: rec.biznos[0] || null,
      identifiedBy: [...rec.identifiedBy],

      isExistingPartner: rec.inPartner,
      isNewCompany: rec.inProgress || rec.inDone || rec.inHold,   // 신규 MOU 프로세스로 유입된 업체
      newBadgeOnSite: rec.inDone,                                 // 원본 사이트가 '신규' 뱃지를 붙이는 기준
      grade: rec.grade,

      profile: {
        region: rec.profile.region,
        ceo: rec.profile.ceo,
        phone: rec.profile.phone,
        fax: rec.profile.fax,
        email: rec.profile.email,
        address: rec.profile.address,
        capital: rec.profile.capital,
        partnerListNo: rec.profile.partnerNo,
        registeredAt: null,
        registeredYearFromCode: code && /^\d{5}$/.test(code) ? 2000 + Number(code.slice(0, 2)) : null,
      },

      mou: {
        status: rec.status,
        statusCandidate: rec.statusCandidate,
        stage: rec.stageLabel,
        stageNumber: rec.stageNum,
        currentStageDate: rec.currentStageDate,
        elapsedDays: rec.elapsedDays,
        isStalled: rec.isStalled,
        nextAction: (rec.inHold && !rec.holdResolvedBySigning) ? (rec.hurdleAction || '결정 미입력') : null,
        nextActionDueAt: null,
        questionnaireSentAt: rec.dates.qSent,
        questionnaireReceivedAt: rec.dates.qReply,
        firstMeetingScheduledAt: null,
        firstMeetingCompletedAt: rec.dates.m1,
        firstMeetingManager: null,
        secondMeetingScheduledAt: null,
        secondMeetingCompletedAt: rec.dates.m2,
        secondMeetingManager: null,
        signedAt: rec.dates.mou,
        signedAtSource: rec.mouDateSource,
        signedAtSources: rec.mouSources,
        // 체결 업체 중 날짜 기록이 없는 단계 (생략했거나 기록되지 않음). 오류가 아니라 참고 정보.
        skippedSteps: rec.skippedSteps || [],
        rawLabels: rec.rawLabels,
        partnerListMouMark: rec.partnerMouMark,
        attempts: rec.attempts,
      },

      hold: {
        isOnHold: rec.inHold,
        startedAt: null,
        reason: rec.inHold ? (rec.holdReason || null) : null,
        decision: (rec.inHold && !rec.holdResolvedBySigning) ? (rec.hurdleAction || '결정 미입력') : null,
        nextReviewAt: null,
        isClosed: false,
        resolvedBySigning: !!rec.holdResolvedBySigning,
        needsOwnerCheck: conflicts.length > 0 || (rec.inHold && !rec.holdResolvedBySigning && !rec.holdReason),
        isSuspectedHold: !!rec.holdSuspect,
      },

      manager: { name: null, title: null, phone: null, email: null, internalOwner: null, note: null },
      contacts,

      sales,
      salesTotal: sales.reduce((a, b) => a + b.amount, 0) || null,
      gradeHistory: rec.gradeHistory,

      sites: rec.sitesRaw.map((t, k) => ({ seq: k + 1, rawText: t.text, name: null, dates: {}, source: t.menu })),
      siteCount: rec.sitesRaw.length,

      curriculumHistory: [],
      documents: [],

      dateResolution: rec.dateResolution,
      notes: rec.notes,
      changeHistory: rec.changeHistory,
      sourceTabs: rec.menus,
      lastActivityAt: rec.lastActivityAt,
      dataAsOf: SOURCE_PUBLISHED_AT,

      validation: {
        possibleDuplicate: dupNotes.length > 0,
        statusConflict: conflicts.length > 0,
        dateError: dateErrors.length > 0,
        missingMouDate: rec.statusCandidate === STATUS.DONE_NODATE,
        // 메뉴 간 체결일이 달랐다는 '사실'. 확정 규칙으로 해결되면 아래 mouDateResolved 가 true 이고
        // needsReview / dateError 에는 반영하지 않는다.
        mouDateMismatch: !!rec.mouDateMismatch,
        mouDateResolved: !!(rec.mouDateMismatch && rec.dateResolution && !rec.dateResolution.needsReview),
        mouDateNeedsReview: !!(rec.dateResolution && rec.dateResolution.needsReview),
        conflictResolvedBySigning: !!rec.conflictResolvedBySigning,
        missingHoldReason: rec.inHold && !rec.holdResolvedBySigning && !rec.holdReason,
        missingNextAction: rec.inHold && !rec.holdResolvedBySigning && !rec.hurdleAction,
        partnerWithoutMouStatus: rec.statusCandidate === STATUS.PARTNER_UNKNOWN,
        needsReview: (dupNotes.length + conflicts.length + dateErrors.length + reviews.length) > 0,
        messages: [
          ...conflicts.map(m => ({ type: 'statusConflict', message: m })),
          ...dateErrors.map(m => ({ type: 'dateError', message: m })),
          ...dupNotes.map(m => ({ type: 'possibleDuplicate', message: m })),
          ...reviews.map(m => ({ type: 'review', message: m })),
        ],
      },
    };
  });

// ─────────────────────────────────────────────────────────────
// 6. 요약 / 검증 집계
// ─────────────────────────────────────────────────────────────
const c = (f) => companies.filter(f).length;
const byStatus = {};
for (const s of Object.values(STATUS)) byStatus[s] = c(x => x.mou.status === s);
const byStatusCandidate = {};
for (const s of Object.values(STATUS)) byStatusCandidate[s] = c(x => x.mou.statusCandidate === s);
const byStage = {};
for (const [k, v] of Object.entries(STAGE)) byStage[v] = c(x => x.mou.stageNumber === +k);

const summary = {
  totalCompanies: companies.length,
  rawRowsCollected: menuCounts.reduce((a, b) => a + b.collected, 0),
  byStatus,
  byStatusCandidate,
  byStage,
  existingPartners: c(x => x.isExistingPartner),
  newPipelineCompanies: c(x => x.isNewCompany),
  graded: c(x => x.grade),
  missingMouDate: c(x => x.validation.missingMouDate),
  possibleDuplicate: c(x => x.validation.possibleDuplicate),
  statusConflict: c(x => x.validation.statusConflict),
  dateError: c(x => x.validation.dateError),
  mouDateMismatch: c(x => x.validation.mouDateMismatch),
  mouDateResolved: c(x => x.validation.mouDateResolved),
  mouDateNeedsReview: c(x => x.validation.mouDateNeedsReview),
  missingHoldReason: c(x => x.validation.missingHoldReason),
  missingNextAction: c(x => x.validation.missingNextAction),
  partnerWithoutMouStatus: c(x => x.validation.partnerWithoutMouStatus),
  stalled: c(x => x.mou.isStalled),
  needsReview: c(x => x.validation.needsReview),
  menuCounts,
};

const notCollected = [
  OVERRIDES_APPLIED
    ? { item: 'Firebase 실시간 수정분 — 동기화로 반영됨',
        reason: '목록 화면의 [원본과 동기화] 로 Firebase Realtime Database 를 직접 읽어 시드에 반영했습니다.',
        impact: `반영 내역: ${OVERRIDES_APPLIED.length ? OVERRIDES_APPLIED.join(', ') : '원격에 수정분 없음(시드와 동일)'}` }
    : { item: 'Firebase 실시간 동기화 데이터 (사용자가 화면에서 수정·추가한 최신분)',
        reason: '원본 사이트는 정적 시드 위에 Firebase Realtime Database(pour-partner-dashboard…asia-southeast1)와 브라우저 localStorage 값을 덮어써서 표시합니다. 이 빌드를 만든 작업 환경에서는 해당 도메인이 네트워크 정책으로 차단되어 접근할 수 없었습니다.',
        impact: '이 스냅샷은 GitHub Pages 에 배포된 공개 정적 기준값입니다. 목록 화면의 [원본과 동기화] 버튼을 누르면 최신 수정분까지 받아옵니다.' },
  Object.keys(HURDLE_ACTIONS).length
    ? { item: '허들·보류 “액션 결정” — 동기화로 수집됨',
        reason: '동기화 시 Firebase Realtime Database 의 hurdleActions 키에서 실제 값을 받아왔습니다.',
        impact: `${Object.keys(HURDLE_ACTIONS).length}개사의 액션 결정이 반영되었습니다.` }
    : { item: '허들·보류 “액션 결정” (재접근 / 종결 / 보류 유지 / 재발송 / 확인 필요)',
        reason: '원본에서 localStorage 키 hurdleActions 에만 저장되며 GitHub Pages 배포 데이터에 포함되지 않습니다. 목록 화면의 [원본과 동기화] 버튼으로 Firebase 에서 직접 받아올 수 있습니다.',
        impact: `허들·보류 ${c(x => x.hold.isOnHold)}개사 전건 hold.decision = "결정 미입력".` },
  { item: '담당자(1차·2차 미팅 담당자, 내부 담당자) 및 담당자 연락처',
    reason: '시드 데이터에 m1Owner/m2Owner 필드가 존재하지 않습니다(런타임에 null 로 생성). 커리큘럼 문서에 팀 단위 담당(영업팀·김수진·신명희)만 있고 업체별 매핑은 없습니다.',
    impact: 'manager.* 전건 null. 카드에서는 “미확인”으로 표시.' },
  { item: '1차·2차 미팅 “예정일”',
    reason: '시드에 m1Scheduled/m2Scheduled 필드가 없습니다(런타임 null). 일부 업체는 자유 텍스트(“일정 조율중(05.21)”, “조율중”, “양산지사 예정”)만 존재하여 mou.rawLabels 에 원문 그대로 보존했습니다.',
    impact: 'firstMeetingScheduledAt / secondMeetingScheduledAt 전건 null.' },
  { item: '업체별 MOU 자료 관리 체크리스트 (제출 서류 체크 상태)',
    reason: 'localStorage 키 companyDocs_<업체명> 에만 저장됩니다. 체크리스트 “정의”는 공개되어 있어 meta.checklistDefinition 으로 포함했습니다.',
    impact: 'documents 전건 빈 배열.' },
  { item: '현장 상세 날짜 (카달로그 요청일·기술자문·컨설팅·PT·공고·낙찰·진행일)',
    reason: '시드의 현장 정보는 구버전 자유 텍스트(c.site)뿐이고 구조화된 siteRecords 는 localStorage/Firebase 에만 있습니다. 텍스트 안의 “23.7/20” 같은 표기는 연도가 생략된 경우가 많아 날짜로 확정할 수 없습니다.',
    impact: `현장 ${companies.reduce((a, b) => a + b.siteCount, 0)}건을 sites[].rawText 원문으로만 보존, sites[].dates 는 비움.` },
  { item: '업체별 변경 이력 / 업체 등록일',
    reason: '변경사항 내역 메뉴는 사이트 전체(코드) 변경 로그이며 업체 단위 이력이 아닙니다. 등록일 필드도 원본에 없습니다.',
    impact: 'changeHistory 전건 빈 배열, profile.registeredAt = null. 업체코드 규칙(YY+3자리)으로 추정되는 연도만 registeredYearFromCode 에 참고용으로 담았습니다.' },
  { item: '2024년·2023년 매출액',
    reason: '연도별 등급(2024/2023) 데이터의 sales 값이 전건 0 이며, 해당 메뉴는 등급 스냅샷만 담고 있습니다.',
    impact: 'sales 는 2025년 실적이 있는 업체만 포함(134건).' },
  { item: '업체별 교육·커리큘럼 이수 이력',
    reason: '통합 커리큘럼 메뉴는 프로세스 정의 문서이며 업체별 이수 기록이 없습니다.',
    impact: 'curriculumHistory 전건 빈 배열. 커리큘럼 정의는 meta.curriculum 으로 포함.' },
];

const payload = {
  generatedAt: GENERATED_AT,
  sourceUpdatedAt: SOURCE_PUBLISHED_AT,
  source: {
    url: SOURCE_URL,
    repository: 'https://github.com/pourservice/partner-dashboard',
    accessMode: '읽기 전용 (원본 무수정)',
    siteLastUpdateLabelNote: '원본 사이드바의 “최종 업데이트”는 저장값이 아니라 접속일을 그대로 출력합니다(new Date().toLocaleDateString). 데이터 기준일로 사용할 수 없어, 저장소 최신 배포일(2026-07-23)을 sourceUpdatedAt 으로 사용했습니다.',
    latestDateInData: companies.map(x => x.lastActivityAt).filter(Boolean).sort().slice(-1)[0] || null,
    siteMeta: DATA.meta,
  },
  sync: {
    overridesApplied: OVERRIDES_APPLIED,
    hurdleActionCount: Object.keys(HURDLE_ACTIONS).length,
    isSynced: !!OVERRIDES_APPLIED,
  },
  statusVocabulary: Object.values(STATUS),
  stageVocabulary: Object.values(STAGE),
  summary,
  notCollected,
  meta: {
    gradeDefinitions: DATA.gradeDefs || null,
    checklistDefinition: CHECKLIST_DATA,
    curriculum: DATA.curriculum || null,
    siteChangelog: CHANGELOG,
    aggregateRowsExcluded: [...new Set(aggregateRowsSkipped)],
    siteDateFields: ['카달로그 요청일', '기술자문문의', '컨설팅 내역서 요청일', '컨설팅 내역서 발행일', 'PT 요청일', 'PT 진행일', '공고일', '낙찰일', '진행일'],
  },
  companies,
};

  return payload;
}

return {
  build: build,
  toListRows: toListRows,
  parseSourceHtml: parseSourceHtml,
  applySiteOverrides: applySiteOverrides,
  fbUnescapeKeys: fbUnescapeKeys,
};
});
