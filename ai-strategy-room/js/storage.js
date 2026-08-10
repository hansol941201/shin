/**
 * storage.js
 * 브라우저 localStorage에 "최근 입력 주제"와 "최근 결과 보고서"만 저장한다.
 * API 키 등 민감한 값은 이 프로그램 어디에도 존재하지 않는다(Claude Code CLI 연결만 사용).
 */
const STORAGE_KEYS = {
  TOPIC: 'strategy-room-last-topic',
  REPORT: 'strategy-room-last-report',
  MEETING_LOG: 'strategy-room-last-log',
  WAS_EXAMPLE: 'strategy-room-last-was-example'
};

const Storage = {
  saveTopic(topic) {
    try { localStorage.setItem(STORAGE_KEYS.TOPIC, topic || ''); } catch (e) { /* 저장 공간 부족 등은 무시 */ }
  },
  loadTopic() {
    try { return localStorage.getItem(STORAGE_KEYS.TOPIC) || ''; } catch (e) { return ''; }
  },
  saveReport(reportText) {
    try { localStorage.setItem(STORAGE_KEYS.REPORT, reportText || ''); } catch (e) { /* 무시 */ }
  },
  loadReport() {
    try { return localStorage.getItem(STORAGE_KEYS.REPORT) || ''; } catch (e) { return ''; }
  },
  saveMeetingLog(logHtml) {
    try { localStorage.setItem(STORAGE_KEYS.MEETING_LOG, logHtml || ''); } catch (e) { /* 무시 */ }
  },
  loadMeetingLog() {
    try { return localStorage.getItem(STORAGE_KEYS.MEETING_LOG) || ''; } catch (e) { return ''; }
  },
  saveWasExample(flag) {
    try { localStorage.setItem(STORAGE_KEYS.WAS_EXAMPLE, flag ? '1' : '0'); } catch (e) { /* 무시 */ }
  },
  loadWasExample() {
    try { return localStorage.getItem(STORAGE_KEYS.WAS_EXAMPLE) || '0'; } catch (e) { return '0'; }
  },
  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.TOPIC);
      localStorage.removeItem(STORAGE_KEYS.REPORT);
      localStorage.removeItem(STORAGE_KEYS.MEETING_LOG);
      localStorage.removeItem(STORAGE_KEYS.WAS_EXAMPLE);
    } catch (e) { /* 무시 */ }
  }
};
