/**
 * report-builder.js
 * 회의 결과(각 라운드 산출물)를 받아 "한 명이 처음부터 자연스럽게 쓴 것 같은"
 * 최종 보고서로 조립한다. "A의 의견 / 토론결과 / AI 분석" 같은 인위적 섹션은
 * 절대 만들지 않는다 — meeting-engine.js가 이미 그런 섹션을 만들지 않도록
 * 최종 통합 프롬프트를 구성하고, 여기서는 텍스트 후처리만 담당한다.
 *
 * [우리 팀 실행 방향] = "30초 요약":
 * 최종 보고서 텍스트는 이제 두 부분으로 구성된다 — 맨 위 "## 우리 팀 실행 방향"
 * (제목 고정, meeting-engine.js가 항상 이 문구로 쓰도록 지시함) + 그 아래 기존
 * 상세 분석 보고서. 하나의 markdown 문자열 안에 이어져 있으므로 저장/기억/버전
 * 이력(Storage, MeetingMemory, MeetingProgress.reportHistory)은 기존 그대로
 * 문자열 하나로 다루면 되고, 여기 렌더링 단계에서만 그 앞부분을 분리한다.
 *
 * 요약 안의 7개 하위 섹션(그래서 결론은? / 우리가 준비할 것 / 이렇게 하면 됨 /
 * 지금 당장 할 일 / 누가 뭘 하지? / 하지 말아야 할 것 / 성공했는지 어떻게
 * 알지?)은 "10대가 읽어도 30초 안에 뭘 해야 하는지 아는" 화면을 목표로,
 * 전문용어 없는 쉬운 말로만 작성하도록 프롬프트에서 강제한다. 원래의 깊이
 * 있는 상세 분석(전문용어·데이터·근거·반박 포함)은 그 아래 [상세 분석 보기]
 * 안에 그대로 접혀 들어간다 — 내용은 하나도 지우지 않고, 클릭하면 전부
 * 펼쳐진다. "## 우리 팀 실행 방향" 제목이 없는(과거에 저장된) 보고서는
 * 지금까지처럼 renderToHtml 하나로만 렌더링된다(하위 호환).
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

  /** "①/②/…" 같은 원문자 번호를 뗀다 */
  _stripStepNumber(s) {
    return String(s || '')
      .trim()
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim();
  },

  /**
   * "① 준비 → ② 확인 → ③ 확대"처럼 화살표(→/↓)나 줄바꿈으로 이어진 단계
   * 체인을 순서대로 뽑는다. [3. 이렇게 하면 됨] / [7. 성공했는지 어떻게 알지?]
   * 두 섹션 모두 이 하나의 파서로 처리한다(가로 흐름이냐 세로 깔때기냐는
   * 렌더링 단계에서만 다르게 그린다).
   */
  _extractChainSteps(body) {
    const t = String(body || '').trim();
    if (!t) return [];
    const raw = t
      .split(/→|↓/)
      .flatMap((s) => s.split('\n'))
      .map((s) => this._stripStepNumber(s))
      .filter(Boolean);
    return raw;
  },

  _cardBullets(title, body, escape, variant) {
    const items = this._extractListLines(body);
    if (!items.length) return '';
    const cls = variant ? ` action-plan-card--${variant}` : '';
    const listCls = variant === 'warn' ? ' action-plan-list--x' : '';
    return (
      `<div class="action-plan-card${cls}"><h4>${escape(title)}</h4><ul class="action-plan-list${listCls}">` +
      items.map((i) => `<li>${escape(i)}</li>`).join('') +
      `</ul></div>`
    );
  },

  /** [6. 하지 말아야 할 것] 전용 — "X 항목" 표시를 우선 인식하고, 없으면 일반 목록으로 대체 */
  _cardDontDo(title, body, escape) {
    const lines = String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
    let items = lines.filter((l) => /^[Xx✕✗]\s+/.test(l)).map((l) => l.replace(/^[Xx✕✗]\s+/, ''));
    if (!items.length) items = this._extractListLines(body);
    if (!items.length) return '';
    return (
      `<div class="action-plan-card action-plan-card--warn"><h4>${escape(title)}</h4><ul class="action-plan-list action-plan-list--x">` +
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

  /** [3. 이렇게 하면 됨] — 가로로 이어지는 화살표 흐름 */
  _cardFlow(title, body, escape) {
    const steps = this._extractChainSteps(body);
    if (!steps.length) return '';
    const chips = steps
      .map((s, i) => `<span class="flow-step"><span class="flow-num">${i + 1}</span>${escape(s)}</span>`)
      .join('<span class="flow-arrow">→</span>');
    return `<div class="action-plan-card"><h4>${escape(title)}</h4><div class="action-plan-flow">${chips}</div></div>`;
  },

  /** [7. 성공했는지 어떻게 알지?] — 세로로 내려가는 깔때기 흐름 */
  _cardFunnel(title, body, escape) {
    const steps = this._extractChainSteps(body);
    if (!steps.length) return '';
    const rows = steps
      .map((s) => `<div class="funnel-step">${escape(s)}</div>`)
      .join('<div class="funnel-arrow">↓</div>');
    return `<div class="action-plan-card"><h4>${escape(title)}</h4><div class="action-plan-funnel">${rows}</div></div>`;
  },

  /**
   * "[우리 팀 실행 방향]" 블록 하나를 "10대가 30초 안에 읽고 뭘 할지 아는"
   * 카드 UI로 렌더링한다. 7개 하위 섹션 각각을 목적에 맞는 형태(결론 배너 /
   * 표 / 화살표 흐름 / 체크리스트 / X 목록 / 깔때기)로 그린다.
   */
  renderActionPlanHtml(actionPlanText) {
    const escape = this._escape;
    const subs = this._splitSubHeadings(actionPlanText);

    const conclusion = this._findSub(subs, /결론/);
    const prepare = this._findSub(subs, /준비할\s*것|준비해야|준비물/);
    const flow = this._findSub(subs, /이렇게\s*하면\s*됨|실행\s*순서/);
    const today = this._findSub(subs, /지금\s*당장/);
    const roles = this._findSub(subs, /누가\s*뭘\s*하지|역할\s*분담/);
    const dontDo = this._findSub(subs, /하지\s*말아야/);
    const success = this._findSub(subs, /성공했는지|효과\s*확인/);

    const parts = [];
    parts.push('<div class="action-plan"><div class="action-plan-badge">30초 요약</div>');
    if (conclusion && conclusion.body) {
      parts.push(
        `<div class="action-plan-conclusion"><span class="action-plan-conclusion-label">그래서 결론은?</span>` +
          `<p>${escape(conclusion.body).replace(/\n/g, '<br>')}</p></div>`
      );
    }
    if (prepare) parts.push(this._cardTable('우리가 준비할 것', prepare.body, escape));
    if (flow) parts.push(this._cardFlow('이렇게 하면 됨', flow.body, escape));
    if (today) parts.push(this._cardChecklist('지금 당장 할 일', today.body, escape));
    if (roles) parts.push(this._cardTable('누가 뭘 하지?', roles.body, escape));
    if (dontDo) parts.push(this._cardDontDo('하지 말아야 할 것', dontDo.body, escape));
    if (success) parts.push(this._cardFunnel('성공했는지 어떻게 알지?', success.body, escape));
    parts.push('</div>');
    return parts.join('\n');
  },

  /**
   * 최종 결과 화면에 실제로 사용하는 렌더 함수.
   * [우리 팀 실행 방향]이 있으면 "30초 요약" 카드 UI를 맨 위에 펼쳐서 보여주고,
   * 기존의 긴 상세 분석 보고서는 [상세 분석 보기] 안에 그대로 접어 넣는다(내용
   * 손실 없음 — 클릭하면 전부 펼쳐진다). 없으면(과거 형식 보고서) 지금까지와
   * 동일하게 전체를 renderToHtml로만 렌더링한다.
   */
  renderFullReport(reportText) {
    const { actionPlan, rest } = this.splitActionPlan(reportText);
    if (!actionPlan) return this.renderToHtml(reportText);
    const detailHtml = this.renderToHtml(rest);
    return (
      this.renderActionPlanHtml(actionPlan) +
      `\n<details class="detail-report-toggle"><summary>상세 분석 보기</summary><div class="detail-report-body">${detailHtml}</div></details>`
    );
  }
};
