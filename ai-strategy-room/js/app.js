/**
 * app.js
 * 화면 전환과 버튼 동작을 담당하는 최상위 스크립트.
 * 실제 회의 로직은 meeting-engine.js, AI 호출은 ai-provider.js에 위임한다.
 */

const els = {
  viewInput: document.getElementById('viewInput'),
  viewProgress: document.getElementById('viewProgress'),
  viewResult: document.getElementById('viewResult'),
  topicInput: document.getElementById('topicInput'),
  fileInput: document.getElementById('fileInput'),
  attachList: document.getElementById('attachList'),
  startBtn: document.getElementById('startBtn'),
  exampleBtn: document.getElementById('exampleBtn'),
  connHint: document.getElementById('connHint'),
  pausedBanner: document.getElementById('pausedBanner'),
  pausedBannerText: document.getElementById('pausedBannerText'),
  resumeBtn: document.getElementById('resumeBtn'),
  discardProgressBtn: document.getElementById('discardProgressBtn'),
  stepList: document.getElementById('stepList'),
  progressModeLabel: document.getElementById('progressModeLabel'),
  reportCard: document.getElementById('reportCard'),
  warningBanner: document.getElementById('warningBanner'),
  copyBtn: document.getElementById('copyBtn'),
  saveTxtBtn: document.getElementById('saveTxtBtn'),
  retryBtn: document.getElementById('retryBtn'),
  newTopicBtn: document.getElementById('newTopicBtn'),
  logToggleBtn: document.getElementById('logToggleBtn'),
  logModalOverlay: document.getElementById('logModalOverlay'),
  logModalClose: document.getElementById('logModalClose'),
  logBody: document.getElementById('logBody'),
  logRetrySection: document.getElementById('logRetrySection'),
  refineCommentInput: document.getElementById('refineCommentInput'),
  refineBtn: document.getElementById('refineBtn'),
  versionsBtn: document.getElementById('versionsBtn'),
  versionsModalOverlay: document.getElementById('versionsModalOverlay'),
  versionsModalClose: document.getElementById('versionsModalClose'),
  versionsBody: document.getElementById('versionsBody'),
  demoBadge: document.getElementById('demoBadge'),
  memoryHint: document.getElementById('memoryHint'),
  memoryManageBtn: document.getElementById('memoryManageBtn'),
  memoryModalOverlay: document.getElementById('memoryModalOverlay'),
  memoryModalClose: document.getElementById('memoryModalClose'),
  memoryModalTitle: document.getElementById('memoryModalTitle'),
  memoryModalDesc: document.getElementById('memoryModalDesc'),
  memoryModalActions: document.getElementById('memoryModalActions'),
  memoryModalBody: document.getElementById('memoryModalBody'),
  connStatus: document.getElementById('connStatus'),
  connDot: document.getElementById('connDot'),
  connText: document.getElementById('connText'),
  toast: document.getElementById('toast')
};

let attachedFiles = []; // File 객체 목록
let lastRunWasExample = false; // 마지막으로 화면에 보여준 결과가 [예시 보기]로 나온 것인지
let currentReportText = '';
let currentLog = [];
let isMeetingRunning = false; // 버튼 연타·중복 호출 방지 (요구사항 10)
let isRefining = false; // 보고서 보완 버튼 연타 방지
let referencedMemoryIds = []; // 사용자가 [이번 회의에 참고]로 직접 선택한 과거 회의 id 목록

/** 라운드 id를 "N단계" 표시용 숫자로 바꾼다 (예: 'redesign' → 3) */
function roundStepNumber(roundId) {
  const idx = MEETING_ROUNDS.findIndex((r) => r.id === roundId);
  return idx >= 0 ? idx + 1 : '?';
}

/* ---------- 화면 전환 ---------- */
function showView(name) {
  els.viewInput.hidden = name !== 'input';
  els.viewProgress.hidden = name !== 'progress';
  els.viewResult.hidden = name !== 'result';
}

/* ---------- 토스트 ---------- */
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

/* ---------- 초기 복원 (최근 주제/보고서) ---------- */
function restoreFromStorage() {
  const topic = Storage.loadTopic();
  if (topic) els.topicInput.value = topic;

  const report = Storage.loadReport();
  if (report) {
    currentReportText = report;
    currentLog = safeParseJson(Storage.loadMeetingLog()) || [];
    lastRunWasExample = Storage.loadWasExample && Storage.loadWasExample() === '1';
    renderReport(report, currentLog, null, lastRunWasExample ? 'demo' : 'live', AiProvider.getActiveTransport());
    showView('result');
  }
}

