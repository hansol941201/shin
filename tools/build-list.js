#!/usr/bin/env node
/**
 * companies-list.html 생성
 * 전체 업체를 한 표로 보는 단일 HTML. 데이터 내장 · 외부 CDN 없음 · 더블클릭으로 열림.
 */
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'customer-card-migration');
const Core = require('./integration-core.js');
const d = JSON.parse(fs.readFileSync(path.join(DIR, 'companies-integrated.json'), 'utf8'));
const S = d.summary;
const CORE_SRC = fs.readFileSync(path.join(__dirname, 'integration-core.js'), 'utf8');
const readJson = (f) => { const p2 = path.join(DIR, f); return fs.existsSync(p2) ? JSON.parse(fs.readFileSync(p2, 'utf8')) : null; };
const LEGACY_EVIDENCE = readJson('legacy-excel-evidence.json');
const COMPANY_ALIASES = readJson('company-aliases.json');

// 목록 행은 코어가 만든다 — 동기화 시 브라우저에서 도는 함수와 동일하다.
const rows = Core.toListRows(d);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const years = [...new Set(rows.map(r => r.year).filter(Boolean))].sort().reverse();


const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>파트너업체 MOU 통합 현황 — 전체 업체 목록</title>
<style>
:root{--fg:#1b1b1f;--mid:#55555f;--lt:#86868f;--bg:#f2f2f5;--card:#fff;--line:#e2e2e8;--line2:#cfcfd8;
--done:#167a4b;--doneBg:#e7f5ee;--nodate:#8a6100;--nodateBg:#fdf3d7;--ongoing:#14539a;--ongoingBg:#e6f0fb;
--hold:#a1520a;--holdBg:#fdeedd;--closed:#3b3b42;--closedBg:#e6e6ea;--unknown:#63636d;--unknownBg:#eeeef1;
--alert:#b3261e;--alertBg:#fdeae8;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-size:13px;line-height:1.55;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif}
.wrap{max-width:1440px;margin:0 auto;padding:20px 14px 60px}
.head{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px}
h1{margin:0 0 4px;font-size:20px;font-weight:800;letter-spacing:-.02em}
.sub{margin:0;font-size:12.5px;color:var(--mid);line-height:1.7}
.asof{display:inline-flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.asof b{background:#eef1f7;color:#2a4b7c;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700}
.headbtns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
button,select,input{font:inherit;font-size:13px}
.btn{padding:7px 13px;border:1px solid var(--line2);border-radius:7px;background:#fff;color:var(--mid);
font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:5px}
.btn:hover{background:#f2f2f5;color:var(--fg)}
.btn.primary{background:#1b1b1f;border-color:#1b1b1f;color:#fff}
.btn.primary:hover{background:#33333a}

.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:9px;margin-top:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 13px;text-align:left;cursor:pointer}
.tile:hover{border-color:var(--line2);background:#fafafc}
.tile.on{border-color:#1b1b1f;box-shadow:0 0 0 1px #1b1b1f inset}
.tile b{display:block;font-size:21px;font-weight:800;font-variant-numeric:tabular-nums}
.tile span{font-size:11px;color:var(--lt)}
.tile[data-k^="s:MOU 체결 완료"] b{color:var(--done)}
.tile[data-k="s:MOU 체결 완료·체결일 미확인"] b{color:var(--nodate)}
.tile[data-k="s:MOU 진행 중"] b{color:var(--ongoing)}
.tile[data-k="s:허들·보류"] b{color:var(--hold)}
.tile[data-k="s:종결"] b{color:var(--closed)}
.tile[data-k="s:기존 협력업체·MOU 상태 확인 필요"] b{color:var(--unknown)}
.tile[data-k="s:상태 충돌·담당자 확인 필요"] b,.tile[data-k^="f:"] b{color:var(--alert)}
.tile[data-k="f:mouDateResolved"] b{color:var(--done)}

.syncbar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:12px;padding:10px 14px;
background:var(--card);border:1px solid var(--line);border-radius:10px;font-size:12.5px;color:var(--mid)}
.syncbar .dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block;margin-right:6px}
.syncbar.snap{border-left:3px solid var(--unknown)}
.syncbar.ok{border-left:3px solid var(--done)}
.syncbar.busy{border-left:3px solid var(--ongoing)}
.syncbar.err{border-left:3px solid var(--alert);background:var(--alertBg);color:var(--alert)}
.syncbar strong{color:var(--fg)}
.syncbar.err strong{color:var(--alert)}
.syncbar .grow{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
.syncreport{margin-top:12px;background:var(--card);border:1px solid var(--line);
border-left:3px solid var(--ongoing);border-radius:10px;padding:14px 16px}
.syncreport h3{margin:0 0 8px;font-size:14px;font-weight:800}
.syncreport h4{margin:14px 0 6px;font-size:12px;color:var(--mid);font-weight:700}
.syncreport .delta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px}
.syncreport .delta span{background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:5px 10px;font-size:12px}
.syncreport .delta span b{font-variant-numeric:tabular-nums}
.syncreport .up{color:var(--done)}.syncreport .down{color:var(--alert)}
.syncreport ul{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.syncreport li{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-size:12px}
.syncreport .none{color:var(--lt);font-size:12px}
.syncreport .close{float:right}
.spin{display:inline-block;animation:pcmspin .9s linear infinite}
@keyframes pcmspin{to{transform:rotate(360deg)}}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 10px}
.bar input[type=search]{flex:1 1 220px;min-width:0;padding:8px 11px;border:1px solid var(--line2);border-radius:7px;background:#fff}
.bar select{padding:8px 10px;border:1px solid var(--line2);border-radius:7px;background:#fff}
.chk{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--mid);
padding:7px 11px;border:1px solid var(--line2);border-radius:7px;background:#fff;cursor:pointer}
.chk input{margin:0}
.count{margin-left:auto;font-size:12.5px;color:var(--mid);font-weight:600;white-space:nowrap}

.tablewrap{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{background:#fafafc;color:var(--lt);font-weight:700;font-size:11.5px;white-space:nowrap;
position:sticky;top:0;z-index:2;cursor:pointer;user-select:none}
th:hover{color:var(--fg)}
th .ar{opacity:.35;font-size:10px}
th.sorted .ar{opacity:1}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.c{text-align:center;white-space:nowrap}
tr.row{cursor:pointer}
tr.row:hover>td{background:#fafafc}
tr.row.open>td{background:#f4f6fa}
.nm{font-weight:700;min-width:150px;word-break:keep-all}
td.tabs{min-width:150px}
.nm small{display:block;font-weight:500;color:var(--lt);font-size:11px}
.st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;border:1px solid transparent}
.st-done{background:var(--doneBg);color:var(--done);border-color:#bfe3d0}
.st-nodate{background:var(--nodateBg);color:var(--nodate);border-color:#ecd79a}
.st-ongoing{background:var(--ongoingBg);color:var(--ongoing);border-color:#c2d9f2}
.st-hold{background:var(--holdBg);color:var(--hold);border-color:#f0d0ac}
.st-closed{background:var(--closedBg);color:var(--closed);border-color:#cfcfd6}
.st-unknown{background:var(--unknownBg);color:var(--unknown);border-color:#d8d8de}
.st-alert{background:var(--alertBg);color:var(--alert);border-color:#f2c2bd}
.tag{display:inline-block;padding:1px 6px;border-radius:5px;background:#eeeef1;color:var(--mid);font-size:10.5px;margin:1px 2px 1px 0;white-space:nowrap}
.tag.warn{background:var(--alertBg);color:var(--alert)}
.na{color:var(--lt)}
.left{border-left:3px solid transparent}
.left.done{border-left-color:var(--done)}.left.nodate{border-left-color:var(--nodate)}
.left.ongoing{border-left-color:var(--ongoing)}.left.hold{border-left-color:var(--hold)}
.left.closed{border-left-color:var(--closed)}.left.unknown{border-left-color:var(--unknown)}
.left.alert{border-left-color:var(--alert)}

tr.detail>td{background:#f7f8fb;padding:14px 16px}
.dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 18px}
.dg b{display:block;font-size:11px;color:var(--lt);font-weight:500}
.dg span{font-size:12.5px;font-weight:600;word-break:break-all}
.dsec{margin-top:14px}
.dsec h4{margin:0 0 6px;font-size:11.5px;color:var(--mid);font-weight:700}
.dlist{margin:0;padding:0;list-style:none;display:grid;gap:5px}
.dlist li{background:#fff;border:1px solid var(--line);border-radius:6px;padding:6px 9px;font-size:12px}
.dlist li.alert{background:var(--alertBg);border-color:#f2c2bd;color:var(--alert)}
.dlist li.warn{background:var(--nodateBg);border-color:#ecd79a;color:var(--nodate)}
.src{font-size:11px;color:var(--lt)}
.foot{margin-top:22px;font-size:12px;color:var(--lt);line-height:1.8}
.foot code{background:#e9e9ee;padding:1px 5px;border-radius:4px;font-size:11.5px}
.empty{padding:36px;text-align:center;color:var(--lt)}

@media (max-width:640px){.wrap{padding:14px 10px 48px}h1{font-size:17px}th,td{padding:7px 8px}}
@media print{
  body{background:#fff}
  .bar,.headbtns,.tiles,.btn,.syncreport .close{display:none}
  .syncbar{border:1px solid #ccc}
  .tablewrap{border:none;overflow:visible}
  th{position:static}
  tr{break-inside:avoid}
  tr.detail{display:table-row !important}
  a[href]:after{content:""}
}
</style>
</head>
<body>
<div class="wrap">

<header class="head">
  <h1>파트너업체 MOU 통합 현황 — 전체 업체 목록</h1>
  <p class="sub">
    원본 POUR 파트너 대시보드의 <strong>진행 현황 · 체결 완료 · 허들·보류 · 협력업체 리스트 3종 · 등급 현황 · 연도별 등급 3종</strong>을
    읽기 전용으로 조사해 업체 단위로 통합한 목록입니다. 원본 ${S.rawRowsCollected.toLocaleString('ko-KR')}행 → 고유 업체 <strong>${S.totalCompanies}개사</strong>.<br>
    확인되지 않은 값은 지어내지 않고 <strong>“미확인”</strong>으로 표시했습니다. 행을 클릭하면 상세가 펼쳐집니다.
  </p>
  <div class="asof" id="asof"></div>
  <div class="headbtns">
    <button class="btn primary" id="sync">🔄 원본과 동기화</button>
    <button class="btn" id="syncFileBtn" title="사내망·CORS 등으로 직접 연결이 막힐 때 사용">파일로 동기화</button>
    <button class="btn" id="csv">현재 목록 CSV 내려받기</button>
    <button class="btn" id="expandAll">전체 펼치기</button>
    <button class="btn" id="printBtn">인쇄</button>
    <a class="btn" href="${d.source.url}" target="_blank" rel="noopener">원본 사이트 열기 ↗</a>
  </div>
</header>

<div class="syncbar" id="syncbar"></div>
<section class="syncreport" id="syncreport" hidden></section>
<input type="file" id="syncFile" accept=".html,.htm,.json" multiple hidden>

<div class="tiles" id="tiles"></div>

<div class="bar">
  <input type="search" id="q" placeholder="업체명 · 업체코드 · 대표자 검색" aria-label="검색">
  <select id="fStatus" aria-label="최종 상태"></select>
  <select id="fStage" aria-label="진행 단계"></select>
  <select id="fYear" aria-label="체결 연도"></select>
  <select id="fPartner" aria-label="기존 협력업체"></select>
  <select id="fFlag" aria-label="검증"></select>
  <label class="chk"><input type="checkbox" id="pii"> 개인정보 표시</label>
  <button class="btn" id="reset">필터 초기화</button>
  <span class="count" id="count"></span>
</div>

<div class="tablewrap">
  <table>
    <thead><tr>
      <th data-s="n">#<span class="ar">▲</span></th>
      <th data-s="name">업체명<span class="ar">▲</span></th>
      <th data-s="code">업체코드<span class="ar">▲</span></th>
      <th data-s="status">최종 상태<span class="ar">▲</span></th>
      <th data-s="stage">진행 단계<span class="ar">▲</span></th>
      <th data-s="partner">협력<span class="ar">▲</span></th>
      <th data-s="grade">등급<span class="ar">▲</span></th>
      <th data-s="mou">MOU 체결일<span class="ar">▲</span></th>
      <th data-s="last">마지막 확인<span class="ar">▲</span></th>
      <th data-s="days">경과일<span class="ar">▲</span></th>
      <th>허들 사유 / 다음 액션</th>
      <th>원본 메뉴</th>
      <th>주의</th>
    </tr></thead>
    <tbody id="tb"></tbody>
  </table>
  <div class="empty" id="empty" hidden>조건에 맞는 업체가 없습니다.</div>
</div>

<p class="foot">
  상태 색상 —
  <span class="st st-done">MOU 체결 완료</span>
  <span class="st st-nodate">체결일 미확인</span>
  <span class="st st-ongoing">MOU 진행 중</span>
  <span class="st st-hold">허들·보류</span>
  <span class="st st-closed">종결</span>
  <span class="st st-unknown">상태 확인 필요</span>
  <span class="st st-alert">상태 충돌·날짜 오류</span><br>
  <strong>기존 협력업체는 MOU 상태가 아닙니다.</strong> 별도 속성으로 표시했고, 협력업체라는 이유로 체결로 추정하지 않았습니다.<br>
  <strong>상태 충돌</strong> 업체는 우선순위로 덮어쓰지 않고 별도 상태로 두었으며, 우선순위만 적용했을 때의 값은 상세에 함께 표시합니다.<br>
  <strong>경과일</strong>은 ${d.generatedAt} 기준 스냅샷입니다. 실제 시스템에 붙일 때는 그날 기준으로 다시 계산하세요.<br>
  수집하지 못한 항목과 사유는 <code>DATA-VALIDATION-REPORT.md</code>, 원본 데이터는 <code>companies-integrated.json</code> 을 보세요.
</p>
</div>

<!-- 통합 로직 원본. 빌드(Node)와 동기화(브라우저)가 같은 코드를 쓴다. -->
<script>${CORE_SRC.replace(/<\/script/gi, '<\\/script')}</script>
<script id="data" type="application/json">${JSON.stringify({
  rows,
  summary: S,
  statusVocabulary: d.statusVocabulary,
  stageVocabulary: d.stageVocabulary,
  meta: {
    generatedAt: d.generatedAt,
    sourceUpdatedAt: d.sourceUpdatedAt,
    sourceUrl: d.source.url,
    latestDateInData: d.source.latestDateInData,
    rawRows: S.rawRowsCollected,
    firebaseUrl: 'https://pour-partner-dashboard-default-rtdb.asia-southeast1.firebasedatabase.app',
  },
  // 동기화(브라우저)에서도 빌드와 같은 규칙을 쓰도록 함께 싣는다
  legacyEvidence: LEGACY_EVIDENCE,
  companyAliases: COMPANY_ALIASES,
}).replace(/</g, '\\u003c')}</script>
<script>
(function(){
'use strict';
var BOOT = JSON.parse(document.getElementById('data').textContent);
var ROWS = BOOT.rows;
var SUMMARY = BOOT.summary;
var VOCAB = { status: BOOT.statusVocabulary, stage: BOOT.stageVocabulary };
var META = BOOT.meta;
var LEGACY_EVIDENCE = BOOT.legacyEvidence || null;
var COMPANY_ALIASES = BOOT.companyAliases || null;
var BASELINE = BOOT.rows;                 // 내장 스냅샷 (비교 기준)
var SOURCE = { kind: 'snapshot', at: META.sourceUpdatedAt, note: null };
var CHANGED = null;                       // 동기화 후 변경된 업체명 집합
var NA = '미확인';
var VAR = {'MOU 체결 완료':'done','MOU 체결 완료·체결일 미확인':'nodate','MOU 진행 중':'ongoing',
'허들·보류':'hold','종결':'closed','기존 협력업체·MOU 상태 확인 필요':'unknown','상태 충돌·담당자 확인 필요':'alert'};
var STAGE_ORDER = ${JSON.stringify(d.stageVocabulary)};

function esc(v){return v==null?'':String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function has(v){return v!==null&&v!==undefined&&v!==''&&!(Array.isArray(v)&&!v.length);}
function cell(v){return has(v)?esc(v):'<span class="na">'+NA+'</span>';}

// 개인정보 마스킹
var showPII=false;
function mName(s){if(!has(s))return s;s=String(s);return s.length<=1?s:s.length===2?s[0]+'*':s[0]+Array(s.length-1).join('*')+s[s.length-1];}
function mPhone(s){if(!has(s))return s;var p=String(s).split('-');if(p.length<2)return String(s).replace(/\\d(?=\\d{2})/g,'*');p[p.length-2]=p[p.length-2].replace(/./g,'*');return p.join('-');}
function mMail(s){if(!has(s))return s;var a=String(s).indexOf('@');if(a<1)return '****';return s[0]+Array(a).join('*')+String(s).slice(a);}
function mAddr(s){if(!has(s))return s;var t=String(s).split(/\\s+/);return t.length<=2?t[0]+' ***':t.slice(0,2).join(' ')+' ***';}
function mBiz(s){if(!has(s))return s;var x=String(s).replace(/\\D/g,'');return x.length===10?x.slice(0,3)+'-**-*****':'***';}
var P={ceo:mName,phone:mPhone,email:mMail,addr:mAddr,bizno:mBiz};
function pii(k,v){return showPII?v:(P[k]?P[k](v):v);}

var state={q:'',status:'',stage:'',year:'',partner:'',flag:'',sort:'n',dir:1,tile:'all',changedOnly:false};

// ── 현재 데이터에서 요약 수치를 다시 계산 (동기화 후에도 화면 숫자가 맞도록) ──
function recount(rowsArr){
  var byStatus={}; VOCAB.status.forEach(function(k){byStatus[k]=0;});
  var byStage={}; VOCAB.stage.forEach(function(k){byStage[k]=0;});
  var f={possibleDuplicate:0,statusConflict:0,dateError:0,mouDateResolved:0,mouDateNeedsReview:0,nameVariantMerged:0,
         missingMouDate:0,missingHoldReason:0,partnerWithoutMouStatus:0,notInContractorList:0,__stalled:0};
  var noStage=0, partners=0, years={};
  rowsArr.forEach(function(r){
    if(byStatus[r.status]!==undefined)byStatus[r.status]++;
    if(r.stage){ if(byStage[r.stage]!==undefined)byStage[r.stage]++; } else noStage++;
    if(r.partner)partners++;
    if(r.year)years[r.year]=(years[r.year]||0)+1;
    Object.keys(f).forEach(function(k){ if(k==='__stalled'){ if(r.stalled)f[k]++; } else if(r.v&&r.v[k])f[k]++; });
  });
  return {total:rowsArr.length,byStatus:byStatus,byStage:byStage,noStage:noStage,partners:partners,years:years,flags:f};
}
var COUNTS = recount(ROWS);

var TILE_DEFS=[
  ['all','전체 고유 업체',function(){return COUNTS.total;}],
  ['s:MOU 체결 완료','MOU 체결 완료',function(){return COUNTS.byStatus['MOU 체결 완료'];}],
  ['s:MOU 체결 완료·체결일 미확인','체결일 미확인',function(){return COUNTS.byStatus['MOU 체결 완료·체결일 미확인'];}],
  ['s:MOU 진행 중','MOU 진행 중',function(){return COUNTS.byStatus['MOU 진행 중'];}],
  ['s:허들·보류','허들·보류',function(){return COUNTS.byStatus['허들·보류'];}],
  ['s:종결','종결',function(){return COUNTS.byStatus['종결'];}],
  ['s:기존 협력업체·MOU 상태 확인 필요','협력업체·상태 확인 필요',function(){return COUNTS.byStatus['기존 협력업체·MOU 상태 확인 필요'];}],
  ['s:상태 충돌·담당자 확인 필요','상태 충돌·담당자 확인',function(){return COUNTS.byStatus['상태 충돌·담당자 확인 필요'];}],
  ['f:possibleDuplicate','중복 의심(미해결)',function(){return COUNTS.flags.possibleDuplicate;}],
  ['f:dateError','날짜 오류',function(){return COUNTS.flags.dateError;}],
  ['f:mouDateResolved','체결일 자동 확정',function(){return COUNTS.flags.mouDateResolved;}],
  ['f:__stalled','장기 미진행',function(){return COUNTS.flags.__stalled;}]
];

function renderControls(){
  document.getElementById('tiles').innerHTML=TILE_DEFS.map(function(t){
    return '<button class="tile" data-k="'+esc(t[0])+'"><b>'+t[2]()+'</b><span>'+esc(t[1])+'</span></button>';
  }).join('');
  function opts(sel,head,list,cur){
    var el=document.getElementById(sel);
    el.innerHTML='<option value="">'+esc(head)+'</option>'+list.map(function(o){
      return '<option value="'+esc(o[0])+'">'+esc(o[1])+' ('+o[2]+')</option>';}).join('');
    el.value=cur||'';
  }
  opts('fStatus','최종 상태 — 전체',VOCAB.status.map(function(k){return [k,k,COUNTS.byStatus[k]];}),state.status);
  opts('fStage','진행 단계 — 전체',VOCAB.stage.map(function(k){return [k,k,COUNTS.byStage[k]];})
       .concat([['__none','단계 없음 (협력업체 리스트 전용)',COUNTS.noStage]]),state.stage);
  opts('fYear','체결 연도 — 전체',Object.keys(COUNTS.years).sort().reverse()
       .map(function(y){return [y,y+'년',COUNTS.years[y]];}),state.year);
  opts('fPartner','기존 협력업체 — 전체',[['y','예',COUNTS.partners],['n','아니오',COUNTS.total-COUNTS.partners]],state.partner);
  opts('fFlag','검증 — 전체',[
    ['statusConflict','상태 충돌',COUNTS.flags.statusConflict],
    ['dateError','날짜 오류',COUNTS.flags.dateError],
    ['possibleDuplicate','중복 의심(미해결)',COUNTS.flags.possibleDuplicate],
    ['nameVariantMerged','표기 차이로 통합(해결)',COUNTS.flags.nameVariantMerged],
    ['notInContractorList','체결일 있으나 시공사 명부 미등재',COUNTS.flags.notInContractorList],
    ['mouDateResolved','체결일 자동 확정(규칙 적용)',COUNTS.flags.mouDateResolved],
    ['mouDateNeedsReview','체결일 담당자 확인 필요',COUNTS.flags.mouDateNeedsReview],
    ['missingMouDate','체결일 미확인',COUNTS.flags.missingMouDate],
    ['missingHoldReason','허들 사유 미기재',COUNTS.flags.missingHoldReason],
    ['partnerWithoutMouStatus','협력업체·MOU 상태 없음',COUNTS.flags.partnerWithoutMouStatus]
  ].concat(CHANGED?[['__changed','이번 동기화로 바뀐 업체',CHANGED.size]]:[]),state.flag);
  document.getElementById('asof').innerHTML=[
    '데이터 기준일 '+esc(SOURCE.kind==='snapshot'?META.sourceUpdatedAt:SOURCE.at),
    '조사일 '+esc(META.generatedAt),
    '데이터 내 최신 날짜 '+esc(META.latestDateInData),
    '경과일 '+esc(META.generatedAt)+' 기준'
  ].map(function(t){return '<b>'+t+'</b>';}).join('');
  syncTiles();
}

var view=[];
var openIds={};

function flagOf(r,f){
  if(f==='__stalled')return !!r.stalled;
  if(f==='__changed')return !!(CHANGED&&CHANGED.has(r.name));
  return !!(r.v&&r.v[f]);
}

function apply(){
  var q=state.q.trim().toLowerCase();
  view=ROWS.filter(function(r){
    if(state.status&&r.status!==state.status)return false;
    if(state.stage){ if(state.stage==='__none'){ if(r.stage)return false; } else if(r.stage!==state.stage) return false; }
    if(state.year&&r.year!==state.year)return false;
    if(state.partner==='y'&&!r.partner)return false;
    if(state.partner==='n'&&r.partner)return false;
    if(state.flag&&!flagOf(r,state.flag))return false;
    if(!q)return true;
    var hay=[r.name,r.ceo].concat(r.names||[],r.formerNames||[],r.codes||[]).join(' ').toLowerCase();
    return hay.indexOf(q)>-1;
  });
  var k=state.sort,dir=state.dir;
  view.sort(function(a,b){
    var x=a[k],y=b[k];
    if(k==='stage'){x=STAGE_ORDER.indexOf(a.stage);y=STAGE_ORDER.indexOf(b.stage);}
    if(k==='partner'){x=a.partner?1:0;y=b.partner?1:0;}
    if(x==null&&y==null)return a.n-b.n;
    if(x==null)return 1; if(y==null)return -1;
    if(typeof x==='number'&&typeof y==='number')return (x-y)*dir;
    return String(x).localeCompare(String(y),'ko')*dir;
  });
  render();
}

var MENU_SHORT={'협력업체 리스트(내부용)':'협력리스트·내부','협력업체 리스트(시공사 발송용)':'협력리스트·시공사',
'협력업체 리스트(외부 발송용)':'협력리스트·외부','연도별 등급(2025)':'연도등급 25','연도별 등급(2024)':'연도등급 24',
'연도별 등급(2023)':'연도등급 23'};
function shortMenu(t){return MENU_SHORT[t]||t;}

function badges(r){
  var out=[];
  if(r.v.statusConflict)out.push('<span class="tag warn">상태 충돌</span>');
  if(r.v.dateError)out.push('<span class="tag warn">날짜 오류</span>');
  if(r.v.possibleDuplicate)out.push('<span class="tag warn">중복 의심</span>');
  if(r.v.nameVariantMerged)out.push('<span class="tag">표기 통합</span>');
  if(r.v.mouDateResolved)out.push('<span class="tag">체결일 자동 확정</span>');
  if(r.v.mouDateNeedsReview)out.push('<span class="tag warn">체결일 확인 필요</span>');
  if(r.v.missingMouDate)out.push('<span class="tag warn">체결일 미확인</span>');
  if(r.v.missingHoldReason)out.push('<span class="tag warn">사유 미기재</span>');
  if(r.stalled)out.push('<span class="tag">장기 미진행</span>');
  if(r.suspect)out.push('<span class="tag warn">보류 의심</span>');
  if(r.v.cancelSuspect)out.push('<span class="tag warn">협약취소 기재</span>');
  if(r.v.notInContractorList)out.push('<span class="tag warn">시공사 명부 미등재</span>');
  if(r.reviewPriority==='높음')out.push('<span class="tag warn">확인 우선 높음</span>');
  if(r.v.nameChangeMerged)out.push('<span class="tag">상호 변경 통합</span>');
  if(r.v.multipleCodes)out.push('<span class="tag warn">업체코드 2건</span>');
  return out.length?out.join(''):'<span class="na">—</span>';
}

function detail(r){
  function g(l,v){return '<div class="dg"><b>'+esc(l)+'</b><span>'+cell(v)+'</span></div>';}
  var h='<div class="dgrid">'
    +g('원본 업체명',(r.names||[]).join(' / '))
    +g('이전 상호',(r.formerNames||[]).join(' / '))
    +g('업체코드',(r.codes&&r.codes.length?r.codes.join(', '):r.code))+g('사업자등록번호',pii('bizno',r.bizno))
    +g('지역',r.region)+g('대표자',pii('ceo',r.ceo))
    +g('연락처',pii('phone',r.phone))+g('이메일',pii('email',r.email))
    +g('주소',pii('addr',r.addr))+g('자본금',r.capital)
    +g('현재 등급',r.grade)+g('누계 매출',r.sales!=null?r.sales.toLocaleString('ko-KR')+'원':null)
    +g('기존 협력업체',r.partner?'예':'아니오')+g('신규 MOU 유입',r.newco?'예':'아니오')
    +'</div>';

  h+='<div class="dsec"><h4>MOU 타임라인</h4><div class="dgrid">'
    +g('질문서 발송일',r.qs)+g('질문서 회신일',r.qr)
    +g('1차 미팅 완료일',r.m1)+g('2차 미팅 완료일',r.m2)
    +g('MOU 체결일',r.mou)
    +g('1차/2차 미팅 예정일','원본에 필드 없음 — '+NA)
    +g('담당자','원본에 필드 없음 — '+NA)
    +'</div>';
  if(r.skipped&&r.skipped.length){
    h+='<p class="src">체결까지 날짜 기록이 없는 단계: '+esc(r.skipped.join(', '))
      +' — 미팅 없이 바로 체결하는 경우가 있어 오류로 보지 않습니다.</p>';
  }
  var raws=[];
  ['qSent','qReply','m1','m2','mou'].forEach(function(k,i){
    var lbl=['질문서 발송','질문서 회신','1차 미팅','2차 미팅','MOU 체결'][i];
    var v=r.raw&&r.raw[k];
    var dt=[r.qs,r.qr,r.m1,r.m2,r.mou][i];
    if(has(v)&&!dt)raws.push(lbl+': "'+v+'" (날짜로 해석되지 않아 원문 보존)');
  });
  if(raws.length)h+='<ul class="dlist" style="margin-top:8px">'+raws.map(function(t){return '<li class="warn">'+esc(t)+'</li>';}).join('')+'</ul>';
  if(has(r.plMark))h+='<p class="src">협력업체 리스트 협약체결 칸 원본 표기: '+esc(r.plMark)+'</p>';
  if(r.nameChange){
    h+='<div class="dsec"><h4>상호 변경</h4><ul class="dlist"><li>이전 상호 <strong>'
      +esc((r.formerNames||[]).join(', '))+'</strong> → 현재 <strong>'+esc(r.nameChange.current)+'</strong>'
      +'<br><span class="src">근거: '+esc(r.nameChange.basis)
      +(r.nameChange.businessNumber?' · 사업자등록번호 '+esc(r.nameChange.businessNumber)+' 일치':'')
      +(r.nameChange.confirmedBy?' · '+esc(r.nameChange.confirmedBy):'')+'</span></li></ul></div>';
  }
  h+='<p class="src">협력업체 명부: 시공사 발송용 '
    +(r.contractorListed?'<strong>등재</strong>':'미등재')
    +' · 내부용 '+((r.evidence&&r.evidence.internalList)?'<strong>등재</strong>':'미등재')
    +(r.v.notInContractorList?' — <strong>체결일은 있으나 시공사 명부에 없음(협약 종료 또는 미반영 가능)</strong>':'')+'</p>';
  if(r.evidence&&r.evidence.legacyRoster){
    h+='<p class="src">레거시 엑셀 “'+esc(r.evidence.legacyRoster.basis||'전체 협약업체')+'” 명부: 등재'
      +(r.evidence.legacyRoster.grades&&r.evidence.legacyRoster.grades.length?' (등급 '+esc(r.evidence.legacyRoster.grades.join('/'))+')':'')
      +' — 참고 자료이며 단독으로는 체결 근거로 보지 않습니다</p>';
  }
  if(r.reviewPriority){
    h+='<p class="src">확인 우선순위: <strong>'+esc(r.reviewPriority)+'</strong> — '+esc(r.reviewPriorityReason||'')+'</p>';
  }
  if(r.mouSource)h+='<p class="src">체결일 출처: '+esc(r.mouSource)
    +(r.dateRes&&r.dateRes.status==='resolved_by_source_priority'
      ? ' (다른 메뉴에 다른 날짜가 있었으나 확정 규칙에 따라 체결 완료 메뉴 값을 사용. 원본 값은 JSON dateResolution 에 보존)'
      : '')+'</p>';
  h+='</div>';

  if(r.attempts){
    h+='<div class="dsec"><h4>원본 행별 진행 이력 (값을 섞지 않고 보존)</h4><ul class="dlist">'
      +r.attempts.map(function(a){
        var dd=a.dates||{};
        return '<li>['+esc(a.menu)+'] '+esc(a.sourceName)+' — '+esc(a.stage)
          +'<br><span class="src">질문서 '+(dd.qSent||'—')+' · 회신 '+(dd.qReply||'—')+' · 1차 '+(dd.m1||'—')+' · 2차 '+(dd.m2||'—')+' · 체결 '+(dd.mou||'—')+'</span></li>';
      }).join('')+'</ul></div>';
  }

  if(r.hold){
    h+='<div class="dsec"><h4>허들·보류</h4><div class="dgrid">'
      +g('보류 사유',r.holdReason||'사유 미기재')+g('다음 액션',r.action)
      +g('보류 시작일','원본에 필드 없음 — '+NA)+g('재접근 예정일','원본에 필드 없음 — '+NA)
      +'</div></div>';
  }

  if(r.gh&&r.gh.length){
    h+='<div class="dsec"><h4>연도별 등급</h4><ul class="dlist">'
      +r.gh.map(function(x){return '<li>'+x.year+'년 · '+esc(x.grade)
        +'<span class="src"> — 출처 '+esc((x.sources||[]).join(', '))
        +(x.conflictingGrades&&x.conflictingGrades.length?' · 불일치: '+esc(x.conflictingGrades.map(function(c){return c.source+' '+c.grade;}).join(', ')):'')
        +'</span></li>';}).join('')+'</ul></div>';
  }

  h+='<div class="dsec"><h4>현장 정보 ('+(r.sites?r.sites.length:0)+'건)</h4>'
    +(r.sites&&r.sites.length
      ? '<ul class="dlist">'+r.sites.map(function(s){return '<li>'+esc(s)+'</li>';}).join('')
        +'</ul><p class="src">현장 세부 날짜(카달로그·PT·낙찰 등 9종)는 원본 공개 데이터에 없어 '+NA+' — 원문만 보존</p>'
      : '<p class="src">등록된 현장 정보 없음</p>')+'</div>';

  h+='<div class="dsec"><h4>비고</h4>'
    +(r.notes&&r.notes.length
      ? '<ul class="dlist">'+r.notes.map(function(n){return '<li>'+esc(n.text)+'<br><span class="src">출처: '+esc(n.source)+'</span></li>';}).join('')+'</ul>'
      : '<p class="src">비고 없음</p>')+'</div>';

  h+='<div class="dsec"><h4>발견된 원본 메뉴</h4><div>'
    +(r.tabs||[]).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('')+'</div></div>';

  var msgs=(r.v&&r.v.messages)||[];
  h+='<div class="dsec"><h4>확인 필요 사항'+(msgs.length?' ('+msgs.length+'건)':'')+'</h4>'
    +(msgs.length
      ? '<ul class="dlist">'+msgs.map(function(m){
          var c=(m.type==='statusConflict'||m.type==='dateError')?' class="alert"':(m.type==='possibleDuplicate'?' class="warn"':'');
          return '<li'+c+'>'+esc(m.message)+'</li>';}).join('')+'</ul>'
      : '<p class="src">검출된 오류 없음</p>');
  if(r.status==='상태 충돌·담당자 확인 필요')h+='<p class="src">우선순위만 적용했을 때의 상태: '+esc(r.cand)+'</p>';
  h+='</div>';
  return h;
}

function render(){
  var tb=document.getElementById('tb');
  var html='';
  view.forEach(function(r){
    var v=VAR[r.status]||'unknown';
    var open=!!openIds[r.id];
    html+='<tr class="row'+(open?' open':'')+'" data-id="'+esc(r.id)+'">'
      +'<td class="num left '+v+'">'+r.n+'</td>'
      +'<td class="nm">'+esc(r.name)+((r.names&&r.names.length>1)?'<small>'+esc(r.names.slice(1).join(' / '))+'</small>':'')+'</td>'
      +'<td class="c">'+cell(r.code)+'</td>'
      +'<td><span class="st st-'+v+'">'+esc(r.status)+'</span></td>'
      +'<td>'+cell(r.stage)+'</td>'
      +'<td class="c">'+(r.partner?'예':'<span class="na">아니오</span>')+'</td>'
      +'<td class="c">'+cell(r.grade)+'</td>'
      +'<td class="c">'+cell(r.mou)+'</td>'
      +'<td class="c">'+cell(r.last)+'</td>'
      +'<td class="num">'+(r.days!=null?r.days+'일':'<span class="na">'+NA+'</span>')+'</td>'
      +'<td>'+(r.hold?(esc(r.holdReason||'사유 미기재')+'<br><span class="src">'+esc(r.action||'결정 미입력')+'</span>'):'<span class="na">—</span>')+'</td>'
      +'<td class="tabs">'+(r.tabs||[]).map(function(t){return '<span class="tag" title="'+esc(t)+'">'+esc(shortMenu(t))+'</span>';}).join('')+'</td>'
      +'<td>'+badges(r)+'</td>'
      +'</tr>';
    if(open)html+='<tr class="detail"><td colspan="13">'+detail(r)+'</td></tr>';
  });
  tb.innerHTML=html;
  document.getElementById('empty').hidden=view.length>0;
  document.getElementById('count').textContent='전체 '+ROWS.length+'개사 중 '+view.length+'개 표시';
}

// 이벤트
document.getElementById('tb').addEventListener('click',function(e){
  var tr=e.target.closest('tr.row'); if(!tr)return;
  var id=tr.getAttribute('data-id');
  if(openIds[id])delete openIds[id];else openIds[id]=1;
  render();
});
document.querySelectorAll('th[data-s]').forEach(function(th){
  th.addEventListener('click',function(){
    var k=th.getAttribute('data-s');
    if(state.sort===k)state.dir=-state.dir;else{state.sort=k;state.dir=1;}
    document.querySelectorAll('th[data-s]').forEach(function(o){o.classList.remove('sorted');o.querySelector('.ar').textContent='▲';});
    th.classList.add('sorted');th.querySelector('.ar').textContent=state.dir>0?'▲':'▼';
    apply();
  });
});
function syncTiles(){
  document.querySelectorAll('.tile').forEach(function(t){
    var k=t.getAttribute('data-k');
    var on=(k==='all')?(!state.status&&!state.flag)
      :(k.indexOf('s:')===0?state.status===k.slice(2):state.flag===k.slice(2));
    t.classList.toggle('on',on);
  });
}
document.getElementById('tiles').addEventListener('click',function(e){
  var t=e.target.closest('.tile'); if(!t)return;
  var k=t.getAttribute('data-k');
  if(k==='all'){state.status='';state.flag='';}
  else if(k.indexOf('s:')===0){state.status=(state.status===k.slice(2))?'':k.slice(2);state.flag='';}
  else{state.flag=(state.flag===k.slice(2))?'':k.slice(2);state.status='';}
  document.getElementById('fStatus').value=state.status;
  document.getElementById('fFlag').value=state.flag;
  syncTiles();apply();
});
function bindSel(id,key){document.getElementById(id).addEventListener('change',function(){state[key]=this.value;syncTiles();apply();});}
// 옵션이 다시 그려져도 리스너가 유지되도록 change 는 요소 자체에 건다 (innerHTML 교체는 요소를 지우지 않음)
bindSel('fStatus','status');bindSel('fStage','stage');bindSel('fYear','year');bindSel('fPartner','partner');bindSel('fFlag','flag');
document.getElementById('q').addEventListener('input',function(){state.q=this.value;apply();});
document.getElementById('pii').addEventListener('change',function(){showPII=this.checked;render();});
document.getElementById('reset').addEventListener('click',function(){
  state.q='';state.status='';state.stage='';state.year='';state.partner='';state.flag='';
  ['q','fStatus','fStage','fYear','fPartner','fFlag'].forEach(function(i){document.getElementById(i).value='';});
  openIds={};syncTiles();apply();
});
document.getElementById('expandAll').addEventListener('click',function(){
  var allOpen=view.every(function(r){return openIds[r.id];});
  openIds={}; if(!allOpen)view.forEach(function(r){openIds[r.id]=1;});
  this.textContent=allOpen?'전체 펼치기':'전체 접기';
  render();
});
document.getElementById('printBtn').addEventListener('click',function(){window.print();});

// CSV (현재 필터 결과) — Excel 한글 깨짐 방지용 BOM 포함
document.getElementById('csv').addEventListener('click',function(){
  var head=['번호','업체명','원본 업체명','업체코드','사업자등록번호','최종 상태','우선순위 판정','진행 단계','기존 협력업체','신규 유입','등급',
    'MOU 체결일','질문서 발송일','질문서 회신일','1차 미팅일','2차 미팅일','마지막 확인일','경과일',
    '허들 사유','다음 액션','지역','대표자','연락처','이메일','주소','현장 수','발견된 원본 메뉴',
    '중복 의심','상태 충돌','날짜 오류','체결일 미확인','체결일 값 불일치','장기 미진행','확인 필요 사항'];
  function q(v){v=(v==null||v==='')?'미확인':String(v);return '"'+v.replace(/"/g,'""')+'"';}
  var lines=[head.map(q).join(',')];
  view.forEach(function(r){
    lines.push([r.n,r.name,(r.names||[]).join(' / '),r.code,pii('bizno',r.bizno),r.status,r.cand,r.stage,
      r.partner?'예':'아니오',r.newco?'예':'아니오',r.grade,r.mou,r.qs,r.qr,r.m1,r.m2,r.last,
      r.days!=null?r.days:null,r.hold?(r.holdReason||'사유 미기재'):null,r.action,
      r.region,pii('ceo',r.ceo),pii('phone',r.phone),pii('email',r.email),pii('addr',r.addr),
      (r.sites||[]).length,(r.tabs||[]).join(' / '),
      r.v.possibleDuplicate?'Y':'N',r.v.statusConflict?'Y':'N',r.v.dateError?'Y':'N',
      r.v.missingMouDate?'Y':'N',r.v.mouDateMismatch?'Y':'N',r.stalled?'Y':'N',
      ((r.v.messages||[]).map(function(m){return m.message;}).join(' | '))].map(q).join(','));
  });
  var blob=new Blob(['\\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='파트너업체_MOU_통합현황_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
});


// ═══════════════════════════════════════════════════════════
// 원본 사이트 동기화
//
// 원본이 화면에 그리는 데이터 = index.html 안의 시드(const DATA)
//                              + Firebase Realtime Database 의 수정분
// 두 곳을 모두 읽어 IntegrationCore 로 다시 통합한다. 통합 규칙은 빌드 때와 같은 코드다.
// 원본은 읽기만 하고 아무것도 쓰지 않는다.
// ═══════════════════════════════════════════════════════════
var SYNC_CACHE_KEY='pour_mou_list_sync_v1';

function setSyncBar(kind,html,actions){
  var el=document.getElementById('syncbar');
  el.className='syncbar '+kind;
  el.innerHTML=html+(actions?'<span class="grow">'+actions+'</span>':'');
}
function idleBar(){
  if(SOURCE.kind==='snapshot'){
    setSyncBar('snap','<strong>내장 스냅샷</strong> · 원본 배포 '+esc(META.sourceUpdatedAt)
      +' 기준 · 파일에 저장된 데이터를 보고 있습니다. 최신 상태를 보려면 [원본과 동기화]를 누르세요.');
  }else{
    setSyncBar('ok','<strong>동기화됨</strong> · '+esc(SOURCE.at)
      +(SOURCE.note?' · '+esc(SOURCE.note):'')
      +' · 이 결과는 이 브라우저에만 저장됩니다.',
      '<button class="btn" id="dlJson">통합 JSON 내려받기</button>'
      +'<button class="btn" id="clearSync">스냅샷으로 되돌리기</button>');
    var dl=document.getElementById('dlJson'); if(dl)dl.onclick=downloadSynced;
    var cs=document.getElementById('clearSync'); if(cs)cs.onclick=clearSync;
  }
}

function fetchText(url){
  return fetch(url,{cache:'no-store',mode:'cors'}).then(function(res){
    if(!res.ok)throw new Error('HTTP '+res.status+' — '+url);
    return res.text();
  });
}

function runSync(sourceHtml,fbJson,label){
  var parsed=IntegrationCore.parseSourceHtml(sourceHtml);
  var merged=IntegrationCore.applySiteOverrides(parsed.DATA,fbJson||{});
  var payload=IntegrationCore.build({
    DATA:merged.DATA,
    hurdleActions:merged.hurdleActions,
    overridesApplied:merged.applied,
    legacyEvidence:LEGACY_EVIDENCE,
    companyAliases:COMPANY_ALIASES,
    changelog:parsed.changelog,
    checklist:parsed.checklist,
    generatedAt:new Date().toISOString().slice(0,10),
    sourceUpdatedAt:new Date().toISOString().slice(0,10),
    sourceUrl:META.sourceUrl
  });
  applySynced(payload,label,merged.applied);
  try{
    localStorage.setItem(SYNC_CACHE_KEY,JSON.stringify({at:new Date().toISOString(),label:label,payload:payload}));
  }catch(e){ /* 용량 초과 등 — 화면 반영에는 지장 없음 */ }
}

var SYNCED_PAYLOAD=null;
function applySynced(payload,label,applied){
  SYNCED_PAYLOAD=payload;
  var next=IntegrationCore.toListRows(payload);
  var diff=diffRows(BASELINE,next);
  ROWS=next; COUNTS=recount(ROWS);
  CHANGED=new Set(diff.changed.map(function(x){return x.name;})
    .concat(diff.added.map(function(x){return x.name;})));
  SOURCE={kind:'synced',at:new Date().toLocaleString('ko-KR'),note:label};
  openIds={};
  renderControls(); apply();
  renderReport(diff,applied);
  idleBar();
}

function diffRows(oldRows,newRows){
  var om={},nm={};
  oldRows.forEach(function(r){om[r.name]=r;});
  newRows.forEach(function(r){nm[r.name]=r;});
  var added=[],removed=[],changed=[];
  newRows.forEach(function(r){
    var o=om[r.name];
    if(!o){added.push(r);return;}
    var fields=[];
    if(o.status!==r.status)fields.push({f:'최종 상태',a:o.status,b:r.status});
    if(o.stage!==r.stage)fields.push({f:'진행 단계',a:o.stage||'미확인',b:r.stage||'미확인'});
    if(o.mou!==r.mou)fields.push({f:'MOU 체결일',a:o.mou||'미확인',b:r.mou||'미확인'});
    if(o.grade!==r.grade)fields.push({f:'등급',a:o.grade||'미확인',b:r.grade||'미확인'});
    if((o.action||'')!==(r.action||''))fields.push({f:'다음 액션',a:o.action||'미확인',b:r.action||'미확인'});
    if((o.holdReason||'')!==(r.holdReason||''))fields.push({f:'보류 사유',a:o.holdReason||'미기재',b:r.holdReason||'미기재'});
    if(o.qs!==r.qs)fields.push({f:'질문서 발송',a:o.qs||'미확인',b:r.qs||'미확인'});
    if(o.qr!==r.qr)fields.push({f:'질문서 회신',a:o.qr||'미확인',b:r.qr||'미확인'});
    if(o.m1!==r.m1)fields.push({f:'1차 미팅',a:o.m1||'미확인',b:r.m1||'미확인'});
    if(o.m2!==r.m2)fields.push({f:'2차 미팅',a:o.m2||'미확인',b:r.m2||'미확인'});
    if(fields.length)changed.push({name:r.name,fields:fields});
  });
  oldRows.forEach(function(r){ if(!nm[r.name])removed.push(r); });
  return {added:added,removed:removed,changed:changed,oldCounts:recount(oldRows),newCounts:recount(newRows)};
}

function renderReport(diff,applied){
  var el=document.getElementById('syncreport');
  var a=diff.oldCounts,b=diff.newCounts;
  function delta(label,x,y){
    var d=y-x;
    return '<span>'+esc(label)+' <b>'+x+' → '+y+'</b>'
      +(d?' <b class="'+(d>0?'up':'down')+'">'+(d>0?'+':'')+d+'</b>':'')+'</span>';
  }
  var deltas=[delta('전체 업체',a.total,b.total)]
    .concat(VOCAB.status.map(function(k){return delta(k,a.byStatus[k],b.byStatus[k]);}))
    .concat([delta('상태 충돌',a.flags.statusConflict,b.flags.statusConflict),
             delta('날짜 오류',a.flags.dateError,b.flags.dateError),
             delta('중복 의심',a.flags.possibleDuplicate,b.flags.possibleDuplicate)]);

  function list(title,items,fmt){
    if(!items.length)return '<h4>'+esc(title)+' (0)</h4><p class="none">없음</p>';
    var cap=items.slice(0,50);
    return '<h4>'+esc(title)+' ('+items.length+')</h4><ul>'+cap.map(fmt).join('')+'</ul>'
      +(items.length>cap.length?'<p class="none">… 외 '+(items.length-cap.length)+'건. [검증 — 이번 동기화로 바뀐 업체] 필터로 전체를 볼 수 있습니다.</p>':'');
  }

  var noChange=!diff.added.length&&!diff.removed.length&&!diff.changed.length;
  el.hidden=false;
  el.innerHTML='<button class="btn close" id="closeReport">닫기</button>'
    +'<h3>동기화 결과</h3>'
    +'<p class="none">내장 스냅샷(원본 배포 '+esc(META.sourceUpdatedAt)+' 기준)과 방금 받아온 원본을 비교했습니다.'
    +(applied&&applied.length?' 원격 수정분: '+esc(applied.join(', '))+'.':' 원격에 별도 수정분은 없었습니다.')+'</p>'
    +(noChange
      ? '<p class="none" style="margin-top:10px"><strong>변경 없음</strong> — 원본이 내장 스냅샷과 같습니다.</p>'
      : '<div class="delta" style="margin-top:10px">'+deltas.join('')+'</div>'
        +list('신규 업체',diff.added,function(r){return '<li><strong>'+esc(r.name)+'</strong> — '+esc(r.status)+' / '+esc(r.stage||'미확인')+'</li>';})
        +list('사라진 업체',diff.removed,function(r){return '<li><strong>'+esc(r.name)+'</strong> — 원본에서 삭제됨 (이전 상태: '+esc(r.status)+')</li>';})
        +list('변경된 업체',diff.changed,function(c){
            return '<li><strong>'+esc(c.name)+'</strong><br><span class="src">'
              +c.fields.map(function(f){return esc(f.f)+': '+esc(f.a)+' → '+esc(f.b);}).join(' · ')+'</span></li>';}));
  document.getElementById('closeReport').onclick=function(){el.hidden=true;};
  el.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function downloadSynced(){
  if(!SYNCED_PAYLOAD)return;
  var blob=new Blob([JSON.stringify(SYNCED_PAYLOAD,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='companies-integrated_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function clearSync(){
  try{localStorage.removeItem(SYNC_CACHE_KEY);}catch(e){}
  ROWS=BASELINE; COUNTS=recount(ROWS); CHANGED=null; SYNCED_PAYLOAD=null;
  SOURCE={kind:'snapshot',at:META.sourceUpdatedAt,note:null};
  if(state.flag==='__changed')state.flag='';
  openIds={}; document.getElementById('syncreport').hidden=true;
  renderControls(); apply(); idleBar();
}

function doSync(){
  setSyncBar('busy','<span class="spin">⟳</span> <strong>원본에서 데이터를 받아오는 중…</strong>');
  var base=META.sourceUrl.replace(/\\/?$/,'/');
  var htmlUrl=base+'index.html?_='+Date.now();
  var sourceHtml=null;
  fetchText(htmlUrl)
    .then(function(txt){
      sourceHtml=txt;
      // 원본 HTML 에 적힌 databaseURL 을 그대로 사용 (바뀌어도 따라감)
      var m=txt.match(/databaseURL:\\s*["']([^"']+)["']/);
      var fbBase=(m?m[1]:META.firebaseUrl).replace(/\\/?$/,'');
      return fetchText(fbBase+'/partner.json?_='+Date.now())
        .then(function(j){ try{return JSON.parse(j);}catch(e){return {};} })
        .catch(function(e){ FB_ERR=e; return null; });
    })
    .then(function(fb){
      var label=fb?'원본 HTML + Firebase 수정분':'원본 HTML만 (Firebase 읽기 실패 — 시드 기준)';
      runSync(sourceHtml,fb,label);
      if(!fb&&FB_ERR){
        var el=document.getElementById('syncbar');
        el.insertAdjacentHTML('beforeend','<span style="color:var(--nodate)">· Firebase 수정분은 읽지 못했습니다 ('+esc(FB_ERR.message)+')</span>');
      }
    })
    .catch(function(err){
      setSyncBar('err','<strong>동기화 실패</strong> — '+esc(err.message||String(err))
        +'<br>브라우저가 로컬 파일(file://)에서 외부 사이트를 읽지 못하도록 막았을 가능성이 큽니다(CORS). '
        +'원본 사이트를 브라우저로 연 뒤 <em>다른 이름으로 저장</em>해서 받은 index.html 을 [파일로 동기화]로 넣으면 같은 결과를 얻습니다.',
        '<button class="btn" id="retrySync">다시 시도</button><button class="btn" id="openSrc">원본 열기</button>');
      var r=document.getElementById('retrySync'); if(r)r.onclick=doSync;
      var o=document.getElementById('openSrc'); if(o)o.onclick=function(){window.open(META.sourceUrl,'_blank','noopener');};
    });
}
var FB_ERR=null;

// 파일로 동기화 — CORS 로 직접 연결이 막힐 때의 대안
document.getElementById('syncFileBtn').addEventListener('click',function(){
  document.getElementById('syncFile').click();
});
document.getElementById('syncFile').addEventListener('change',function(e){
  var files=[].slice.call(e.target.files||[]);
  if(!files.length)return;
  var htmlFile=files.filter(function(f){return /\\.html?$/i.test(f.name);})[0];
  var jsonFile=files.filter(function(f){return /\\.json$/i.test(f.name);})[0];
  if(!htmlFile){
    setSyncBar('err','<strong>원본 index.html 이 필요합니다.</strong> 원본 사이트를 브라우저로 연 뒤 저장한 HTML 파일을 선택하세요. (Firebase 수정분 JSON 을 함께 선택하면 같이 반영합니다.)');
    e.target.value='';return;
  }
  setSyncBar('busy','<span class="spin">⟳</span> <strong>파일에서 읽는 중…</strong>');
  var read=function(f){return new Promise(function(res,rej){
    var fr=new FileReader(); fr.onload=function(){res(fr.result);}; fr.onerror=rej; fr.readAsText(f,'utf-8');});};
  read(htmlFile).then(function(txt){
    return (jsonFile?read(jsonFile).then(function(j){try{return JSON.parse(j);}catch(x){return null;}}):Promise.resolve(null))
      .then(function(fb){
        runSync(txt,fb,'파일'+(fb?' (HTML + Firebase JSON)':' (HTML만)'));
      });
  }).catch(function(err){
    setSyncBar('err','<strong>파일을 읽지 못했습니다</strong> — '+esc(err.message||String(err)));
  });
  e.target.value='';
});
document.getElementById('sync').addEventListener('click',doSync);

// 이전에 동기화한 결과가 이 브라우저에 남아 있으면 복원
(function restore(){
  var raw=null; try{raw=localStorage.getItem(SYNC_CACHE_KEY);}catch(e){}
  if(!raw)return;
  try{
    var c=JSON.parse(raw);
    if(!c||!c.payload)return;
    SYNCED_PAYLOAD=c.payload;
    var next=IntegrationCore.toListRows(c.payload);
    var diff=diffRows(BASELINE,next);
    ROWS=next; COUNTS=recount(ROWS);
    CHANGED=new Set(diff.changed.map(function(x){return x.name;}).concat(diff.added.map(function(x){return x.name;})));
    SOURCE={kind:'synced',at:new Date(c.at).toLocaleString('ko-KR'),note:(c.label||'')+' · 이전 동기화 결과'};
  }catch(e){}
})();

renderControls();
idleBar();
apply();
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'companies-list.html'), html);
console.log('companies-list.html', fs.statSync(path.join(DIR, 'companies-list.html')).size, 'bytes ·', rows.length, 'rows');
