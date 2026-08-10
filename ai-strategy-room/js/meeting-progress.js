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
 */

const MEETING_PROGRESS_KEY = 'strategy-room-meeting-progress';

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
  saveCheckpoint({ topic, attachedText, hasAttachment, context, transcript, roundTexts, status, pausedAtRound, pausedMessage }) {
    this.save({
      topic,
      attachedText: attachedText || '',
      hasAttachment: !!hasAttachment,
      context,
      transcript,
      roundTexts,
      status, // 'in-progress' | 'paused'
      pausedAtRound: pausedAtRound || null,
      pausedMessage: pausedMessage || null
    });
  },

  /** 최종 보고서까지 완성됐을 때만 완료 상태로 바꾼다 (요구사항 8) */
  markDone({ topic, attachedText, hasAttachment, report, transcript }) {
    this.save({
      topic,
      attachedText: attachedText || '',
      hasAttachment: !!hasAttachment,
      report,
      transcript,
      status: 'done',
      pausedAtRound: null,
      pausedMessage: null
    });
  },

  /** 지금 입력된 주제와 정확히 일치하는, 아직 안 끝난(이어서 진행 가능한) 진행상태가 있는지 */
  findResumable(topic) {
    const p = this.load();
    if (!p || !topic) return null;
    if (p.topic !== topic) return null;
    if (p.status !== 'paused' && p.status !== 'in-progress') return null;
    return p;
  }
};
