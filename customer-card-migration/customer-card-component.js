/* ===========================================================================
 * 고객관리카드 컴포넌트  (partner customer management card)
 *
 *  - 전역을 오염시키지 않습니다. window.PCMCard 하나만 노출합니다.
 *  - 외부 라이브러리를 쓰지 않습니다(순수 DOM).
 *  - 이벤트는 컨테이너에 위임합니다. 카드를 다시 그려도 리스너를 다시 달 필요가 없습니다.
 *
 *  사용법
 *      <link rel="stylesheet" href="customer-card-component.css">
 *      <div id="cards" class="pcm-cards"></div>
 *      <script src="customer-card-component.js"></script>
 *      <script>
 *        PCMCard.mount(document.getElementById('cards'), data.companies, { mask: true });
 *      </script>
 *
 *  옵션
 *      mask        개인정보(대표자·연락처·이메일·주소·사업자번호) 마스킹 여부. 기본 false.
 *      open        처음부터 상세를 펼칠지. 기본 false.
 *      dataAsOf    카드 하단에 표시할 데이터 기준일 문자열.
 * =========================================================================== */
(function (global) {
  'use strict';

  var NA = '미확인';

  /* ── 상태 → CSS 변형 클래스 ─────────────────────────── */
  var STATUS_VARIANT = {
    'MOU 체결 완료': 'done',
    'MOU 체결 완료·체결일 미확인': 'nodate',
    'MOU 진행 중': 'ongoing',
    '허들·보류': 'hold',
    '종결': 'closed',
    '기존 협력업체·MOU 상태 확인 필요': 'unknown',
    '상태 충돌·담당자 확인 필요': 'alert',
  };

  var TIMELINE_STEPS = [
    { key: 'questionnaireSentAt', label: '질문서 발송', raw: 'qSent' },
    { key: 'questionnaireReceivedAt', label: '질문서 회신', raw: 'qReply' },
    { key: 'firstMeetingScheduledAt', label: '1차 미팅 예정', raw: null },
    { key: 'firstMeetingCompletedAt', label: '1차 미팅 완료', raw: 'm1' },
    { key: 'secondMeetingScheduledAt', label: '2차 미팅 예정', raw: null },
    { key: 'secondMeetingCompletedAt', label: '2차 미팅 완료', raw: 'm2' },
    { key: 'signedAt', label: 'MOU 체결', raw: 'mou' },
  ];

  /* ── 유틸 ───────────────────────────────────────────── */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function has(v) { return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length); }
  function val(v) { return has(v) ? esc(v) : null; }
  function variantOf(status) { return STATUS_VARIANT[status] || 'unknown'; }
  function num(n) { return typeof n === 'number' ? n.toLocaleString('ko-KR') : null; }

  /* 개인정보 마스킹 — 공개 시안용 */
  function maskName(s) {
    if (!has(s)) return s;
    s = String(s);
    if (s.length <= 1) return s;
    if (s.length === 2) return s[0] + '*';
    return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
  }
  function maskPhone(s) {
    if (!has(s)) return s;
    var parts = String(s).split('-');
    if (parts.length < 2) return String(s).replace(/\d(?=\d{2})/g, '*');
    parts[parts.length - 2] = parts[parts.length - 2].replace(/./g, '*');
    return parts.join('-');
  }
  function maskEmail(s) {
    if (!has(s)) return s;
    var at = String(s).indexOf('@');
    if (at < 1) return '****';
    var id = String(s).slice(0, at);
    return id[0] + '*'.repeat(Math.max(1, id.length - 1)) + String(s).slice(at);
  }
  function maskAddress(s) {
    if (!has(s)) return s;
    var t = String(s).split(/\s+/);
    return t.length <= 2 ? t[0] + ' ***' : t.slice(0, 2).join(' ') + ' ***';
  }
  function maskBizno(s) {
    if (!has(s)) return s;
    var d = String(s).replace(/\D/g, '');
    return d.length === 10 ? d.slice(0, 3) + '-**-*****' : '***';
  }

  /** 카드 표시용으로 회사 레코드를 가공한다(원본 객체는 건드리지 않는다). */
  function view(company, opts) {
    var m = !!opts.mask;
    var p = company.profile || {};
    return {
      ceo: m ? maskName(p.ceo) : p.ceo,
      phone: m ? maskPhone(p.phone) : p.phone,
      fax: m ? maskPhone(p.fax) : p.fax,
      email: m ? maskEmail(p.email) : p.email,
      address: m ? maskAddress(p.address) : p.address,
      bizno: m ? maskBizno(company.businessNumber) : company.businessNumber,
      contacts: (company.contacts || []).map(function (c) {
        return {
          name: m ? maskName(c.name) : c.name,
          role: c.role, source: c.source, note: c.note,
          phone: m ? maskPhone(c.phone) : c.phone,
          email: m ? maskEmail(c.email) : c.email,
        };
      }),
    };
  }

  /* ── 조각 렌더러 ────────────────────────────────────── */
  function field(label, value, mod) {
    var shown = has(value) ? esc(value) : NA;
    var cls = 'pcm-card__value' + (has(value) ? (mod ? ' ' + mod : '') : ' pcm-card__value--muted');
    return '<div class="pcm-card__field"><span class="pcm-card__label">' + esc(label) + '</span>' +
           '<span class="' + cls + '">' + shown + '</span></div>';
  }
  function grid(pairs) {
    return '<div class="pcm-card__grid">' + pairs.map(function (p) {
      return field(p[0], p[1], p[2]);
    }).join('') + '</div>';
  }
  function section(title, body) {
    return '<div class="pcm-card__section"><h4 class="pcm-card__section-title">' + esc(title) + '</h4>' + body + '</div>';
  }
  function empty(text) { return '<p class="pcm-card__empty">' + esc(text) + '</p>'; }

  function listOf(items, mod) {
    if (!items || !items.length) return null;
    return '<ul class="pcm-card__list">' + items.map(function (t) {
      return '<li class="pcm-card__list-item' + (mod ? ' ' + mod : '') + '">' + esc(t) + '</li>';
    }).join('') + '</ul>';
  }

  function timeline(company) {
    var mou = company.mou || {};
    var raws = mou.rawLabels || {};
    var errorFields = {};
    (company.validation && company.validation.messages || []).forEach(function (msg) {
      if (msg.type !== 'dateError') return;
      TIMELINE_STEPS.forEach(function (s) { if (msg.message.indexOf(s.label) === 0 || msg.message.indexOf(s.label) > -1) errorFields[s.key] = true; });
    });

    var items = TIMELINE_STEPS.map(function (step) {
      var date = mou[step.key];
      var raw = step.raw ? raws[step.raw] : null;
      var showRaw = has(raw) && raw !== date && !/^\d{2}\.\d{1,2}\.\d{1,2}$/.test(String(raw).replace(/^[oO0ㅇ]\s*/, ''));
      var cls = 'pcm-card__timeline-item';
      if (has(date)) cls += ' pcm-is-done';
      if (errorFields[step.key]) cls += ' pcm-is-error';
      return '<li class="' + cls + '">' +
        '<span class="pcm-card__timeline-dot"></span>' +
        '<span class="pcm-card__timeline-label">' + esc(step.label) + '</span><br>' +
        '<span class="pcm-card__timeline-date' + (has(date) ? '' : ' pcm-card__timeline-date--none') + '">' +
          (has(date) ? esc(date) : NA) + '</span>' +
        (showRaw ? ' <span class="pcm-card__timeline-raw">원본 표기: ' + esc(raw) + '</span>' : '') +
      '</li>';
    }).join('');
    return '<ul class="pcm-card__timeline">' + items + '</ul>';
  }

  function attemptsBlock(company) {
    var att = (company.mou && company.mou.attempts) || [];
    if (att.length < 2) return null;
    return '<div class="pcm-card__table-wrap"><table class="pcm-card__table"><thead><tr>' +
      '<th>원본 메뉴</th><th>원본 표기</th><th>단계</th><th>질문서</th><th>회신</th><th>1차</th><th>2차</th><th>체결</th>' +
      '</tr></thead><tbody>' + att.map(function (a) {
        var d = a.dates || {};
        return '<tr><td>' + esc(a.menu) + '</td><td>' + esc(a.sourceName) + '</td><td>' + esc(a.stage) + '</td>' +
          ['qSent', 'qReply', 'm1', 'm2', 'mou'].map(function (k) {
            return '<td>' + (has(d[k]) ? esc(d[k]) : '—') + '</td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function gradeBlock(company) {
    var out = [];
    var gh = company.gradeHistory || [];
    if (gh.length) {
      out.push('<div class="pcm-card__table-wrap"><table class="pcm-card__table"><thead><tr>' +
        '<th>연도</th><th>등급</th><th>출처 메뉴</th><th>불일치</th></tr></thead><tbody>' +
        gh.map(function (g) {
          return '<tr><td>' + esc(g.year) + '</td><td>' + esc(g.grade) + '</td><td>' + esc((g.sources || []).join(', ')) + '</td>' +
            '<td>' + (g.conflictingGrades && g.conflictingGrades.length
              ? esc(g.conflictingGrades.map(function (c) { return c.source + ': ' + c.grade; }).join(', ')) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>');
    } else {
      out.push(empty('등급 이력 ' + NA + ' — 등급 현황·연도별 등급 메뉴에서 이 업체를 찾지 못했습니다.'));
    }
    var sales = company.sales || [];
    out.push(grid([
      ['현재 등급', company.grade],
      ['누계 매출(확인된 연도 합계)', company.salesTotal != null ? num(company.salesTotal) + '원' : null],
      ['연도별 매출', sales.length ? sales.map(function (s) { return s.year + '년 ' + num(s.amount) + '원'; }).join(' · ') : null],
    ]));
    return out.join('');
  }

  function sitesBlock(company) {
    var sites = company.sites || [];
    if (!sites.length) return empty('등록된 현장 정보가 없습니다.');
    return '<ul class="pcm-card__list">' + sites.map(function (s) {
      return '<li class="pcm-card__list-item">' + esc(s.rawText) +
        '<br><span class="pcm-card__source">출처: ' + esc(s.source) +
        ' · 세부 날짜(카달로그/PT/낙찰 등)는 원본 공개 데이터에 없어 ' + NA + '</span></li>';
    }).join('') + '</ul>';
  }

  function validationBlock(company) {
    var v = company.validation || {};
    var msgs = v.messages || [];
    var flags = [
      ['중복 의심', v.possibleDuplicate], ['상태 충돌', v.statusConflict], ['날짜 오류', v.dateError],
      ['상호 변경 통합', v.nameChangeMerged], ['업체코드 2건 이상', v.multipleCodes], ['협약취소 기재', v.cancelSuspect],
      ['체결일 미확인', v.missingMouDate], ['체결일 담당자 확인 필요', v.mouDateNeedsReview],
      ['보류 사유 없음', v.missingHoldReason], ['다음 액션 없음', v.missingNextAction],
      ['협력업체지만 MOU 상태 없음', v.partnerWithoutMouStatus],
    ].filter(function (f) { return f[1]; });

    var out = '';
    out += '<div class="pcm-card__chips">' + (flags.length
      ? flags.map(function (f) { return '<span class="pcm-badge pcm-badge--alert">' + esc(f[0]) + '</span>'; }).join('')
      : '<span class="pcm-badge pcm-badge--plain">검출된 오류 없음</span>') + '</div>';

    if (msgs.length) {
      out += '<ul class="pcm-card__list" style="margin-top:9px">' + msgs.map(function (m) {
        var mod = (m.type === 'statusConflict' || m.type === 'dateError') ? ' pcm-card__list-item--alert'
                : (m.type === 'possibleDuplicate' ? ' pcm-card__list-item--warn' : '');
        return '<li class="pcm-card__list-item' + mod + '">' + esc(m.message) + '</li>';
      }).join('') + '</ul>';
    }
    return out;
  }

  /* ── 카드 하나의 HTML ───────────────────────────────── */
  function cardHTML(company, opts, index) {
    opts = opts || {};
    var v = view(company, opts);
    var mou = company.mou || {};
    var hold = company.hold || {};
    var val9 = company.validation || {};
    var variant = variantOf(mou.status);
    var uid = 'pcm-' + (company.id || 'x') + '-' + (index || 0);

    /* 헤더 배지 */
    var badges = [];
    badges.push('<span class="pcm-badge pcm-badge--' + variant + '">' + esc(mou.status) + '</span>');
    if (mou.status === '상태 충돌·담당자 확인 필요' && has(mou.statusCandidate)) {
      badges.push('<span class="pcm-badge pcm-badge--plain">우선순위 판정: ' + esc(mou.statusCandidate) + '</span>');
    }
    if (has(company.grade)) badges.push('<span class="pcm-badge pcm-badge--grade">등급 ' + esc(company.grade) + '</span>');
    badges.push('<span class="pcm-badge pcm-badge--plain">기존 협력업체 ' + (company.isExistingPartner ? '예' : '아니오') + '</span>');
    if (company.isNewCompany) badges.push('<span class="pcm-badge pcm-badge--plain">신규 유입</span>');
    if (mou.isStalled) badges.push('<span class="pcm-badge pcm-badge--hold">장기 미진행</span>');

    /* 첫 화면 주의사항 (최대 3건) */
    var alerts = (val9.messages || []).filter(function (m) {
      return m.type === 'statusConflict' || m.type === 'dateError';
    }).map(function (m) { return { text: m.message, warn: false }; });
    if (val9.missingMouDate) alerts.push({ text: '체결 완료로 표시되어 있으나 체결일이 확인되지 않습니다.', warn: true });
    if (val9.missingHoldReason) alerts.push({ text: '허들·보류 사유가 기재되어 있지 않습니다.', warn: true });
    if (val9.possibleDuplicate && !alerts.length) alerts.push({ text: '중복 의심 — 상세의 [검증] 탭을 확인하세요.', warn: true });
    var moreAlerts = alerts.length > 3 ? alerts.length - 3 : 0;
    alerts = alerts.slice(0, 3);

    var alertHTML = alerts.length
      ? '<div class="pcm-card__alerts">' + alerts.map(function (a) {
          return '<p class="pcm-card__alert' + (a.warn ? ' pcm-card__alert--warn' : '') + '">' +
            '<span class="pcm-card__alert-mark">!</span><span>' + esc(a.text) + '</span></p>';
        }).join('') +
        (moreAlerts ? '<p class="pcm-card__alert pcm-card__alert--warn"><span class="pcm-card__alert-mark">+</span>' +
          '<span>확인 필요 사항 ' + moreAlerts + '건 더 있음 — 상세의 [검증] 탭 참조</span></p>' : '') +
        '</div>'
      : '';

    /* 상세 탭 */
    var panels = [
      { id: 'basic', name: '기본 정보', html:
        grid([
          ['원본 업체명', (company.originalNames || []).join(' / ')],
          ['이전 상호', (company.formerNames || []).join(' / ')],
          ['업체코드', (company.codes || [company.companyCode]).filter(Boolean).join(', ') || company.companyCode],
          ['사업자등록번호', v.bizno],
          ['지역', (company.profile || {}).region],
          ['대표자', v.ceo],
          ['연락처', v.phone],
          ['FAX', v.fax],
          ['이메일', v.email],
          ['주소', v.address],
          ['자본금', (company.profile || {}).capital],
          ['업체 등록일', (company.profile || {}).registeredAt],
          ['업체코드 기준 등록연도(참고)', (company.profile || {}).registeredYearFromCode],
          ['협력업체 리스트 NO', (company.profile || {}).partnerListNo],
          ['업체 식별 근거', (company.identifiedBy || []).join(', ')],
        ]) },
      { id: 'manager', name: '담당자', html:
        section('내부 담당자', grid([
          ['담당자명', (company.manager || {}).name],
          ['직책', (company.manager || {}).title],
          ['연락처', (company.manager || {}).phone],
          ['이메일', (company.manager || {}).email],
          ['내부 담당자', (company.manager || {}).internalOwner],
          ['담당자 메모', (company.manager || {}).note],
        ])) +
        section('업체 측 연락처', v.contacts.length
          ? '<ul class="pcm-card__list">' + v.contacts.map(function (c) {
              return '<li class="pcm-card__list-item"><strong>' + esc(c.name || NA) + '</strong> · ' + esc(c.role || NA) +
                '<br>' + esc(c.phone || NA) + ' · ' + esc(c.email || NA) +
                '<br><span class="pcm-card__source">출처: ' + esc(c.source || NA) + '</span></li>';
            }).join('') + '</ul>'
          : empty('업체 측 연락처 ' + NA)) },
      { id: 'timeline', name: 'MOU 타임라인', html:
        grid([
          ['최종 MOU 상태', mou.status],
          ['현재 진행 단계', mou.stage],
          ['현재 단계 진입일', mou.currentStageDate],
          ['현재 단계 경과일', mou.elapsedDays != null ? mou.elapsedDays + '일' : null, 'pcm-card__value--num'],
          ['다음 액션', mou.nextAction],
          ['다음 액션 예정일', mou.nextActionDueAt],
          ['장기 미진행', mou.isStalled ? '예' : '아니오'],
        ]) +
        '<div style="margin-top:14px"></div>' + timeline(company) +
        (has(mou.partnerListMouMark) ? '<p class="pcm-card__source" style="margin-top:8px">협력업체 리스트 협약체결 칸 원본 표기: ' + esc(mou.partnerListMouMark) + '</p>' : '') +
        (mou.evidence && mou.evidence.promotedFromPartnerUnknown
          ? '<p class="pcm-card__source">체결 근거: ' + esc(mou.evidence.source) + ' 의 “' + esc(mou.evidence.basis) + '” 명부 (' + esc(mou.evidence.cell) + ')' +
            (mou.evidence.grades && mou.evidence.grades.length ? ' · 등급 ' + esc(mou.evidence.grades.join('/')) : '') +
            ' · 해당 엑셀에도 체결일 기록은 없어 미확인</p>' : '') +
        (has(mou.signedAtSource) ? '<p class="pcm-card__source">체결일 출처: ' + esc(mou.signedAtSource) +
          (company.dateResolution && company.dateResolution.status === 'resolved_by_source_priority'
            ? ' (다른 메뉴에 다른 날짜가 있었으나 확정 규칙에 따라 체결 완료 메뉴 값을 사용합니다. 원본 값은 JSON dateResolution 에 보존)'
            : '') + '</p>' : '') +
        (attemptsBlock(company) ? section('원본 행별 진행 이력 (값을 섞지 않고 보존)', attemptsBlock(company)) : '') },
      { id: 'hold', name: '허들·보류', html:
        grid([
          ['허들·보류 여부', hold.isOnHold ? '예' : '아니오'],
          ['보류 시작일', hold.startedAt],
          ['보류 사유', hold.reason],
          ['결정 상태', hold.decision],
          ['재접근 예정일', hold.nextReviewAt],
          ['종결 여부', hold.isClosed ? '예' : '아니오'],
          ['담당자 확인 필요', hold.needsOwnerCheck ? '예' : '아니오'],
          ['보류 의심(비고 기준)', hold.isSuspectedHold ? '예' : '아니오'],
        ]) },
      { id: 'grade', name: '등급·매출', html: gradeBlock(company) },
      { id: 'sites', name: '현장 (' + (company.siteCount || 0) + ')', html: sitesBlock(company) },
      { id: 'notes', name: '비고·이력', html:
        section('비고', (company.notes || []).length
          ? '<ul class="pcm-card__list">' + company.notes.map(function (n) {
              return '<li class="pcm-card__list-item">' + esc(n.text) + '<br><span class="pcm-card__source">출처: ' + esc(n.source) + '</span></li>';
            }).join('') + '</ul>'
          : empty('비고 없음')) +
        section('발견된 원본 메뉴', '<div class="pcm-card__chips">' + (company.sourceTabs || []).map(function (t) {
          return '<span class="pcm-badge pcm-badge--plain">' + esc(t) + '</span>';
        }).join('') + '</div>') +
        section('변경 이력', (company.changeHistory || []).length
          ? listOf(company.changeHistory.map(function (h) { return h.date + ' · ' + h.text; }))
          : empty('업체 단위 변경 이력이 원본에 없습니다 (변경사항 내역 메뉴는 사이트 전체 로그).')) +
        section('교육·커리큘럼 이력', (company.curriculumHistory || []).length
          ? listOf(company.curriculumHistory)
          : empty('업체별 이수 이력이 원본에 없습니다 (통합 커리큘럼 메뉴는 프로세스 정의 문서).')) },
      { id: 'validation', name: '검증' + ((val9.messages || []).length ? ' (' + val9.messages.length + ')' : ''), html:
        validationBlock(company) +
        '<p class="pcm-card__source" style="margin-top:10px">데이터 기준일: ' +
          esc(company.dataAsOf || opts.dataAsOf || NA) + ' · 마지막 활동일: ' + esc(company.lastActivityAt || NA) + '</p>' },
    ];

    var tabsHTML = panels.map(function (p, i) {
      return '<button type="button" class="pcm-card__tab' + (i === 0 ? ' pcm-is-active' : '') +
        '" data-pcm-tab="' + p.id + '" id="' + uid + '-tab-' + p.id + '" role="tab" aria-selected="' + (i === 0) + '"' +
        ' aria-controls="' + uid + '-panel-' + p.id + '">' + esc(p.name) + '</button>';
    }).join('');
    var panelsHTML = panels.map(function (p, i) {
      return '<div class="pcm-card__panel' + (i === 0 ? ' pcm-is-active' : '') +
        '" data-pcm-panel="' + p.id + '" id="' + uid + '-panel-' + p.id + '" role="tabpanel"' +
        ' aria-labelledby="' + uid + '-tab-' + p.id + '">' + p.html + '</div>';
    }).join('');

    return '' +
    '<article class="pcm-card pcm-card--' + variant + (opts.open ? ' pcm-is-open' : '') + '" data-pcm-card data-pcm-id="' + esc(company.id) + '">' +
      '<header class="pcm-card__header">' +
        '<div class="pcm-card__identity">' +
          '<h3 class="pcm-card__name">' + esc(company.companyName) + '</h3>' +
          '<div class="pcm-card__submeta">' +
            '<span class="pcm-card__code">업체코드 ' + esc(company.companyCode || NA) + '</span>' +
            '<span>진행 단계 ' + esc(mou.stage || NA) + '</span>' +
            '<span>마지막 업데이트 ' + esc(company.lastActivityAt || NA) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="pcm-card__badges">' + badges.join('') + '</div>' +
      '</header>' +

      '<div class="pcm-card__summary">' +
        field('MOU 체결일', mou.signedAt, 'pcm-card__value--num') +
        field('진행 단계', mou.stage) +
        field('경과일', mou.elapsedDays != null ? mou.elapsedDays + '일' : null, 'pcm-card__value--num') +
        field('담당자', (company.manager || {}).name) +
        field('다음 액션', mou.nextAction) +
        field('기존 협력업체', company.isExistingPartner ? '예' : '아니오') +
      '</div>' +

      alertHTML +

      '<button type="button" class="pcm-card__toggle" data-pcm-toggle aria-expanded="' + (opts.open ? 'true' : 'false') + '">' +
        '<span class="pcm-card__toggle-text">상세 보기</span>' +
        '<span class="pcm-card__toggle-arrow" aria-hidden="true">▾</span>' +
      '</button>' +

      '<div class="pcm-card__details">' +
        '<div class="pcm-card__tabs" role="tablist">' + tabsHTML + '</div>' +
        panelsHTML +
      '</div>' +
    '</article>';
  }

  /* ── 이벤트 위임 ────────────────────────────────────── */
  var BOUND = '__pcmBound';
  function bind(container) {
    if (container[BOUND]) return;
    container[BOUND] = true;
    container.addEventListener('click', function (e) {
      var toggle = e.target.closest ? e.target.closest('[data-pcm-toggle]') : null;
      if (toggle && container.contains(toggle)) {
        var card = toggle.closest('[data-pcm-card]');
        var open = card.classList.toggle('pcm-is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        var t = toggle.querySelector('.pcm-card__toggle-text');
        if (t) t.textContent = open ? '접기' : '상세 보기';
        return;
      }
      var tab = e.target.closest ? e.target.closest('[data-pcm-tab]') : null;
      if (tab && container.contains(tab)) {
        var card2 = tab.closest('[data-pcm-card]');
        var id = tab.getAttribute('data-pcm-tab');
        card2.querySelectorAll('[data-pcm-tab]').forEach(function (b) {
          var on = b === tab;
          b.classList.toggle('pcm-is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        card2.querySelectorAll('[data-pcm-panel]').forEach(function (p) {
          p.classList.toggle('pcm-is-active', p.getAttribute('data-pcm-panel') === id);
        });
      }
    });
  }

  /* ── 공개 API ───────────────────────────────────────── */
  var PCMCard = {
    NA: NA,
    STATUS_VARIANT: STATUS_VARIANT,
    /** 회사 1건의 HTML 문자열을 만든다. */
    render: function (company, opts, index) { return cardHTML(company, opts || {}, index || 0); },
    /**
     * 이미 페이지에 그려져 있는 카드 마크업(서버 템플릿 렌더 결과 등)에
     * 상세 펼치기·탭 동작만 연결한다. 같은 컨테이너에 여러 번 호출해도 안전하다.
     */
    bind: function (container) { if (container) bind(container); return container; },
    /** 컨테이너에 카드 목록을 그리고 이벤트를 연결한다. */
    mount: function (container, companies, opts) {
      if (!container) return;
      opts = opts || {};
      container.classList.add('pcm-cards');
      container.innerHTML = (companies || []).map(function (c, i) { return cardHTML(c, opts, i); }).join('');
      bind(container);
      return container;
    },
    mask: { name: maskName, phone: maskPhone, email: maskEmail, address: maskAddress, bizno: maskBizno },
  };

  if (typeof module === 'object' && module.exports) module.exports = PCMCard;
  global.PCMCard = PCMCard;
})(typeof window !== 'undefined' ? window : this);
