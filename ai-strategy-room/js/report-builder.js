/**
 * report-builder.js
 * 회의 결과(각 라운드 산출물)를 받아 "한 명이 처음부터 자연스럽게 쓴 것 같은"
 * 최종 보고서로 조립한다. "A의 의견 / 토론결과 / AI 분석" 같은 인위적 섹션은
 * 절대 만들지 않는다 — meeting-engine.js가 이미 그런 섹션을 만들지 않도록
 * 최종 통합 프롬프트를 구성하고, 여기서는 텍스트 후처리만 담당한다.
 */

const ReportBuilder = {
  /**
   * 아주 단순한 마크다운(## 제목, 빈 줄 구분 문단)만 지원하는 최소 렌더러.
   * 외부 라이브러리 없이 안전하게 이스케이프한 뒤 변환한다.
   */
  renderToHtml(reportText) {
    const escape = (s) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const blocks = reportText.split(/\n{2,}/);
    return blocks
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('## ')) {
          return `<h3>${escape(trimmed.slice(3).trim())}</h3>`;
        }
        if (trimmed.startsWith('# ')) {
          return `<h2>${escape(trimmed.slice(2).trim())}</h2>`;
        }
        const escaped = escape(trimmed).replace(/\n/g, '<br>');
        return `<p>${escaped}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  },

  /** TXT 저장용 — 마크다운 기호(## )를 제거하고 사람이 읽기 좋은 평문으로 변환 */
  toPlainText(reportText) {
    return reportText.replace(/^##?\s*/gm, '').trim();
  }
};