/* ---------- 이어서 진행 배너 (요구사항 5, 7) ---------- */
// 입력된 주제와 정확히 일치하는, 아직 안 끝난 회의가 저장돼 있으면 배너를 보여준다.
// 프로그램/브라우저가 실수로 닫혔다가 다시 실행했을 때도 여기서 안내된다.
function renderPausedBanner() {
  const topic = els.topicInput.value.trim();
  const p = MeetingProgress.findResumable(topic);
  if (!p) {
    els.pausedBanner.hidden = true;
    return;
  }
  const doneCount = Object.keys(p.roundTexts || {}).length;
  if (p.status === 'paused' && p.pausedAtRound) {
    const prefix = p.pausedReason === 'quality'
      ? `${roundStepNumber(p.pausedAtRound)}단계 품질검증 실패로 일시 중단되었습니다`
      : `${roundStepNumber(p.pausedAtRound)}단계에서 일시 중단됨`;
    els.pausedBannerText.textContent =
      `${prefix} — ${p.pausedMessage || 'Claude 호출에 실패했습니다.'} ` +
      `(${doneCount}개 단계는 이미 완료되어 다시 호출하지 않습니다)`;
  } else {
    els.pausedBannerText.textContent =
      `진행 중인 회의가 있습니다 (완료된 단계 ${doneCount}개). 프로그램이 중간에 닫혔을 수 있습니다 — 이어서 진행하시겠습니까?`;
  }
  els.pausedBanner.hidden = false;
}

els.topicInput.addEventListener('input', renderPausedBanner);

els.discardProgressBtn.addEventListener('click', () => {
  MeetingProgress.clear();
  els.pausedBanner.hidden = true;
  showToast('저장된 진행 상태를 지웠습니다. 새로 시작합니다.');
});

els.resumeBtn.addEventListener('click', () => {
  const topic = els.topicInput.value.trim();
  const p = MeetingProgress.findResumable(topic);
  if (!p) {
    showToast('이어서 진행할 회의를 찾지 못했습니다.');
    renderPausedBanner();
    return;
  }
  startMeeting({ resumeState: p });
});

/* ---------- 과거 회의 기억 (CrewAI Memory 개념을 가볍게 이식) ---------- */
// 절대 자동으로 강제 주입하지 않는다 — 사용자가 [이번 회의에 참고]를 직접
// 눌렀을 때만 새 회의 컨텍스트에 배경 정보로 포함된다.
const MEMORY_STORED_FIELDS_NOTICE =
  '저장되는 정보: 회의 날짜, 안건 제목/주제, 결론 요약, 핵심 실행안, 주요 리스크, 최종 보고서. ' +
  '첨부파일 원문은 저장되지 않습니다.';

/** 지금 입력된 주제가 이미 완료/진행된 그 회의 자신이면(같은 주제) 자기 자신은 "비슷한 과거 회의"에서 제외한다 */
function _currentMemoryExcludeId(topic) {
  const p = MeetingProgress.load();
  return p && p.topic === topic ? p.memoryId || null : null;
}

function renderMemoryHint() {
  if (!els.memoryHint) return;
  const topic = els.topicInput.value.trim();
  if (!topic) {
    els.memoryHint.hidden = true;
    return;
  }
  const similar = MeetingMemory.findSimilar(topic, _currentMemoryExcludeId(topic), 5);
  if (!similar.length) {
    els.memoryHint.hidden = true;
    return;
  }
  const refCount = referencedMemoryIds.length;
  els.memoryHint.hidden = false;
  els.memoryHint.innerHTML =
    `🕓 비슷한 과거 회의 ${similar.length}건이 있습니다 <button type="button" class="memory-hint-link" id="memoryHintViewBtn">보기</button>` +
    (refCount ? ` <span class="memory-ref-note">(${refCount}건 이번 회의에 참고 예정)</span>` : '');
  const viewBtn = document.getElementById('memoryHintViewBtn');
  if (viewBtn) viewBtn.addEventListener('click', () => openMemoryModal('similar'));
}

