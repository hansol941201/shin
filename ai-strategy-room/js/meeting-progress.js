/**
 * meeting-progress.js
 * 진행 중인 회의를 단계(라운드)가 끝날 때마다 브라우저 localStorage에 체크포인트로
 * 저장해서, Claude 호출이 중간에 실패하거나 프로그램/브라우저가 갑자기 닫혀도
 * 처음부터 다시 하지 않고 마지막 성공 단계부터 이어서 진행할 수 있게 한다.
 *
 * (참고: 이 프로그램은 브라우저 안에서만 동작하므로 round1.json처럼 실제 파일로
 * 저장하지는 않는다 — 매번 파일 저장 대화상자가 뜨면 오히려 불편하다. 대신
 * localStorage에 라운드별 원문(roundTexts)을 그대로 저장해 같은 역할을 한다.
 * 이 파일이 그 저장/복원을 전담한다.)
 *
 * 추가로 이 파일은:
 *   - 네트워크 재시도 / 품질 가드레일 재시도 기록(retryLog)을 별도 키에 남긴다.
 *   - 사용자의 "보고서 보완 요청"으로 보고서가 바뀔 때마다 이전 버전을
 *     reportHistory에 보존해서 나중에 되돌릴 수 있게 한다.
 */

const MEETING_PROGRESS_KEY = 'strategy-room-meeting-progress';
const MEETING_RETRY_LOG_KEY = 'strategy-room-meeting-retry-log';

const MeetingProgress = {
  save(obj) {
    try {
      localStorage.setItem(MEETING_PROGRESS_KEY, JSON.stringify({ ...obj, updatedAt: Date.now() }));
    } catch (e) {
      /* 저장 공간 부족 등은 무시 — 체크포인트 실패가 회의 자체를 막아서는 안 된다 */
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(MEETING_PROGRESS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  clear() {
    try { localStorage.removeItem(MEETING_PROGRESS_KEY); } catch (e) { /* 무시 */ }
  },

  /** 라운드 하나가 성공(또는 실패로 일시중단)할 때마다 호출하는 체크포인트 저장 */
  saveCheckpoint({ topic, attachedText, hasAttachment, context, transcript, roundTexts, status, pausedAtRound, pausedReason, pausedMessage }) {
    const existing = this.load();
    const carry = existing && existing.topic === topic ? existing : {};
    const reportHistory = Array.isArray(carry.reportHistory) ? carry.reportHistory : [];
    this.save({
      topic,
      attachedText: attachedText || '',
      hasAttachment: !!hasAttachment,
      context,
      transcript,
      roundTexts,
      reportHistory,
      memoryId: carry.memoryId || null, // 이 회의가 저장한 "과거 회의 기억" 레코드 id
      status, // 'in-progress' | 'paused'
      pausedAtRound: pausedAtRound || null,
      pausedReason: pausedReason || null, // 'network' | 'quality'
      pausedMessage: pausedMessage || null
    });
  },

  /** 최종 보고서까지 완성됐을 때만 완료 상태로 바꾼다 */
  markDone({ topic, attachedText, hasAttachment, report, transcript }) {
    const existing = this.load();
    const carry = existing && existing.topic === topic ? existing : {};
    const reportHistory = Array.isArray(carry.reportHistory) ? carry.reportHistory : [];
    this.save({
      topic,
      attachedText: attachedText || '',
      hasAttachment: !!hasAttachment,
      report,
      transcript,
      reportHistory,
      memoryId: carry.memoryId || null,
      status: 'done',
      pausedAtRound: null,
      pausedReason: null,
      pausedMessage: null
    });
  },

  /** 이 회의가 "과거 회의 기억"에 저장된 레코드 id를 연결해둔다(보완 시 같은 레코드를 갱신하기 위함) */
  setMemoryId(topic, memoryId) {
    const p = this.load();
    if (!p || p.topic !== topic) return;
    this.save({ ...p, memoryId });
  },

  /** 지금 입력된 주제와 정확히 일치하는, 아직 안 끝난(이어서 진행 가능한) 진행상태가 있는지 */
  findResumable(topic) {
    const p = this.load();
    if (!p || !topic) return null;
    if (p.topic !== topic) return null;
    if (p.status !== 'paused' && p.status !== 'in-progress') return null;
    return p;
  },

  /* ---------- 보고서 보완(코멘트) 버전 기록 ---------- */

  /** 보완 전 보고서를 이력에 남기고, 새 보고서로 교체한다 */
  replaceReportWithHistory(topic, newReport, comment) {
    const p = this.load();
    if (!p || p.topic !== topic) return;
    const history = Array.isArray(p.reportHistory) ? p.reportHistory.slice() : [];
    history.push({ report: p.report, comment: comment || '', at: Date.now() });
    this.save({ ...p, report: newReport, reportHistory: history });
  },

  getReportHistory(topic) {
    const p = this.load();
    if (!p || p.topic !== topic) return [];
    return Array.isArray(p.reportHistory) ? p.reportHistory : [];
  },

  /* ---------- 재시도 로그 (네트워크 / 품질 구분) ---------- */

  pushRetryLog(entry) {
    try {
      const raw = localStorage.getItem(MEETING_RETRY_LOG_KEY);
      const log = raw ? JSON.parse(raw) : [];
      log.push({ ...entry, at: Date.now() });
      localStorage.setItem(MEETING_RETRY_LOG_KEY, JSON.stringify(log.slice(-50)));
    } catch (e) {
      /* 무시 */
    }
  },

  loadRetryLog() {
    try {
      const raw = localStorage.getItem(MEETING_RETRY_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  clearRetryLog() {
    try { localStorage.removeItem(MEETING_RETRY_LOG_KEY); } catch (e) { /* 무시 */ }
  }
};
