/**
 * report-builder.js
 * 회의 결과(각 라운드 산출물)를 받아 "한 명이 처음부터 자연스럽게 쓴 것 같은"
 * 최종 보고서로 조립한다. "A의 의견 / 토론결과 / AI 분석" 같은 인위적 섹션은
 * 절대 만들지 않는다 — meeting-engine.js가 이미 그런 섹션을 만들지 않도록
 * 최종 통합 프롬프트를 구성하고, 여기서는 텍스트 후처리만 담당한다.
 *
 * [우리 팀 실행 방향]:
 * 최종 보고서 텍스트는 이제 두 부분으로 구성된다 — 맨 위 "## 우리 팀 실행 방향"
 * (제목 고정, meeting-engine.js가 항상 이 문구로 쓰도록 지시함) + 그 아래 기존
 * 상세 분석 보고서. 하나의 markdown 문자열 안에 이어져 있으므로 저장/기억/버전
 * 이력(Storage, MeetingMemory, MeetingProgress.reportHistory)은 기존 그대로
 * 문자열 하나로 다루면 되고, 여기 렌더링 단계에서만 그 앞부분을 분리해 카드/표/
 * 체크리스트 형태로 특별히 그려준다. "## 우리 팀 실행 방향" 제목이 없는(과거에
 * 저장된) 보고서는 지금까지처럼 renderToHtml 하나로만 렌더링된다(하위 호환).
 */