function openMemoryModal(mode) {
  const topic = els.topicInput.value.trim();
  const records = mode === 'similar'
    ? MeetingMemory.findSimilar(topic, _currentMemoryExcludeId(topic), 10)
    : MeetingMemory.list().slice().reverse();

  els.memoryModalTitle.textContent = mode === 'similar' ? '비슷한 과거 회의' : '지난 회의 기록 관리';
  els.memoryModalDesc.textContent = mode === 'similar'
    ? '과거 회의 내용은 자동으로 반영되지 않습니다. [이번 회의에 참고]를 누른 항목만 새 회의에 배경 정보로 전달됩니다.'
    : MEMORY_STORED_FIELDS_NOTICE;

  els.memoryModalActions.innerHTML = mode === 'all'
    ? '<button class="btn-ghost btn-sm" id="memoryClearAllBtn">전체 기록 삭제</button>'
    : '';
  const clearAllBtn = document.getElementById('memoryClearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      armDoubleConfirm(clearAllBtn, '전체 기록 삭제', '정말 삭제? 다시 클릭', () => {
        MeetingMemory.clearAll();
        showToast('과거 회의 기록을 모두 삭제했습니다.');
        openMemoryModal(mode);
        renderMemoryHint();
        refreshMemoryManageBtn();
      });
    });
  }

  if (!records.length) {
    els.memoryModalBody.innerHTML = `<p class="modal-desc">${mode === 'similar' ? '비슷한 과거 회의가 없습니다.' : '저장된 과거 회의 기록이 없습니다.'}</p>`;
  } else {
    els.memoryModalBody.innerHTML = records
      .map((r) => {
        const when = new Date(r.createdAt).toLocaleString('ko-KR');
        const isRef = referencedMemoryIds.includes(r.id);
        return `
        <div class="log-entry memory-entry" data-memory-id="${r.id}">
          <div class="log-entry-expert">${escapeHtml(r.title)} · ${when}${r.wasRefinedByUser ? ' · 사용자 보완됨' : ''}</div>
          <div class="log-entry-text"><b>주제</b> ${escapeHtml(r.topic)}</div>
          ${r.conclusionSummary ? `<div class="log-entry-text"><b>결론 요약</b> ${escapeHtml(r.conclusionSummary)}</div>` : ''}
          ${r.keyActions ? `<div class="log-entry-text"><b>핵심 실행안</b> ${escapeHtml(r.keyActions)}</div>` : ''}
          ${r.keyRisks ? `<div class="log-entry-text"><b>주요 리스크</b> ${escapeHtml(r.keyRisks)}</div>` : ''}
          <div class="memory-entry-actions">
            <button class="btn-ghost btn-sm memory-ref-btn" data-ref-id="${r.id}">${isRef ? '참고 해제' : '이번 회의에 참고'}</button>
            <button class="btn-ghost btn-sm memory-delete-btn" data-delete-id="${r.id}">삭제</button>
          </div>
        </div>`;
      })
      .join('');
  }

  els.memoryModalOverlay.classList.add('open');
}

function armDoubleConfirm(btn, label, confirmLabel, onConfirm) {
  if (btn.dataset.armed === '1') {
    btn.dataset.armed = '0';
    btn.textContent = label;
    onConfirm();
    return;
  }
  btn.dataset.armed = '1';
  btn.textContent = confirmLabel;
  setTimeout(() => {
    if (btn.dataset.armed === '1') {
      btn.dataset.armed = '0';
      btn.textContent = label;
    }
  }, 3000);
}

function refreshMemoryManageBtn() {
  if (!els.memoryManageBtn) return;
  const count = MeetingMemory.list().length;
  els.memoryManageBtn.textContent = count ? `지난 회의 기록 관리 (${count})` : '지난 회의 기록 관리';
}

/** 완료된 회의 하나를 "과거 회의 기억"에 저장(또는 이미 있으면 건너뜀)한다 */
function saveMeetingToMemory(topic, report, hasAttachment) {
  const progress = MeetingProgress.load();
  if (progress && progress.topic === topic && progress.memoryId) return; // 이미 저장됨
  const id = MeetingMemory.create({ topic, report, hasAttachment });
  MeetingProgress.setMemoryId(topic, id);
  refreshMemoryManageBtn();
}

