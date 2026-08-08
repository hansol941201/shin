/**
 * storage.js
 * 브라우저 localStorage에 "최근 입력 주제"와 "최근 결과 보고서"만 저장한다.
 * API 키 등 민감한 값은 이 파일에서 다루지 않는다 (ai-provider.js에서 별도 관리).
 */
const STORAGE_KEYS = {
  TOPIC: 'strategy-room-last-topic',
  REPORT: 'strategy-room-last-report',
  MEETING_LOG: 'strategy-room-last-log'
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
  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.TOPIC);
      localStorage.removeItem(STORAGE_KEYS.REPORT);
      localStorage.removeItem(STORAGE_KEYS.MEETING_LOG);
    } catch (e) { /* 무시 */ }
  }
};
