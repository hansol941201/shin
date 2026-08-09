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
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModalOverlay: document.getElementById('settingsModalOverlay'),
  settingsModalClose: document.getElementById('settingsModalClose'),
  settingsForm: document.getElementById('settingsForm'),
  providerSelect: document.getElementById('providerSelect'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  settingsClearBtn: document.getElementById('settingsClearBtn'),
  demoBadge: document.getElementById('demoBadge'),
  liveBadge: document.getElementById('liveBadge'),
  localServerStatus: document.getElementById('localServerStatus'),
  toast: document.getElementById('toast')
};

const TRANSPORT_LABEL = {
  'claude-code': '이 PC의 Claude Code',
  anthropic: 'Anthropic API 키',
  openai: 'OpenAI API 키',
  none: '연결 없음'
};

let attachedFiles = []; // File 객체 목록
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
    renderReport(report, currentLog, null, AiProvider.isConfigured() ? 'live' : 'demo', AiProvider.getActiveTransport());
    showView('result');
  }
}

/* ---------- 로컬 Claude Code 연결 상태 표시 ---------- */
async function refreshLocalServerStatus() {
  const ok = await AiProvider.detectLocalServer();
  if (!els.localServerStatus) return ok;
  els.localServerStatus.textContent = ok
    ? '✅ 이 PC의 Claude Code에 연결되었습니다. 별도 API 키 없이 실제 회의가 진행됩니다.'
    : '⚪ 로컬 Claude Code 연결이 감지되지 않았습니다. index.html을 직접 연 경우 AI전략회의실.bat으로 실행해주세요. (연결 전까지는 데모 모드 또는 아래 보조 API 키로 동작합니다)';
  return ok;
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
  if (els.liveBadge) {
    const isLocalLive = mode === 'live' && transport === 'claude-code';
    els.liveBadge.hidden = !isLocalLive;
  }
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
    showToast('회의 진행 중 오류가 발생했습니다.');
    showView('input');
    els.startBtn.disabled = false;
    return;
  }

  currentReportText = result.report;
  currentLog = result.log;
  Storage.saveReport(result.report);
  Storage.saveMeetingLog(JSON.stringify(result.log || []));

  renderReport(result.report, result.log, result.warning, result.mode, result.transport);
  showView('result');
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
  els.startBtn.click();
});

els.newTopicBtn.addEventListener('click', () => {
  els.topicInput.value = '';
  attachedFiles = [];
  renderAttachList();
  currentReportText = '';
  currentLog = [];
  els.demoBadge.hidden = true;
  Storage.clearAll();
  showView('input');
  els.topicInput.focus();
});

/* ---------- 내부 회의 로그 모달 ---------- */
els.logToggleBtn.addEventListener('click', () => els.logModalOverlay.classList.add('open'));
els.logModalClose.addEventListener('click', () => els.logModalOverlay.classList.remove('open'));
els.logModalOverlay.addEventListener('click', (e) => { if (e.target === els.logModalOverlay) els.logModalOverlay.classList.remove('open'); });

/* ---------- AI 연결 설정 모달 ---------- */
function openSettingsModal() {
  const provider = AiProvider.getProvider();
  els.providerSelect.value = provider || '';
  els.apiKeyInput.value = provider ? AiProvider.getKey(provider) : '';
  els.settingsModalOverlay.classList.add('open');
  refreshLocalServerStatus();
}
els.settingsBtn.addEventListener('click', openSettingsModal);
els.settingsModalClose.addEventListener('click', () => els.settingsModalOverlay.classList.remove('open'));
els.settingsModalOverlay.addEventListener('click', (e) => { if (e.target === els.settingsModalOverlay) els.settingsModalOverlay.classList.remove('open'); });

els.settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const provider = els.providerSelect.value;
  const key = els.apiKeyInput.value.trim();
  if (!provider || !key) {
    AiProvider.setProvider('');
    showToast('AI 연결을 사용하지 않습니다 (데모 모드)');
  } else {
    AiProvider.setProvider(provider);
    AiProvider.setKey(provider, key);
    showToast('AI 연결 정보가 저장되었습니다');
  }
  els.settingsModalOverlay.classList.remove('open');
});
els.settingsClearBtn.addEventListener('click', () => {
  const provider = els.providerSelect.value || AiProvider.getProvider();
  if (provider) AiProvider.clearKey(provider);
  AiProvider.setProvider('');
  els.apiKeyInput.value = '';
  els.providerSelect.value = '';
  showToast('AI 연결 정보가 삭제되었습니다');
});

/* ---------- 초기화 ---------- */
(async function initApp() {
  await refreshLocalServerStatus(); // 로컬 Claude Code 서버 감지를 먼저 끝내야
  restoreFromStorage();             // 배지(DEMO/LIVE)가 정확하게 표시된다
})();