els.topicInput.addEventListener('input', renderMemoryHint);
els.memoryManageBtn.addEventListener('click', () => openMemoryModal('all'));
els.memoryModalClose.addEventListener('click', () => els.memoryModalOverlay.classList.remove('open'));
els.memoryModalOverlay.addEventListener('click', (e) => { if (e.target === els.memoryModalOverlay) els.memoryModalOverlay.classList.remove('open'); });
els.memoryModalBody.addEventListener('click', (e) => {
  const refBtn = e.target.closest('[data-ref-id]');
  if (refBtn) {
    const id = refBtn.dataset.refId;
    const idx = referencedMemoryIds.indexOf(id);
    if (idx === -1) {
      referencedMemoryIds.push(id);
      refBtn.textContent = '참고 해제';
    } else {
      referencedMemoryIds.splice(idx, 1);
      refBtn.textContent = '이번 회의에 참고';
    }
    renderMemoryHint();
    return;
  }
  const delBtn = e.target.closest('[data-delete-id]');
  if (delBtn) {
    const id = delBtn.dataset.deleteId;
    armDoubleConfirm(delBtn, '삭제', '정말 삭제?', () => {
      MeetingMemory.remove(id);
      referencedMemoryIds = referencedMemoryIds.filter((x) => x !== id);
      const entry = delBtn.closest('[data-memory-id]');
      if (entry) entry.remove();
      showToast('삭제했습니다.');
      renderMemoryHint();
      refreshMemoryManageBtn();
    });
  }
});

/* ---------- 상단 연결 상태 표시 ---------- */
// 연결 안 됨의 원인을 최대한 구체적으로 구분해서 보여준다:
// 미설치 / 로그인 필요 / 로컬 서버(포트)에 아예 연결 안 됨.
const CONN_STATUS_TEXT = {
  connected: 'Claude 연결됨',
  'not-installed': 'Claude Code 설치 필요',
  'login-required': 'Claude 로그인 필요',
  'server-unreachable': 'Claude 연결 안 됨'
};
const CONN_STATUS_HINT = {
  'not-installed':
    '이 PC에 Claude Code가 설치되어 있지 않습니다. 같은 폴더의 "설치안내.txt"를 참고해 설치한 뒤 AI전략회의실.bat을 다시 실행해주세요.',
  'login-required':
    'Claude 로그인이 아직 완료되지 않았습니다. AI전략회의실.bat 창을 확인해주세요 — 곧 브라우저 로그인 창이 자동으로 뜨거나 이미 떠 있을 수 있습니다.',
  'server-unreachable':
    '로컬 서버(127.0.0.1:8787)에 연결하지 못했습니다. "AI전략회의실.bat"을 더블클릭해서 실행했는지, 그 창이 아직 열려있는지 확인해주세요. 계속 안 되면 같은 폴더의 logs\\run.log 파일을 열어 내용을 확인해주세요.'
};

async function refreshConnStatus() {
  const ok = await AiProvider.detectLocalServer();
  const status = AiProvider.getConnStatus();

  els.connStatus.classList.toggle('connected', ok);
  els.connStatus.classList.toggle('disconnected', !ok);
  els.connText.textContent = CONN_STATUS_TEXT[status] || 'Claude 연결 안 됨';

  if (els.connHint) {
    if (ok) {
      els.connHint.hidden = true;
      els.connHint.textContent = '';
    } else {
      els.connHint.hidden = false;
      els.connHint.textContent = CONN_STATUS_HINT[status] || CONN_STATUS_HINT['server-unreachable'];
    }
  }
  return ok;
}

/**
 * 페이지가 막 열린 직후에는 로컬 서버가 아주 살짝 늦게 뜰 수 있어(느린 PC,
 * 브라우저 콜드 스타트 등) 한 번의 확인만으로 "연결 안 됨"이라고 단정하지
 * 않는다 — 최대 10회, 1초 간격으로 재확인해 순간적인 지연을 오탐하지 않는다.
 */
