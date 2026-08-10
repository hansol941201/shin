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
  demoBadge: document.getElementById('demoBadge'),
  connStatus: document.getElementById('connStatus'),
  connDot: document.getElementById('connDot'),
  connText: document.getElementById('connText'),
  toast: document.getElementById('toast')
};

let attachedFiles = []; // File 객체 목록
let lastRunWasExample = false; // 마지막으로 화면에 보여준 결과가 [예시 보기]로 나온 것인지
let currentReportText = '';
let currentLog = [];

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
  els.reportCard.innerHTML = ReportBuilder.renderToHtml(reportText);
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

/* ---------- 전략회의 시작 ---------- */
els.startBtn.addEventListener('click', async () => {
  const topic = els.topicInput.value.trim();
  if (!topic) {
    showToast('주제를 입력해주세요');
    els.topicInput.focus();
    return;
  }

  // Claude 연결이 안 되어 있으면 회의를 시작하지 않고 명확히 안내한다.
  // (연결 실패를 예시 결과로 조용히 대체하지 않는다)
  const connected = await refreshConnStatus();
  if (!connected) {
    showToast('Claude가 연결되어 있지 않습니다. AI전략회의실.bat으로 실행해주세요.');
    return;
  }

  els.startBtn.disabled = true;
  Storage.saveTopic(topic);

  // 첨부자료 유무로 모드 자동 판단 (사용자가 직접 고르지 않음)
  let attachedText = '';
  let hasUsableAttachment = false;
  if (attachedFiles.length) {
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
  els.progressModeLabel.textContent = hasUsableAttachment
    ? '첨부자료를 반영한 근거분석 모드로 진행합니다.'
    : '전략회의 모드로 진행합니다.';

  let result;
  try {
    result = await MeetingEngine.run({
      topic,
      attachedText,
      hasAttachment: hasUsableAttachment,
      onProgress: updateStep
    });
  } catch (err) {
    console.error(err);
    // 실패를 예시 결과로 감추지 않고, 실패 사유를 그대로 보여준다.
    showToast((err && err.message) || '회의 진행 중 오류가 발생했습니다.');
    showView('input');
    els.startBtn.disabled = false;
    return;
  }

  currentReportText = result.report;
  currentLog = result.log;
  lastRunWasExample = false;
  Storage.saveReport(result.report);
  Storage.saveMeetingLog(JSON.stringify(result.log || []));
  Storage.saveWasExample(false);

  renderReport(result.report, result.log, result.warning, 'live', result.transport);
  showView('result');
  els.startBtn.disabled = false;
});

/* ---------- 예시 보기 (사용자가 직접 선택했을 때만 데모 표시) ---------- */
els.exampleBtn.addEventListener('click', async () => {
  const topic = els.topicInput.value.trim();

  els.exampleBtn.disabled = true;
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
  els.exampleBtn.disabled = false;
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
  els.demoBadge.hidden = true;
  Storage.clearAll();
  showView('input');
  els.topicInput.focus();
});

/* ---------- 내부 회의 로그 모달 ---------- */
els.logToggleBtn.addEventListener('click', () => els.logModalOverlay.classList.add('open'));
els.logModalClose.addEventListener('click', () => els.logModalOverlay.classList.remove('open'));
els.logModalOverlay.addEventListener('click', (e) => { if (e.target === els.logModalOverlay) els.logModalOverlay.classList.remove('open'); });

/* ---------- 초기화 ---------- */
(async function initApp() {
  restoreFromStorage();       // 화면부터 먼저 그려서 사용자가 기다리지 않게 한다
  await warmupConnStatus();   // 콜드 스타트 지연을 감안해 초반에는 여러 번 재확인
  // .bat으로 실행한 경우에도 창을 오래 켜두면 연결 상태가 바뀔 수 있으니 주기적으로 재확인한다.
  setInterval(refreshConnStatus, 15000);
})();
