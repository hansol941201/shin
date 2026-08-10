/**
 * meeting-memory.js
 * CrewAI의 Memory 개념(memory/unified_memory.py의 Memory, memory/recall_flow.py의
 * RecallFlow)에서 "과거 결과를 가볍게 회상해서 새 작업에 참고할 수 있게 한다"는
 * 아이디어만 가져와 이 프로그램에 맞게 아주 단순하게 재구현한 것이다.
 *
 * CrewAI 원본은 벡터DB(LanceDB/Qdrant) + 임베딩 + LLM 분석 파이프라인으로
 * 정교하게 회상하지만, 이 프로그램은 Python/DB/외부 서버를 쓸 수 없으므로
 * 그 대신:
 *   - 저장: 회의가 "완료"됐을 때만, 아주 가벼운 요약 정보만 localStorage에 저장
 *     (전체 내부 회의 로그·첨부파일 원문은 저장하지 않는다)
 *   - 회상: 임베딩 없이 순수 JS 키워드 겹침 비율로 "비슷한 과거 회의"를 찾는다
 *   - 주입: 절대 자동으로 강제 주입하지 않는다 — 사용자가 [이번 회의에 참고]를
 *     직접 눌러야만 새 회의의 컨텍스트에 "참고용 배경 정보"로 포함된다
 *     (CrewAI에는 없는, 이 프로그램만의 안전장치 — 과거의 잘못된 결론이 새
 *     회의를 자동으로 편향시키지 않게 하기 위함)
 */

const MEETING_MEMORY_KEY = 'strategy-room-meeting-memory';
const MEETING_MEMORY_MAX = 50; // 오래된 기록은 자동으로 정리(가장 오래된 것부터 삭제)

const MeetingMemory = {
  list() {
    try {
      const raw = localStorage.getItem(MEETING_MEMORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  get(id) {
    return this.list().find((r) => r.id === id) || null;
  },

  _saveAll(list) {
    try {
      localStorage.setItem(MEETING_MEMORY_KEY, JSON.stringify(list.slice(-MEETING_MEMORY_MAX)));
    } catch (e) {
      /* 저장 공간 부족 등은 무시 — 기억 저장 실패가 회의 자체를 막아서는 안 된다 */
    }
  },

  /**
   * 회의가 정상 완료됐을 때 딱 한 번 호출한다. 다음 정보만 저장한다:
   * 날짜, 제목, 주제, 결론 요약, 핵심 실행안, 주요 리스크, 최종 보고서.
   * 첨부자료 원문(attachedText)은 절대 저장하지 않는다.
   */
  create({ topic, report, hasAttachment }) {
    const list = this.list();
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const summary = this.extractSummary(report);
    const record = {
      id,
      createdAt: Date.now(),
      title: this._makeTitle(topic),
      topic,
      conclusionSummary: summary.conclusionSummary,
      keyActions: summary.keyActions,
      keyRisks: summary.keyRisks,
      finalReport: report,
      hasAttachment: !!hasAttachment,
      wasRefinedByUser: false
    };
    list.push(record);
    this._saveAll(list);
    return id;
  },

  /** 사용자가 [보고서 보완]으로 결과를 바꾸면 같은 기록을 갱신한다(중복 생성 방지) */
  updateAfterRefine(id, { report }) {
    const list = this.list();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const summary = this.extractSummary(report);
    list[idx] = {
      ...list[idx],
      finalReport: report,
      conclusionSummary: summary.conclusionSummary,
      keyActions: summary.keyActions,
      keyRisks: summary.keyRisks,
      wasRefinedByUser: true
    };
    this._saveAll(list);
  },

  remove(id) {
    this._saveAll(this.list().filter((r) => r.id !== id));
  },

  clearAll() {
    try { localStorage.removeItem(MEETING_MEMORY_KEY); } catch (e) { /* 무시 */ }
  },

  /**
   * 순수 키워드 겹침 기반의 아주 단순한 유사도 비교(임베딩·외부 API 없음).
   * CrewAI의 RecallFlow처럼 정교하지는 않지만, 별도 서버/모델 없이 동작한다.
   */
  findSimilar(topic, excludeId, limit) {
    const words = this._tokenize(topic);
    if (!words.length) return [];
    const scored = this.list()
      .filter((r) => r.id !== excludeId)
      .map((r) => ({ record: r, score: this._similarity(words, this._tokenize(r.topic)) }))
      .filter((s) => s.score >= 0.15)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 5).map((s) => s.record);
  },

  _tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  },

  _similarity(wordsA, wordsB) {
    if (!wordsA.length || !wordsB.length) return 0;
    const setB = new Set(wordsB);
    const overlap = wordsA.filter((w) => setB.has(w)).length;
    return overlap / Math.max(wordsA.length, wordsB.length);
  },

  _makeTitle(topic) {
    const t = String(topic || '').trim().replace(/\s+/g, ' ');
    return t.length > 32 ? t.slice(0, 32) + '…' : t || '(제목 없음)';
  },

  /**
   * 최종 보고서에서 결론 요약/핵심 실행안/주요 리스크를 뽑아낸다.
   * 추가 Claude 호출 없이(호출 횟수에 영향 없음) 순수 텍스트 규칙으로만
   * 추출하는 최선의 노력(best-effort) 방식이다 — 완벽한 요약이 아니라
   * "과거에 이런 회의가 있었다"를 빠르게 떠올리기 위한 미리보기용이다.
   * 보고서 소제목 문구는 매번 달라지므로(REPORT_STYLE_GUIDE 참고) 정확한
   * 헤딩 이름이 아니라 헤딩에 포함된 키워드로 섹션을 찾는다.
   */
  extractSummary(report) {
    const t = String(report || '');
    const sections = this._splitSections(t);

    const actionSection = sections.find((s) => /실행|방법|절차|전략|계획/.test(s.heading));
    const riskSection = sections.find((s) => /리스크|위험|한계|우려/.test(s.heading));

    const keyActions = actionSection ? this._preview(actionSection.body, 260) : '';
    let keyRisks = riskSection ? this._preview(riskSection.body, 200) : '';
    if (!keyRisks) {
      keyRisks = this._findRiskSentence(t);
    }

    const firstSection = sections[0];
    const conclusionSummary = this._preview(firstSection ? firstSection.body : t, 220);

    return { conclusionSummary, keyActions, keyRisks };
  },

  _splitSections(text) {
    const lines = String(text || '').split('\n');
    const sections = [];
    let current = null;
    for (const line of lines) {
      const m = line.match(/^##\s+(.+)$/);
      if (m) {
        current = { heading: m[1].trim(), body: '' };
        sections.push(current);
        continue;
      }
      if (current) current.body += (current.body ? '\n' : '') + line;
    }
    return sections;
  },

  _findRiskSentence(text) {
    const paragraphs = String(text || '').split(/\n\s*\n/);
    const hit = paragraphs.find((p) => /(리스크|위험|우려|한계)/.test(p));
    return hit ? this._preview(hit, 180) : '';
  },

  _preview(text, maxLen) {
    const t = String(text || '').replace(/^##\s+.+$/gm, '').trim();
    if (!t) return '';
    return t.length > maxLen ? t.slice(0, maxLen).trim() + '…' : t;
  }
};