async function warmupConnStatus() {
  for (let i = 0; i < 10; i++) {
    const ok = await refreshConnStatus();
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
function safeParseJson(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

/* ---------- 파일 첨부 ---------- */
els.fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  attachedFiles = attachedFiles.concat(files);
  renderAttachList();
  e.target.value = '';
});

function renderAttachList() {
  els.attachList.innerHTML = attachedFiles
    .map(
      (f, i) => `
      <div class="attach-item ok" data-index="${i}">
        <span>${escapeHtml(f.name)}</span>
        <button type="button" data-remove="${i}" title="제거">✕</button>
      </div>`
    )
    .join('');
}
els.attachList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  const idx = Number(btn.dataset.remove);
  attachedFiles.splice(idx, 1);
  renderAttachList();
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 진행 화면 렌더 ---------- */
function renderSteps() {
  els.stepList.innerHTML = MEETING_ROUNDS.map(
    (r) => `<li class="step-item" data-round="${r.id}"><span class="step-mark"></span><span class="step-text">${escapeHtml(r.stepLabel)}</span></li>`
  ).join('');
}
function updateStep(roundId, status) {
  const li = els.stepList.querySelector(`[data-round="${roundId}"]`);
  if (!li) return;
  li.classList.remove('active', 'done');
  if (status === 'active') li.classList.add('active');
  if (status === 'done') li.classList.add('done');
  const mark = li.querySelector('.step-mark');
  mark.textContent = status === 'done' ? '✓' : '';
}

/* ---------- 결과 화면 렌더 ---------- */
function renderReport(reportText, log, warning, mode, transport) {
  els.reportCard.innerHTML = ReportBuilder.renderFullReport(reportText);
  currentLog = log || [];
  renderLog(currentLog);

  if (warning) {
    els.warningBanner.hidden = false;
    els.warningBanner.textContent = `⚠ ${warning}`;
  } else {
    els.warningBanner.hidden = true;
    els.warningBanner.textContent = '';
  }

  els.demoBadge.hidden = mode !== 'demo';
  refreshVersionsButton();
}

function renderLog(log) {
  if (!log || !log.length) {
    els.logBody.innerHTML = '<p class="modal-desc">기록된 내부 회의 로그가 없습니다.</p>';
    return;
  }
  els.logBody.innerHTML = log
    .map(
      (round) => `
      <div>
        <div class="log-round-title">${escapeHtml(round.round)}</div>
        ${round.entries
          .map(
            (entry) => `
          <div class="log-entry">
            <div class="log-entry-expert">${escapeHtml(entry.expert)}</div>
            <div class="log-entry-text">${escapeHtml(entry.text)}</div>
          </div>`
          )
          .join('')}
      </div>`
    )
    .join('');
}

/* ---------- 재시도 기록 (네트워크 재시도 / 품질 재시도 구분 표시) ---------- */
function renderRetryLog() {
  if (!els.logRetrySection) return;
  const log = MeetingProgress.loadRetryLog();
  if (!log.length) {
    els.logRetrySection.innerHTML = '';
    els.logRetrySection.hidden = true;
    return;
  }
  els.logRetrySection.hidden = false;
  els.logRetrySection.innerHTML =
    '<div class="log-round-title">재시도 기록</div>' +
    log
      .slice()
      .reverse()
      .map((entry) => {
        const tagMap = { network: '네트워크 재시도', quality: '품질 재시도', 'llm-quality': 'LLM 품질판정' };
        const clsMap = { network: 'retry-tag-network', quality: 'retry-tag-quality', 'llm-quality': 'retry-tag-llm' };
        const tag = tagMap[entry.type] || entry.type;
        const cls = clsMap[entry.type] || 'retry-tag-network';
        return `
        <div class="log-entry retry-entry">
          <div class="log-entry-expert"><span class="retry-tag ${cls}">${tag}</span> ${escapeHtml(entry.roundId)} · 시도 #${entry.attempt}</div>
          <div class="log-entry-text">${escapeHtml(entry.detail)}</div>
        </div>`;
      })
      .join('');
}

/* ---------- 보고서 버전 기록 (보완 요청으로 바뀔 때마다 이전 버전 보존) ---------- */
function refreshVersionsButton() {
  if (!els.versionsBtn) return;
  const topic = els.topicInput.value.trim();
  const history = MeetingProgress.getReportHistory(topic);
  els.versionsBtn.hidden = history.length === 0;
}

function renderVersionsModal() {
  const topic = els.topicInput.value.trim();
  const history = MeetingProgress.getReportHistory(topic);
  if (!history.length) {
    els.versionsBody.innerHTML = '<p class="modal-desc">이전 버전이 없습니다.</p>';
    return;
  }
  els.versionsBody.innerHTML = history
    .slice()
    .reverse()
    .map((v, i) => {
      const idx = history.length - 1 - i; // 원래 인덱스(복원 시 사용)
      const when = new Date(v.at).toLocaleString('ko-KR');
      const originLabel = idx === 0 ? '(원본 보고서)' : `(${idx}번째 보완 이전 버전)`;
      const changeLabel = v.comment ? `"${escapeHtml(v.comment)}" 요청으로 다음 버전으로 교체됨` : '이후 다른 버전으로 교체됨';
      return `
      <div class="log-entry version-entry">
        <div class="log-entry-expert">${originLabel} · ${when}</div>
        <div class="log-entry-text version-preview">${escapeHtml((v.report || '').slice(0, 200))}${(v.report || '').length > 200 ? '…' : ''}</div>
        <div class="log-entry-text">${changeLabel}</div>
        <button class="btn-ghost btn-sm" data-restore-index="${idx}">이 버전으로 복원</button>
      </div>`;
    })
    .join('');
}

function restoreReportVersion(index) {
  const topic = els.topicInput.value.trim();
  const history = MeetingProgress.getReportHistory(topic);
  const entry = history[index];
  if (!entry) return;

  // replaceReportWithHistory가 "지금까지 보던 최신본"을 먼저 이력에 남긴 뒤 교체하므로
  // 나중에 다시 최신본으로 돌아오고 싶으면 버전 기록에서 그것도 선택할 수 있다.
  MeetingProgress.replaceReportWithHistory(topic, entry.report, '[복원] 이전 버전으로 되돌림');
  currentReportText = entry.report;
  Storage.saveReport(entry.report);
  renderReport(entry.report, currentLog, null, 'live', AiProvider.getActiveTransport());
  els.versionsModalOverlay.classList.remove('open');
  showToast('이전 버전으로 복원했습니다.');
}

/* ---------- 전략회의 시작 / 이어서 진행 (공용 로직) ---------- */
/**
 * resumeState가 있으면 이미 성공한 단계는 다시 호출하지 않고 이어서 진행한다
 * (요구사항 6). 시작 버튼과 "이어서 진행" 버튼이 이 함수 하나를 공유한다.
 */
async function startMeeting({ resumeState } = {}) {
  // 버튼 연타·중복 실행 방지 (요구사항 10) — disabled 속성보다 먼저, 가장 앞에서 막는다.
  if (isMeetingRunning) return;

  const topic = els.topicInput.value.trim();
  if (!topic) {
    showToast('주제를 입력해주세요');
    els.topicInput.focus();
    return;
  }

  // 이 시점 이후 첫 await(refreshConnStatus) 전에 곧바로 잠가야 한다 — 아래처럼
  // await 뒤에서 플래그를 세우면 그 사이(연결 확인 중)에 들어온 다른 클릭이
  // 똑같이 isMeetingRunning===false를 보고 통과해버려 중복 실행될 수 있다.
  isMeetingRunning = true;
  els.startBtn.disabled = true;
  els.resumeBtn.disabled = true;

  // Claude 연결이 안 되어 있으면 회의를 시작하지 않고 명확히 안내한다.
  // (연결 실패를 예시 결과로 조용히 대체하지 않는다)
  const connected = await refreshConnStatus();
  if (!connected) {
    isMeetingRunning = false;
    els.startBtn.disabled = false;
    els.resumeBtn.disabled = false;
    showToast('Claude가 연결되어 있지 않습니다. AI전략회의실.bat으로 실행해주세요.');
    return;
  }

  els.pausedBanner.hidden = true;
  Storage.saveTopic(topic);

  // 이어서 진행이면 저장된 첨부자료 텍스트를 그대로 재사용한다(파일을 다시 올릴 필요 없음).
  // 새로 시작이면 지금 첨부된 파일을 파싱한다.
  let attachedText = '';
  let hasUsableAttachment = false;
  if (resumeState) {
    attachedText = resumeState.attachedText || '';
    hasUsableAttachment = !!resumeState.hasAttachment;
  } else if (attachedFiles.length) {
    const results = await parseFiles(attachedFiles);
    const parts = [];
    results.forEach((r) => {
      if (r.ok) {
        parts.push(`[${r.fileName}]\n${r.text}`);
        hasUsableAttachment = true;
      } else {
        showToast(r.message);
      }
    });
    attachedText = parts.join('\n\n');
  }

  showView('progress');
  renderSteps();
  // 이어서 진행이면 이미 끝난 단계를 화면에도 곧바로 완료로 표시해준다.
  if (resumeState && resumeState.roundTexts) {
    Object.keys(resumeState.roundTexts).forEach((roundId) => updateStep(roundId, 'done'));
  }
  els.progressModeLabel.textContent = resumeState
    ? '이어서 진행합니다 — 이미 완료된 단계는 다시 호출하지 않습니다.'
    : hasUsableAttachment
      ? '첨부자료를 반영한 근거분석 모드로 진행합니다.'
      : '전략회의 모드로 진행합니다.';

  // 사용자가 [이번 회의에 참고]로 직접 선택한 과거 회의만 배경 정보로 전달한다.
  // (재개일 때는 이미 체크포인트의 context에 포함돼 있으므로 다시 넣지 않는다)
  let referenceContext = '';
  if (!resumeState && referencedMemoryIds.length) {
    const refRecords = referencedMemoryIds.map((id) => MeetingMemory.get(id)).filter(Boolean);
    if (refRecords.length) {
      const blocks = refRecords
        .map((r, i) => `(${i + 1}) 과거 주제: ${r.topic}\n당시 결론 요약: ${r.conclusionSummary || '(기록 없음)'}\n당시 핵심 실행안: ${r.keyActions || '(기록 없음)'}\n당시 주요 리스크: ${r.keyRisks || '(기록 없음)'}`)
        .join('\n\n');
      referenceContext = `[참고: 사용자가 직접 선택한 과거 유사 회의 — 배경 참고용일 뿐 정답이 아니다. 지금 주제를 처음부터 독립적으로 검토하되, 실제로 관련 있는 내용만 참고하고 과거 결론을 그대로 베끼지 마라]\n${blocks}`;
    }
  }
  referencedMemoryIds = []; // 이번 요청에 반영했으니 선택 상태를 초기화한다
  renderMemoryHint();

  let result;
  try {
    result = await MeetingEngine.run({
      topic,
      attachedText,
      hasAttachment: hasUsableAttachment,
      onProgress: updateStep,
      resumeState,
      referenceContext
    });
  } catch (err) {
    console.error(err);
    isMeetingRunning = false;
    els.startBtn.disabled = false;
    els.resumeBtn.disabled = false;
    if (err && err.isPaused) {
      // 재시도까지 모두 실패 — 처음부터 다시 하지 않고, 어디서/왜 멈췄는지 정확히 안내한다.
      const reasonLabel = err.pausedReason === 'quality' ? '품질검증 실패' : '오류';
      showToast(`${roundStepNumber(err.pausedAtRound)}단계 ${reasonLabel}로 일시 중단됨. 이어서 진행할 수 있습니다.`);
    } else {
      // 실패를 예시 결과로 감추지 않고, 실패 사유를 그대로 보여준다.
      showToast((err && err.message) || '회의 진행 중 오류가 발생했습니다.');
    }
    showView('input');
    renderPausedBanner();
    return;
  }

  currentReportText = result.report;
  currentLog = result.log;
  lastRunWasExample = false;
  Storage.saveReport(result.report);
  Storage.saveMeetingLog(JSON.stringify(result.log || []));
  Storage.saveWasExample(false);
  saveMeetingToMemory(topic, result.report, hasUsableAttachment); // 회의가 정상 완료된 경우에만 저장

  renderReport(result.report, result.log, result.warning, 'live', result.transport);
  showView('result');
  isMeetingRunning = false;
  els.startBtn.disabled = false;
  els.resumeBtn.disabled = false;
}

els.startBtn.addEventListener('click', () => startMeeting());

/* ---------- 예시 보기 (사용자가 직접 선택했을 때만 데모 표시) ---------- */
els.exampleBtn.addEventListener('click', async () => {
  if (isMeetingRunning) return; // 버튼 연타 방지
  const topic = els.topicInput.value.trim();

  isMeetingRunning = true;
  els.exampleBtn.disabled = true;
  els.startBtn.disabled = true;
  showView('progress');
  renderSteps();
  els.progressModeLabel.textContent = '예시 보기 — 실제 회의가 아닌 예시 결과를 보여줍니다.';

  const result = await MeetingEngine.runExample({ topic, onProgress: updateStep });

  currentReportText = result.report;
  currentLog = result.log;
  lastRunWasExample = true;
  Storage.saveReport(result.report);
  Storage.saveMeetingLog(JSON.stringify(result.log || []));
  Storage.saveWasExample(true);

  renderReport(result.report, result.log, null, 'demo', 'none');
  showView('result');
  isMeetingRunning = false;
  els.exampleBtn.disabled = false;
  els.startBtn.disabled = false;
});

/* ---------- 결과 화면 버튼 ---------- */
els.copyBtn.addEventListener('click', () => {
  const text = ReportBuilder.toPlainText(currentReportText);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('복사되었습니다')).catch(() => showToast('복사에 실패했습니다'));
  } else {
    showToast('이 브라우저에서는 복사가 지원되지 않습니다');
  }
});

