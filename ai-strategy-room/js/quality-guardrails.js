/**
 * quality-guardrails.js
 * 각 라운드 응답이 "형식만 갖췄는지"가 아니라 "그 라운드가 실제로 해야 할 일을
 * 해냈는지"를 프로그램이 직접 점검한다(순수 텍스트/정규식 검사 — Claude를
 * 추가로 호출하지 않으므로 정상적인 경우 호출 횟수에는 영향이 없다).
 *
 * 실패하면 사람이 읽을 수 있는 실패 사유 목록(failures)을 돌려주고,
 * meeting-engine.js가 이걸 그대로 Claude에게 "여기가 부족했다"는 피드백으로
 * 넘겨서 재작성을 요청한다.
 */

const QualityGuardrails = {
  /* ---------- 공통 유틸 ---------- */
  _countMatches(text, re) {
    const m = String(text || '').match(re);
    return m ? m.length : 0;
  },

  /** "약 30% 증가", "50% 향상 예상"처럼 계획/예시 문맥 없이 단정하는 효과 수치를 찾는다 */
  _findFabricatedNumbers(text) {
    const results = [];
    const re = /\d+(?:\.\d+)?%\s*(?:증가|향상|개선|상승|절감|감소|단축)/g;
    let m;
    const t = String(text || '');
    while ((m = re.exec(t))) {
      const start = Math.max(0, m.index - 40);
      const around = t.slice(start, m.index + m[0].length + 15);
      if (!/(측정\s*계획|기준값|예상치|예시|가정|샘플|참고용|가상의)/.test(around)) {
        results.push(m[0]);
      }
    }
    return results;
  },

  /** 목록/번호매김 형태로 최소 몇 개의 항목이 나열되어 있는지 추정한다 */
  _countListItems(block) {
    const t = String(block || '');
    const numbered = t.match(/^\s*(?:\d+[.)]|대안\s*\d+|[①②③④⑤⑥])/gm) || [];
    if (numbered.length >= 2) return numbered.length;
    const bullets = t.match(/^\s*[-*•]/gm) || [];
    if (bullets.length >= 2) return bullets.length;
    const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim().length > 15);
    return paragraphs.length;
  },

  _section(text, headerRe) {
    const m = String(text || '').match(headerRe);
    return m ? m[1].trim() : '';
  },

  /* ================================================================
   * 1차 — 문제 분석 · 대상 판단 · 7인 1차 의견 · 초기 대안
   * ================================================================ */
  analyze(text) {
    const t = String(text || '');
    const failures = [];

    if (!/\[문제\s*분석\]/.test(t)) {
      failures.push('[문제 분석] 섹션이 없습니다.');
    } else {
      const problemBlock = this._section(t, /\[문제\s*분석\]([\s\S]*?)(?=\[대상\s*판단\]|\[전문가\s*1차\s*의견\]|$)/);
      if (!/(원인|가설|추론|INFERENCE)/i.test(problemBlock)) {
        failures.push('문제의 원인 분석(가설)이 보이지 않습니다 — 현상만 나열하고 원인 추론이 빠졌습니다.');
      }
    }

    if (!/\[대상\s*판단\]/.test(t)) {
      failures.push('[대상 판단] 섹션이 없습니다 — 실제 이해관계자가 누구인지 명시되지 않았습니다.');
    }

    const personaHeaders = t.match(/\*\*\[.+?\]\*\*/g) || [];
    if (personaHeaders.length < 5) {
      failures.push(`전문가별 1차 의견 구분이 부족합니다(소제목 ${personaHeaders.length}개 발견, 최소 5개 이상 필요).`);
    } else {
      const bodies = t.split(/\*\*\[.+?\]\*\*/g).slice(1);
      const fingerprints = new Set(bodies.map((b) => b.trim().slice(0, 40)));
      if (fingerprints.size < Math.max(2, Math.floor(bodies.length * 0.6))) {
        failures.push('여러 전문가의 의견이 서로 거의 동일하게 반복되고 있습니다 — 최소 2명 이상은 다른 방향을 제시해야 합니다.');
      }
    }

    const altBlock = this._section(t, /\[초기\s*대안\]([\s\S]*)$/);
    const altCount = this._countListItems(altBlock);
    if (altCount < 2) {
      failures.push(`초기 대안이 ${altCount}개만 확인됩니다 — 서로 다른 대안이 최소 2개 이상 필요합니다.`);
    }

    return { ok: failures.length === 0, failures };
  },

  /* ================================================================
   * 2차 — 상호 반박 및 대안 정리
   * ================================================================ */
  debate(text) {
    const t = String(text || '');
    const failures = [];
    const requiredHeaders = ['실제 이해관계자 관점', '내부 운영 현실성 관점', '외부 벤치마킹 관점', '대안 정리 결과'];
    const missing = requiredHeaders.filter((h) => !t.includes(h));
    if (missing.length) {
      failures.push(`다음 필수 섹션이 없습니다: ${missing.join(', ')}`);
    }

    const critiqueKeywords = /(문제|우려|부담|리스크|한계|부족|어렵|현실적이지|비판|반박|허점|보완|폐기|기각)/;
    const weakSections = [];
    ['실제 이해관계자 관점', '내부 운영 현실성 관점', '외부 벤치마킹 관점'].forEach((h) => {
      const re = new RegExp(`\\*\\*\\[${h}\\]\\*\\*([\\s\\S]*?)(?=\\*\\*\\[|$)`);
      const body = this._section(t, re);
      if (!body || body.length < 20 || !critiqueKeywords.test(body)) {
        weakSections.push(h);
      }
    });
    if (weakSections.length) {
      failures.push(`다음 관점에서 실제 반박 내용이 부족합니다(형식적인 동의만 있는 것으로 보임): ${weakSections.join(', ')}`);
    }

    const resultBody = this._section(t, /\*\*\[대안\s*정리\s*결과\]\*\*([\s\S]*)$/);
    if (!/(폐기|기각|제외|수정|재설계|변경)/.test(resultBody)) {
      failures.push('[대안 정리 결과]에 대안을 폐기하거나 수정했다는 내용이 없습니다 — 최소 하나의 기존 대안이 실제로 수정/폐기/재설계되어야 합니다.');
    }

    return { ok: failures.length === 0, failures };
  },

  /* ================================================================
   * 3차 — 전략·데이터 재설계
   * ================================================================ */
  redesign(text, hasAttachment) {
    const t = String(text || '');
    const failures = [];

    if (!t.includes('확정 실행안')) {
      failures.push('[확정 실행안] 섹션이 없습니다.');
    } else {
      const execBody = this._section(t, /\*\*\[확정\s*실행안\]\*\*([\s\S]*)$/) || t;
      if (!/(담당|주체|절차|단계|순서|누가|먼저|이후)/.test(execBody)) {
        failures.push('실행 주체나 절차(누가, 어떤 순서로)가 구체적으로 드러나지 않습니다.');
      }
    }

    if (!t.includes('데이터 검증')) {
      failures.push('[데이터 검증] 섹션이 없습니다.');
    } else {
      const dataBody = this._section(t, /\*\*\[데이터\s*검증\]\*\*([\s\S]*?)(?=\*\*\[|$)/);
      if (!/(측정|기준값|수집|지표|비교|계산식)/.test(dataBody)) {
        failures.push('측정 지표/계획이 구체적으로 제시되지 않았습니다(기준값→수집→기간→비교 등).');
      }
    }

    if (!hasAttachment) {
      const fabricated = this._findFabricatedNumbers(t);
      if (fabricated.length) {
        failures.push(`실제 데이터 없이 단정적인 효과 수치가 사용되었습니다: ${fabricated.slice(0, 3).join(', ')} (측정 계획으로 바꿔야 합니다)`);
      }
    }

    return { ok: failures.length === 0, failures };
  },

  /* ================================================================
   * 4차 — 최종 심사 판정 블록(STATUS/REASON/REQUIRED_FIXES) 자체 검증
   * (parsed는 meeting-engine.js의 _parseJudgeBlock 결과, reportBody는
   *  APPROVED일 때 블록 앞에 있어야 할 최종 보고서 본문)
   * ================================================================ */
  judgeBlock(parsed, reportBody) {
    const failures = [];
    if (!parsed) {
      failures.push('---JUDGE_RESULT--- 판정 블록을 찾을 수 없습니다. 반드시 지정된 형식으로 STATUS/REASON/REQUIRED_FIXES를 포함해 응답해야 합니다.');
      return { ok: false, failures };
    }
    if (parsed.status !== 'APPROVED' && parsed.status !== 'REVISE') {
      failures.push('STATUS 값이 APPROVED 또는 REVISE가 아닙니다.');
    }
    if (!parsed.reason || parsed.reason.length < 5) {
      failures.push('REASON(심사 근거/리스크 검토)이 비어있거나 너무 짧습니다.');
    }
    if (parsed.status === 'APPROVED' && (!reportBody || reportBody.trim().length < 200)) {
      failures.push('APPROVED 판정인데 판정 블록 앞에 최종 보고서 본문이 충분히 작성되지 않았습니다.');
    }
    return { ok: failures.length === 0, failures };
  },

  /* ================================================================
   * 최종 보고서 (4차 통과 시 본문 또는 5차/보완 결과 공통 검증)
   * ================================================================ */
  report(text, hasAttachment) {
    const t = String(text || '');
    const failures = [];

    const headingCount = this._countMatches(t, /^##\s+.+$/gm);
    if (headingCount < 3) {
      failures.push(`보고서 구조(## 소제목)가 ${headingCount}개뿐입니다 — 논리적 흐름을 담은 소제목이 최소 3개 이상 필요합니다.`);
    }

    if (/\*\*\[.+?\]\*\*/.test(t)) {
      failures.push('전문가 이름을 소제목처럼 그대로 나열한 회의록 형태로 보입니다 — 한 사람이 자연스럽게 쓴 보고서처럼 통합되어야 합니다.');
    }

    if (!/(담당|주체|절차|단계|순서|일정|기한)/.test(t)) {
      failures.push('실행 방법이 구체적이지 않습니다(담당 주체/절차/일정 등이 보이지 않음).');
    }

    if (!hasAttachment) {
      const fabricated = this._findFabricatedNumbers(t);
      if (fabricated.length) {
        failures.push(`근거 없는 수치가 포함되어 있습니다: ${fabricated.slice(0, 3).join(', ')}`);
      }
    }

    return { ok: failures.length === 0, failures };
  }
};
