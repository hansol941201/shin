#!/usr/bin/env node
/**
 * customer-card-preview.html / customer-card-component.html / DATA-VALIDATION-REPORT.md 생성
 * companies-integrated.json 을 입력으로 삼는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'customer-card-migration');
const data = JSON.parse(fs.readFileSync(path.join(DIR, 'companies-integrated.json'), 'utf8'));
const C = data.companies;
const S = data.summary;
const find = (n) => C.find(c => c.companyName === n);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 상태별 샘플 업체 선정 ──────────────────────────────────
function pick(filter, score) {
  const cands = C.filter(filter);
  if (!cands.length) return null;
  return cands.sort((a, b) => score(b) - score(a))[0];
}
const richness = (c) =>
  (c.mou.signedAt ? 3 : 0) + (c.siteCount ? 2 : 0) + (c.grade ? 2 : 0) +
  (c.sales.length ? 2 : 0) + c.gradeHistory.length + (c.notes.length ? 1 : 0) + (c.profile.ceo ? 1 : 0);

const samples = [];

samples.push({
  heading: '1. MOU 체결 완료',
  note: `실제 수집 데이터 · 이 상태 ${S.byStatus['MOU 체결 완료']}개사.`,
  company: pick(c => c.mou.status === 'MOU 체결 완료' && !c.validation.needsReview === false ? false : c.mou.status === 'MOU 체결 완료', richness),
});

const noDateCount = S.byStatus['MOU 체결 완료·체결일 미확인'];
samples.push({
  heading: '2. MOU 체결 완료 · 체결일 미확인',
  note: `이 상태에 해당하는 업체는 원본에 <strong>0건</strong>입니다. 체결 표시(“ㅇ”, mouDone)가 있는 업체는 전건 날짜가 함께 입력되어 있었습니다. 아래 카드는 <strong>날짜를 지어내지 않기 위해 실제 업체가 아닌 스키마 시연용 레코드</strong>이며, 향후 이 상태가 발생했을 때 카드가 어떻게 보이는지만 보여줍니다.`,
  isPlaceholder: true,
  company: (() => {
    const base = pick(c => c.mou.status === 'MOU 체결 완료' && c.isExistingPartner, richness);
    const demo = JSON.parse(JSON.stringify(base));
    demo.id = 'DEMO-NODATE';
    demo.companyName = '(스키마 시연) 체결 완료·체결일 미확인';
    demo.originalNames = [];
    demo.companyCode = null;
    demo.businessNumber = null;
    demo.profile = { region: null, ceo: null, phone: null, fax: null, email: null, address: null, capital: null, partnerListNo: null, registeredAt: null, registeredYearFromCode: null };
    demo.contacts = [];
    demo.sites = []; demo.siteCount = 0;
    demo.sales = []; demo.salesTotal = null; demo.gradeHistory = []; demo.grade = null;
    demo.notes = [{ source: '주석', text: '실제 업체가 아닙니다. 상태 ②의 카드 표현을 확인하기 위한 스키마 시연 레코드입니다.' }];
    demo.mou = Object.assign({}, demo.mou, {
      status: 'MOU 체결 완료·체결일 미확인', statusCandidate: 'MOU 체결 완료·체결일 미확인',
      signedAt: null, signedAtSources: [], partnerListMouMark: 'ㅇ',
      questionnaireSentAt: null, questionnaireReceivedAt: null,
      firstMeetingCompletedAt: null, secondMeetingCompletedAt: null,
      rawLabels: { qSent: null, qReply: null, m1: null, m2: null, mou: 'ㅇ' },
      attempts: [], currentStageDate: null, elapsedDays: null, stage: 'MOU 체결', stageNumber: 5, isStalled: false,
    });
    demo.validation = {
      possibleDuplicate: false, statusConflict: false, dateError: false, missingMouDate: true,
      mouDateMismatch: false, missingHoldReason: false, missingNextAction: false,
      partnerWithoutMouStatus: false, needsReview: true,
      messages: [{ type: 'review', message: '체결 완료 표시는 있으나 체결일이 없습니다. 날짜를 추정하지 않고 미확인으로 둡니다. (현재 원본 데이터에 이 상태의 실제 업체는 0건)' }],
    };
    demo.lastActivityAt = null;
    return demo;
  })(),
});

samples.push({
  heading: '3. MOU 진행 중 — 질문서 회신 대기',
  note: `실제 수집 데이터 · 이 단계 ${S.byStage['질문서 발송·회신 대기']}개사.`,
  company: pick(c => c.mou.stageNumber === 0 && c.mou.status === 'MOU 진행 중', c => (c.mou.elapsedDays || 0)),
});
samples.push({
  heading: '4. MOU 진행 중 — 1차 미팅 대기',
  note: `실제 수집 데이터 · 이 단계 ${S.byStage['1차 미팅 대기']}개사.`,
  company: pick(c => c.mou.stageNumber === 1 && c.mou.status === 'MOU 진행 중', c => richness(c) + (c.notes.length ? 3 : 0)),
});
samples.push({
  heading: '5. MOU 진행 중 — 2차 미팅 대기',
  note: `사이트가 실제로 그리는 “2차 미팅 대기” 단계는 <strong>0개사</strong>입니다. 원본이 2차 미팅 <em>예정일</em> 필드(m2Scheduled)를 저장하지 않아 이 단계로 넘어가는 업체가 없기 때문입니다. 아래는 <strong>1차 미팅을 마치고 2차 미팅 일정을 조율 중인 실제 업체</strong>로, 2차 미팅 칸에 날짜 대신 자유 텍스트만 들어 있습니다.`,
  company: pick(c => c.mou.stageNumber === 2 && c.mou.status === 'MOU 진행 중' && c.mou.rawLabels && c.mou.rawLabels.m2, richness),
});
samples.push({
  heading: '6. 허들·보류',
  note: `실제 수집 데이터 · 이 상태 ${S.byStatus['허들·보류']}개사(상태 충돌로 분류된 건 제외).`,
  company: pick(c => c.mou.status === '허들·보류' && c.hold.reason, c => (c.mou.elapsedDays || 0))
        || pick(c => c.mou.status === '허들·보류', c => (c.mou.elapsedDays || 0)),
});
samples.push({
  heading: '7. 기존 협력업체 · MOU 상태 확인 필요',
  note: `실제 수집 데이터 · 이 상태 ${S.byStatus['기존 협력업체·MOU 상태 확인 필요']}개사.`,
  company: pick(c => c.mou.status === '기존 협력업체·MOU 상태 확인 필요', richness),
});
samples.push({
  heading: '8. 상태 충돌 · 날짜 오류',
  note: `실제 수집 데이터 · 상태 충돌 ${S.statusConflict}개사, 날짜 오류 ${S.dateError}개사.`,
  company: find('삼호종합건설㈜') || pick(c => c.validation.statusConflict, c => (c.validation.dateError ? 10 : 0) + c.validation.messages.length),
});

const missing = samples.filter(s => !s.company);
if (missing.length) throw new Error('샘플을 찾지 못했습니다: ' + missing.map(s => s.heading).join(', '));

// ── customer-card-preview.html ─────────────────────────────
const sampleIds = samples.map(s => s.company.id);
const previewPayload = {
  generatedAt: data.generatedAt,
  sourceUpdatedAt: data.sourceUpdatedAt,
  summary: S,
  samples: samples.map(s => ({ heading: s.heading, note: s.note, company: s.company })),
  companies: C,
};

const statTiles = [
  ['전체 고유 업체', S.totalCompanies], ['MOU 체결 완료', S.byStatus['MOU 체결 완료']],
  ['체결일 미확인', S.byStatus['MOU 체결 완료·체결일 미확인']], ['MOU 진행 중', S.byStatus['MOU 진행 중']],
  ['허들·보류', S.byStatus['허들·보류']], ['종결', S.byStatus['종결']],
  ['협력업체·상태 확인 필요', S.byStatus['기존 협력업체·MOU 상태 확인 필요']],
  ['상태 충돌·담당자 확인', S.byStatus['상태 충돌·담당자 확인 필요']],
  ['중복 의심', S.possibleDuplicate], ['날짜 오류', S.dateError],
  ['체결일 값 불일치', S.mouDateMismatch], ['장기 미진행', S.stalled],
];

const previewHTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>고객관리카드 시안 · 파트너 MOU 통합 데이터</title>
<link rel="stylesheet" href="customer-card-component.css">
<style>
/* ── 이 스타일은 "시안 페이지"만을 위한 것입니다. ─────────────────────
   기존 고객관리카드에 옮길 때는 customer-card-component.css 만 가져가세요.
   아래 .pcmx- 규칙은 시안 페이지 껍데기(헤더·통계·검색)용이라 이식 대상이 아닙니다. */
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #f2f2f5; color: #1b1b1f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
.pcmx-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
.pcmx-head { background: #fff; border: 1px solid #e2e2e8; border-radius: 12px; padding: 20px 22px; }
.pcmx-title { margin: 0 0 4px; font-size: 21px; font-weight: 800; letter-spacing: -0.02em; }
.pcmx-sub { margin: 0; font-size: 13px; color: #63636d; line-height: 1.7; }
.pcmx-asof { display: inline-block; margin-top: 10px; padding: 5px 11px; border-radius: 999px;
  background: #eef1f7; color: #2a4b7c; font-size: 12px; font-weight: 700; }
.pcmx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(146px, 1fr)); gap: 10px; margin-top: 18px; }
.pcmx-stat { background: #fff; border: 1px solid #e2e2e8; border-radius: 10px; padding: 12px 14px; }
.pcmx-stat b { display: block; font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pcmx-stat span { font-size: 11.5px; color: #75757e; }
.pcmx-section { margin-top: 30px; }
.pcmx-h2 { font-size: 16px; font-weight: 800; margin: 0 0 4px; }
.pcmx-note { font-size: 12.5px; color: #63636d; line-height: 1.7; margin: 0 0 12px;
  background: #fff8e6; border: 1px solid #efdca8; border-radius: 8px; padding: 9px 12px; }
.pcmx-note--plain { background: #fff; border-color: #e2e2e8; color: #55555f; }
.pcmx-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0 14px; }
.pcmx-tools input, .pcmx-tools select { font: inherit; font-size: 13px; padding: 7px 10px;
  border: 1px solid #cfcfd8; border-radius: 7px; background: #fff; color: inherit; }
.pcmx-tools input { flex: 1 1 200px; min-width: 0; }
.pcmx-count { font-size: 12px; color: #63636d; margin-left: auto; }
.pcmx-more { font: inherit; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 8px;
  border: 1px solid #cfcfd8; background: #fff; cursor: pointer; margin-top: 12px; }
.pcmx-more:hover { background: #f2f2f5; }
.pcmx-foot { margin-top: 34px; font-size: 12px; color: #75757e; line-height: 1.8; }
.pcmx-foot code { background: #e9e9ee; padding: 1px 5px; border-radius: 4px; font-size: 11.5px; }
@media print { body { background: #fff; } .pcmx-tools, .pcmx-more { display: none; } }
</style>
</head>
<body>
<div class="pcmx-wrap">

  <header class="pcmx-head">
    <h1 class="pcmx-title">고객관리카드 시안 — 파트너 MOU 통합 데이터</h1>
    <p class="pcmx-sub">
      원본 <a href="${esc(data.source.url)}" target="_blank" rel="noopener">POUR 파트너 대시보드</a>의
      전 메뉴를 읽기 전용으로 조사해 업체 단위로 통합한 결과입니다.
      이 페이지는 <strong>운영 시스템이 아니라 카드 컴포넌트 시안</strong>이며,
      실제 이식 대상은 <code>customer-card-component.css / .js / .html</code> 세 파일입니다.<br>
      공개 시안이므로 대표자·연락처·이메일·주소·사업자등록번호는 <strong>마스킹</strong>되어 있습니다
      (<code>companies-integrated.json</code> 에는 원본값 그대로 들어 있습니다).
    </p>
    <span class="pcmx-asof">데이터 기준일 ${esc(data.sourceUpdatedAt)} · 조사일 ${esc(data.generatedAt)} · 데이터 내 최신 날짜 ${esc(data.source.latestDateInData)}</span>
    <div class="pcmx-stats">
      ${statTiles.map(([k, v]) => `<div class="pcmx-stat"><b>${v}</b><span>${esc(k)}</span></div>`).join('\n      ')}
    </div>
  </header>

  <section class="pcmx-section">
    <h2 class="pcmx-h2">상태별 카드 시안 (8종)</h2>
    <p class="pcmx-note pcmx-note--plain">
      카드를 클릭(“상세 보기”)하면 기본 정보 · 담당자 · MOU 타임라인 · 허들·보류 · 등급·매출 · 현장 · 비고·이력 · 검증 탭이 펼쳐집니다.
    </p>
    <div id="pcmx-samples"></div>
  </section>

  <section class="pcmx-section">
    <h2 class="pcmx-h2">전체 업체 ${S.totalCompanies}개사</h2>
    <div class="pcmx-tools">
      <input id="pcmx-q" type="search" placeholder="업체명 · 업체코드 검색" aria-label="업체명 또는 업체코드 검색">
      <select id="pcmx-status" aria-label="최종 MOU 상태 필터">
        <option value="">최종 상태 — 전체</option>
        ${data.statusVocabulary.map(s => `<option value="${esc(s)}">${esc(s)} (${S.byStatus[s] || 0})</option>`).join('\n        ')}
      </select>
      <select id="pcmx-flag" aria-label="검증 플래그 필터">
        <option value="">검증 — 전체</option>
        <option value="statusConflict">상태 충돌 (${S.statusConflict})</option>
        <option value="dateError">날짜 오류 (${S.dateError})</option>
        <option value="possibleDuplicate">중복 의심 (${S.possibleDuplicate})</option>
        <option value="mouDateMismatch">체결일 값 불일치 (${S.mouDateMismatch})</option>
        <option value="missingHoldReason">보류 사유 없음 (${S.missingHoldReason})</option>
        <option value="partnerWithoutMouStatus">협력업체·MOU 상태 없음 (${S.partnerWithoutMouStatus})</option>
      </select>
      <span class="pcmx-count" id="pcmx-count"></span>
    </div>
    <div id="pcmx-list"></div>
    <button type="button" class="pcmx-more" id="pcmx-more" hidden>더 보기</button>
  </section>

  <p class="pcmx-foot">
    상태 색상 — <span class="pcm-badge pcm-badge--done">체결 완료</span>
    <span class="pcm-badge pcm-badge--nodate">체결일 미확인</span>
    <span class="pcm-badge pcm-badge--ongoing">진행 중</span>
    <span class="pcm-badge pcm-badge--hold">허들·보류</span>
    <span class="pcm-badge pcm-badge--closed">종결</span>
    <span class="pcm-badge pcm-badge--unknown">상태 확인 필요</span>
    <span class="pcm-badge pcm-badge--alert">상태 충돌·날짜 오류</span><br>
    확인되지 않은 값은 지어내지 않고 <code>null</code> / “미확인”으로 두었습니다.
    수집하지 못한 항목과 사유는 <code>companies-integrated.json</code> 의 <code>notCollected</code> 및
    <code>DATA-VALIDATION-REPORT.md</code> 에 있습니다.
  </p>
</div>

<script src="customer-card-component.js"></script>
<script id="pcmx-data" type="application/json">${JSON.stringify(previewPayload).replace(/</g, '\\u003c')}</script>
<script>
(function () {
  'use strict';
  var DATA = JSON.parse(document.getElementById('pcmx-data').textContent);
  var OPTS = { mask: true, dataAsOf: DATA.sourceUpdatedAt };

  // 상태별 샘플
  var host = document.getElementById('pcmx-samples');
  DATA.samples.forEach(function (s, i) {
    var block = document.createElement('div');
    block.style.marginBottom = '22px';
    var h = document.createElement('h3');
    h.className = 'pcmx-h2';
    h.style.fontSize = '14px';
    h.textContent = s.heading;
    var n = document.createElement('p');
    n.className = 'pcmx-note';
    n.innerHTML = s.note;
    var holder = document.createElement('div');
    holder.className = 'pcm-cards';
    block.appendChild(h); block.appendChild(n); block.appendChild(holder);
    host.appendChild(block);
    PCMCard.mount(holder, [s.company], OPTS);
  });

  // 전체 목록 (검색·필터·점진 렌더)
  var listEl = document.getElementById('pcmx-list');
  var moreEl = document.getElementById('pcmx-more');
  var countEl = document.getElementById('pcmx-count');
  var qEl = document.getElementById('pcmx-q');
  var stEl = document.getElementById('pcmx-status');
  var fgEl = document.getElementById('pcmx-flag');
  var PAGE = 25;
  var shown = 0, filtered = [];

  function applyFilter() {
    var q = qEl.value.trim().toLowerCase();
    var st = stEl.value, fg = fgEl.value;
    filtered = DATA.companies.filter(function (c) {
      if (st && c.mou.status !== st) return false;
      if (fg && !c.validation[fg]) return false;
      if (!q) return true;
      var hay = [c.companyName, c.companyCode].concat(c.originalNames || []).join(' ').toLowerCase();
      return hay.indexOf(q) > -1;
    });
    shown = 0;
    listEl.innerHTML = '';
    listEl.className = 'pcm-cards';
    renderMore();
  }
  function renderMore() {
    var slice = filtered.slice(shown, shown + PAGE);
    var frag = document.createElement('div');
    frag.innerHTML = slice.map(function (c, i) { return PCMCard.render(c, OPTS, shown + i); }).join('');
    while (frag.firstChild) listEl.appendChild(frag.firstChild);
    shown += slice.length;
    countEl.textContent = filtered.length + '개사 중 ' + shown + '개 표시';
    moreEl.hidden = shown >= filtered.length;
    moreEl.textContent = '더 보기 (' + Math.max(0, filtered.length - shown) + '개 남음)';
  }
  // 목록 컨테이너에도 이벤트 위임을 붙인다 (빈 배열로 mount 하면 내용이 지워지므로 직접 처리)
  PCMCard.mount(listEl, [], OPTS);

  qEl.addEventListener('input', applyFilter);
  stEl.addEventListener('change', applyFilter);
  fgEl.addEventListener('change', applyFilter);
  moreEl.addEventListener('click', renderMore);
  applyFilter();
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIR, 'customer-card-preview.html'), previewHTML);

// ── customer-card-component.html ───────────────────────────
// 실제 렌더 결과 1건을 그대로 떼어 붙인 "복사용 마크업"
const { JSDOM } = (() => { try { return require('jsdom'); } catch { return {}; } })();
const PCMCard = require(path.join(DIR, 'customer-card-component.js'));
const sampleForMarkup = samples[0].company;
const renderedMarkup = PCMCard.render(sampleForMarkup, { mask: true, dataAsOf: data.sourceUpdatedAt }, 0);

const componentHTML = `<!--
  ============================================================================
  고객관리카드 컴포넌트 — 마크업 구조
  ============================================================================

  이 파일은 그대로 열어보는 페이지가 아니라, 기존 고객관리카드에 옮겨 붙이기 위한
  **마크업 레퍼런스**입니다. 세 가지가 들어 있습니다.

    A. 필요한 파일 연결 방법
    B. 빈 구조 템플릿 (플레이스홀더가 표시된 골격)
    C. 실제 데이터가 채워진 렌더 결과 1건 (그대로 복사해 쓸 수 있음)

  적용 순서
    1) customer-card-component.css 를 페이지에 추가
    2) customer-card-component.js 를 추가
    3) 카드를 넣을 자리에 <div class="pcm-cards"></div> 를 두고
       PCMCard.mount(el, companies, { mask:false }) 호출
       — 또는 아래 C 의 마크업을 서버 템플릿으로 직접 렌더

  주의
    - 모든 클래스에 pcm- 접두사가 붙어 있습니다. 전역 태그 선택자를 쓰지 않으므로
      기존 페이지 CSS와 충돌하지 않습니다.
    - data-pcm-card / data-pcm-toggle / data-pcm-tab / data-pcm-panel 속성은
      customer-card-component.js 가 이벤트 위임에 사용합니다. 이름을 바꾸지 마세요.
    - 값이 없는 필드는 빈칸이 아니라 "미확인" 텍스트를 넣습니다.
  ============================================================================
-->

<!-- ===== A. 파일 연결 ===================================================== -->
<link rel="stylesheet" href="customer-card-component.css">
<script src="customer-card-component.js" defer></script>

<div class="pcm-cards" id="pcm-card-host"></div>
<script>
  // fetch 로 JSON 을 읽어 붙이는 예시 (file:// 에서는 CORS 로 막히므로 서버 환경에서 사용)
  // fetch('companies-integrated.json')
  //   .then(function (r) { return r.json(); })
  //   .then(function (d) {
  //     PCMCard.mount(document.getElementById('pcm-card-host'), d.companies, { mask: false });
  //   });
</script>


<!-- ===== B. 빈 구조 템플릿 ================================================
  {{ }} 부분을 서버 템플릿 엔진 값으로 바꿔 쓰면 됩니다.
  pcm-card--* 변형 클래스: done | nodate | ongoing | hold | closed | unknown | alert
========================================================================== -->
<template id="pcm-card-template">
  <article class="pcm-card pcm-card--{{statusVariant}}" data-pcm-card data-pcm-id="{{id}}">

    <!-- 카드 헤더 -->
    <header class="pcm-card__header">
      <div class="pcm-card__identity">
        <h3 class="pcm-card__name">{{companyName}}</h3>
        <div class="pcm-card__submeta">
          <span class="pcm-card__code">업체코드 {{companyCode}}</span>
          <span>진행 단계 {{mou.stage}}</span>
          <span>마지막 업데이트 {{lastActivityAt}}</span>
        </div>
      </div>
      <div class="pcm-card__badges">
        <span class="pcm-badge pcm-badge--{{statusVariant}}">{{mou.status}}</span>
        <span class="pcm-badge pcm-badge--grade">등급 {{grade}}</span>
        <span class="pcm-badge pcm-badge--plain">기존 협력업체 {{isExistingPartner}}</span>
        <span class="pcm-badge pcm-badge--plain">신규 유입</span>
        <span class="pcm-badge pcm-badge--hold">장기 미진행</span>
      </div>
    </header>

    <!-- 첫 화면 핵심 정보 (10개 항목만 노출) -->
    <div class="pcm-card__summary">
      <div class="pcm-card__field"><span class="pcm-card__label">MOU 체결일</span><span class="pcm-card__value pcm-card__value--num">{{mou.signedAt}}</span></div>
      <div class="pcm-card__field"><span class="pcm-card__label">진행 단계</span><span class="pcm-card__value">{{mou.stage}}</span></div>
      <div class="pcm-card__field"><span class="pcm-card__label">경과일</span><span class="pcm-card__value pcm-card__value--num">{{mou.elapsedDays}}일</span></div>
      <div class="pcm-card__field"><span class="pcm-card__label">담당자</span><span class="pcm-card__value pcm-card__value--muted">미확인</span></div>
      <div class="pcm-card__field"><span class="pcm-card__label">다음 액션</span><span class="pcm-card__value">{{mou.nextAction}}</span></div>
      <div class="pcm-card__field"><span class="pcm-card__label">기존 협력업체</span><span class="pcm-card__value">{{isExistingPartner}}</span></div>
    </div>

    <!-- 주의사항 (상태 충돌 / 날짜 오류 / 체결일 미확인 등) -->
    <div class="pcm-card__alerts">
      <p class="pcm-card__alert"><span class="pcm-card__alert-mark">!</span><span>{{validation.message}}</span></p>
      <p class="pcm-card__alert pcm-card__alert--warn"><span class="pcm-card__alert-mark">!</span><span>{{validation.warning}}</span></p>
    </div>

    <!-- 펼치기 -->
    <button type="button" class="pcm-card__toggle" data-pcm-toggle aria-expanded="false">
      <span class="pcm-card__toggle-text">상세 보기</span>
      <span class="pcm-card__toggle-arrow" aria-hidden="true">&#9662;</span>
    </button>

    <!-- 상세 (접기·펼치기 + 탭) -->
    <div class="pcm-card__details">
      <div class="pcm-card__tabs" role="tablist">
        <button type="button" class="pcm-card__tab pcm-is-active" data-pcm-tab="basic"      role="tab">기본 정보</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="manager"    role="tab">담당자</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="timeline"   role="tab">MOU 타임라인</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="hold"       role="tab">허들·보류</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="grade"      role="tab">등급·매출</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="sites"      role="tab">현장</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="notes"      role="tab">비고·이력</button>
        <button type="button" class="pcm-card__tab"               data-pcm-tab="validation" role="tab">검증</button>
      </div>

      <div class="pcm-card__panel pcm-is-active" data-pcm-panel="basic" role="tabpanel">
        <div class="pcm-card__grid">
          <div class="pcm-card__field"><span class="pcm-card__label">원본 업체명</span><span class="pcm-card__value">{{originalNames}}</span></div>
          <!-- 대표자 · 연락처 · 이메일 · 주소 · 사업자등록번호 · 자본금 · 등록일 … -->
        </div>
      </div>

      <div class="pcm-card__panel" data-pcm-panel="manager" role="tabpanel"><!-- 담당자 정보 --></div>

      <div class="pcm-card__panel" data-pcm-panel="timeline" role="tabpanel">
        <ul class="pcm-card__timeline">
          <li class="pcm-card__timeline-item pcm-is-done">
            <span class="pcm-card__timeline-dot"></span>
            <span class="pcm-card__timeline-label">질문서 발송</span><br>
            <span class="pcm-card__timeline-date">{{mou.questionnaireSentAt}}</span>
          </li>
          <li class="pcm-card__timeline-item pcm-is-current">
            <span class="pcm-card__timeline-dot"></span>
            <span class="pcm-card__timeline-label">질문서 회신</span><br>
            <span class="pcm-card__timeline-date pcm-card__timeline-date--none">미확인</span>
            <span class="pcm-card__timeline-raw">원본 표기: {{mou.rawLabels.qReply}}</span>
          </li>
          <li class="pcm-card__timeline-item pcm-is-error">
            <span class="pcm-card__timeline-dot"></span>
            <span class="pcm-card__timeline-label">MOU 체결</span><br>
            <span class="pcm-card__timeline-date">{{mou.signedAt}}</span>
          </li>
        </ul>
      </div>

      <div class="pcm-card__panel" data-pcm-panel="hold"       role="tabpanel"><!-- 허들·보류 --></div>
      <div class="pcm-card__panel" data-pcm-panel="grade"      role="tabpanel"><!-- 등급·매출 --></div>
      <div class="pcm-card__panel" data-pcm-panel="sites"      role="tabpanel"><!-- 현장 --></div>
      <div class="pcm-card__panel" data-pcm-panel="notes"      role="tabpanel"><!-- 비고·변경 이력 --></div>
      <div class="pcm-card__panel" data-pcm-panel="validation" role="tabpanel"><!-- 검증 결과 --></div>
    </div>
  </article>
</template>


<!-- ===== C. 실제 데이터가 채워진 렌더 결과 =================================
  업체: ${esc(sampleForMarkup.companyName)} (${esc(sampleForMarkup.mou.status)})
  개인정보는 마스킹된 상태입니다. PCMCard.render(company, { mask:false }) 로 원본 출력 가능.
  이 파일을 브라우저에서 직접 열어도 동작하도록, 아래 카드는 pcm-cards 래퍼로 감싸고
  PCMCard.bind() 로 이벤트만 연결했습니다. 서버 템플릿으로 카드를 직접 렌더할 때도 같은 방식입니다.
========================================================================== -->
<div class="pcm-cards" id="pcm-static-demo">
${renderedMarkup}
</div>
<script>
  // 서버에서 이미 그려 둔 카드 마크업에 동작만 붙이는 방법
  window.addEventListener('DOMContentLoaded', function () {
    PCMCard.bind(document.getElementById('pcm-static-demo'));
  });
</script>
`;
fs.writeFileSync(path.join(DIR, 'customer-card-component.html'), componentHTML);

console.log('samples:');
samples.forEach(s => console.log('  ', s.heading, '→', s.company.companyName, '|', s.company.mou.status, '|', s.company.mou.stage));
console.log('\npreview bytes:', fs.statSync(path.join(DIR, 'customer-card-preview.html')).size);
console.log('component bytes:', fs.statSync(path.join(DIR, 'customer-card-component.html')).size);