els.saveTxtBtn.addEventListener('click', () => {
  const text = ReportBuilder.toPlainText(currentReportText);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'AI전략회의_보고서.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

els.retryBtn.addEventListener('click', () => {
  // 마지막으로 본 결과가 예시였다면 예시를 다시, 실제 회의였다면 실제 회의를 다시 시작한다.
  if (lastRunWasExample) {
    els.exampleBtn.click();
  } else {
    els.startBtn.click();
  }
});

els.newTopicBtn.addEventListener('click', () => {
  els.topicInput.value = '';
  attachedFiles = [];
  renderAttachList();
  currentReportText = '';
  currentLog = [];
  lastRunWasExample = false;
  referencedMemoryIds = [];
  els.demoBadge.hidden = true;
  els.refineCommentInput.value = '';
  els.versionsBtn.hidden = true;
  Storage.clearAll();
  renderPausedBanner(); // 주제가 비었으니 배너도 함께 정리
  renderMemoryHint();
  showView('input');
  els.topicInput.focus();
});

/* ---------- 내부 회의 로그 모달 ---------- */
els.logToggleBtn.addEventListener('click', () => {
  renderRetryLog();
  els.logModalOverlay.classList.add('open');
});
els.logModalClose.addEventListener('click', () => els.logModalOverlay.classList.remove('open'));
els.logModalOverlay.addEventListener('click', (e) => { if (e.target === els.logModalOverlay) els.logModalOverlay.classList.remove('open'); });

/* ---------- 보고서 보완 요청 (요구사항 3) ---------- */
els.refineBtn.addEventListener('click', async () => {
  if (isRefining) return; // 버튼 연타·중복 호출 방지
  const comment = els.refineCommentInput.value.trim();
  if (!comment) {
    showToast('보완 요청 내용을 입력해주세요.');
    return; // 코멘트 없이 보완 버튼을 누르면 실행하지 않는다
  }

  const topic = els.topicInput.value.trim();
  const previousReport = currentReportText;

  isRefining = true;
  els.refineBtn.disabled = true;
  els.refineBtn.textContent = '보완 중...';

  try {
    const refined = await MeetingEngine.refineReport({
      topic,
      previousReport,
      transcript: currentLog,
      comment
    });

    // 기존 보고서를 덮어쓰기 전에 이전 버전을 먼저 보존한다.
    MeetingProgress.replaceReportWithHistory(topic, refined, comment);
    currentReportText = refined;
    Storage.saveReport(refined);

    // 과거 회의 기억도 같은 레코드를 갱신한다(새 레코드를 만들지 않는다).
    const progress = MeetingProgress.load();
    const memoryId = progress && progress.topic === topic ? progress.memoryId : null;
    if (memoryId) {
      MeetingMemory.updateAfterRefine(memoryId, { report: refined });
    } else {
      saveMeetingToMemory(topic, refined, !!(progress && progress.hasAttachment));
    }

    renderReport(refined, currentLog, null, 'live', AiProvider.getActiveTransport());
    els.refineCommentInput.value = '';
    showToast('보고서를 보완했습니다.');
  } catch (err) {
    console.error(err);
    showToast((err && err.message) || '보고서 보완 중 오류가 발생했습니다.');
  } finally {
    isRefining = false;
    els.refineBtn.disabled = false;
    els.refineBtn.textContent = '보완하기';
  }
});

/* ---------- 보고서 버전 기록 모달 ---------- */
els.versionsBtn.addEventListener('click', () => {
  renderVersionsModal();
  els.versionsModalOverlay.classList.add('open');
});
els.versionsModalClose.addEventListener('click', () => els.versionsModalOverlay.classList.remove('open'));
els.versionsModalOverlay.addEventListener('click', (e) => { if (e.target === els.versionsModalOverlay) els.versionsModalOverlay.classList.remove('open'); });
els.versionsBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-restore-index]');
  if (!btn) return;
  restoreReportVersion(Number(btn.dataset.restoreIndex));
});

/* ---------- 초기화 ---------- */
(async function initApp() {
  restoreFromStorage();       // 화면부터 먼저 그려서 사용자가 기다리지 않게 한다
  renderPausedBanner();       // 진행 중인/일시중단된 회의가 있으면 즉시 안내 (요구사항 7)
  renderMemoryHint();         // 비슷한 과거 회의가 있으면 안내
  refreshMemoryManageBtn();
  await warmupConnStatus();   // 콜드 스타트 지연을 감안해 초반에는 여러 번 재확인
  // .bat으로 실행한 경우에도 창을 오래 켜두면 연결 상태가 바뀔 수 있으니 주기적으로 재확인한다.
  // 단, 회의/보완이 진행 중일 때는 건너뛴다 — 로컬 서버(run.ps1)는 한 번에 요청
  // 하나만 처리하므로, claude 응답을 기다리는 동안에는 이 상태확인 요청 자체가
  // 응답을 못 받고 타임아웃돼서 "연결 안 됨"으로 잘못 표시될 수 있다(실제로는
  // 서버가 바쁠 뿐 정상 동작 중임 — 오탐 방지).
  setInterval(() => {
    if (isMeetingRunning || isRefining) return;
    refreshConnStatus();
  }, 15000);
})();