const ReportBuilder = {
  _escape(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /**
   * 아주 단순한 마크다운(## 제목, 빈 줄 구분 문단)만 지원하는 최소 렌더러.
   * 외부 라이브러리 없이 안전하게 이스케이프한 뒤 변환한다.
   */
  renderToHtml(reportText) {
    const escape = this._escape;
    const blocks = String(reportText || '').split(/\n{2,}/);
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
    return String(reportText || '').replace(/^##?\s*/gm, '').trim();
  },

  /**
   * 텍스트를 최상위 "## " 헤딩(### 이상은 제외) 기준으로 블록 나눈다.
   * 헤딩이 하나도 없으면 전체를 title:null 블록 하나로 반환한다.
   */
  _splitTopHeadings(text) {
    const t = String(text || '');
    const re = /^##(?!#)\s+(.+)$/gm;
    const marks = [];
    let m;
    while ((m = re.exec(t))) {
      marks.push({ index: m.index, title: m[1].trim() });
    }
    if (!marks.length) return [{ title: null, raw: t.trim() }];
    const blocks = [];
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index;
      const end = i + 1 < marks.length ? marks[i + 1].index : t.length;
      blocks.push({ title: marks[i].title, raw: t.slice(start, end).trim() });
    }
    return blocks;
  },

  /**
   * 보고서 전체 텍스트에서 "[우리 팀 실행 방향]" 블록만 분리한다.
   * 반환: { actionPlan: string|null, rest: string }
   * 없으면(과거 형식 보고서) actionPlan은 null, rest는 원문 전체.
   */
  splitActionPlan(reportText) {
    const blocks = this._splitTopHeadings(reportText);
    const idx = blocks.findIndex((b) => b.title && /우리\s*팀\s*실행\s*방향/.test(b.title));
    if (idx === -1) return { actionPlan: null, rest: String(reportText || '').trim() };
    const actionPlan = blocks[idx].raw;
    const rest = blocks
      .filter((_, i) => i !== idx)
      .map((b) => b.raw)
      .join('\n\n');
    return { actionPlan, rest };
  },

  /** action plan 블록 안에서 "### N. 제목" 하위 섹션들을 나눈다 */
  _splitSubHeadings(actionPlanText) {
    const withoutTitle = String(actionPlanText || '').replace(/^##(?!#)\s+.+$/m, '').trim();
    const re = /^###\s+(.+)$/gm;
    const marks = [];
    let m;
    while ((m = re.exec(withoutTitle))) {
      marks.push({ index: m.index, title: m[1].trim() });
    }
    const subs = [];
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index;
      const end = i + 1 < marks.length ? marks[i + 1].index : withoutTitle.length;
      const raw = withoutTitle.slice(start, end);
      const body = raw.replace(/^###\s+.+$/m, '').trim();
      subs.push({ title: marks[i].title, body });
    }
    return subs;
  },

  /** "- 항목" 또는 "1. 항목" 목록 줄만 뽑아낸다. 못 찾으면 문단을 그대로 항목 하나로 취급한다. */
  _extractListLines(body) {
    const lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const items = lines
      .filter((l) => /^[-*•]\s+/.test(l) || /^\d+[.)]\s+/.test(l))
      .map((l) => l.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''));
    if (items.length) return items;
    const t = String(body || '').trim();
    return t ? [t] : [];
  },

  /** "□ 항목" 체크리스트 줄만 뽑아낸다(□가 없으면 일반 목록으로 대체) */
  _extractChecklistLines(body) {
    const lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const items = lines.filter((l) => /^[□☐]\s*/.test(l)).map((l) => l.replace(/^[□☐]\s*/, ''));
    if (items.length) return items;
    return this._extractListLines(body);
  },

  /** "| a | b | c |" 형태의 markdown 표를 { headers, rows }로 파싱한다. 표가 없으면 null. */
  _extractTable(body) {
    const lines = String(body || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('|'));
    if (lines.length < 2) return null;
    const splitRow = (line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    const isSeparator = (cells) => cells.every((c) => /^:?-{2,}:?$/.test(c));
    const headers = splitRow(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitRow(lines[i]);
      if (isSeparator(cells)) continue;
      rows.push(cells);
    }
    return rows.length ? { headers, rows } : null;
  },

  _findSub(subs, re) {
    return subs.find((s) => re.test(s.title));
  },

  _cardBullets(title, body, escape, variant) {
    const items = this._extractListLines(body);
    if (!items.length) return '';
    const cls = variant ? ` action-plan-card--${variant}` : '';
    return (
      `<div class="action-plan-card${cls}"><h4>${escape(title)}</h4><ul class="action-plan-list">` +
      items.map((i) => `<li>${escape(i)}</li>`).join('') +
      `</ul></div>`
    );
  },

  _cardChecklist(title, body, escape) {
    const items = this._extractChecklistLines(body);
    if (!items.length) return '';
    return (
      `<div class="action-plan-card"><h4>${escape(title)}</h4><ul class="action-plan-checklist">` +
      items.map((i) => `<li><span class="chk">□</span>${escape(i)}</li>`).join('') +
      `</ul></div>`
    );
  },

  _cardTable(title, body, escape) {
    const table = this._extractTable(body);
    if (!table) {
      // 표 형식을 못 지켰을 때도 내용 자체는 잃지 않도록 문단으로라도 보여준다
      const t = String(body || '').trim();
      if (!t) return '';
      return `<div class="action-plan-card"><h4>${escape(title)}</h4><p>${escape(t).replace(/\n/g, '<br>')}</p></div>`;
    }
    const thead = `<tr>${table.headers.map((h) => `<th>${escape(h)}</th>`).join('')}</tr>`;
    const tbody = table.rows
      .map((row) => `<tr>${row.map((c) => `<td>${escape(c)}</td>`).join('')}</tr>`)
      .join('');
    return (
      `<div class="action-plan-card"><h4>${escape(title)}</h4>` +
      `<div class="action-plan-table-wrap"><table class="action-plan-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div></div>`
    );
  },

  /** "[우리 팀 실행 방향]" 블록 하나를 카드/표/체크리스트 UI로 렌더링한다 */
  renderActionPlanHtml(actionPlanText) {
    const escape = this._escape;
    const subs = this._splitSubHeadings(actionPlanText);

    const conclusion = this._findSub(subs, /결론/);
    const prepare = this._findSub(subs, /준비해야|준비물/);
    const order = this._findSub(subs, /실행\s*순서/);
    const roles = this._findSub(subs, /역할\s*분담/);
    const today = this._findSub(subs, /지금\s*당장/);
    const readyCriteria = this._findSub(subs, /준비\s*완료\s*기준/);
    const dontDo = this._findSub(subs, /하지\s*말아야/);
    const measure = this._findSub(subs, /효과\s*확인/);

    const parts = [];
    parts.push('<div class="action-plan"><div class="action-plan-badge">우리 팀 실행 방향</div>');
    if (conclusion && conclusion.body) {
      parts.push(`<p class="action-plan-conclusion">${escape(conclusion.body).replace(/\n/g, '<br>')}</p>`);
    }
    if (prepare) parts.push(this._cardBullets('우리가 준비해야 할 것', prepare.body, escape));
    if (order) parts.push(this._cardBullets('실행 순서', order.body, escape));
    if (roles) parts.push(this._cardTable('역할 분담', roles.body, escape));
    if (today) parts.push(this._cardChecklist('지금 당장 할 일', today.body, escape));
    if (readyCriteria) parts.push(this._cardChecklist('준비 완료 기준', readyCriteria.body, escape));
    if (dontDo) parts.push(this._cardBullets('하지 말아야 할 것', dontDo.body, escape, 'warn'));
    if (measure) parts.push(this._cardBullets('효과 확인 방법', measure.body, escape));
    parts.push('</div>');
    return parts.join('\n');
  },

  /**
   * 최종 결과 화면에 실제로 사용하는 렌더 함수.
   * [우리 팀 실행 방향]이 있으면 그 부분을 카드 UI로 맨 위에, 그 아래 상세
   * 보고서를 기존 renderToHtml로 이어서 그린다. 없으면(과거 형식 보고서)
   * 지금까지와 동일하게 전체를 renderToHtml로만 렌더링한다.
   */
  renderFullReport(reportText) {
    const { actionPlan, rest } = this.splitActionPlan(reportText);
    if (!actionPlan) return this.renderToHtml(reportText);
    return this.renderActionPlanHtml(actionPlan) + '\n' + this.renderToHtml(rest);
  }
};
