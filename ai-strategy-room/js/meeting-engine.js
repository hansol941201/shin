/**
 * meeting-engine.js
 * 7명의 전문가가 "반박 → 수정 → 재검증"을 거쳐 하나의 완성된 보고서로
 * 수렴하는 내부 회의를 진행한다.
 *
 * 호출 횟수 최적화 (중요):
 * 원래는 전문가 한 명당 한 번씩, 총 10회의 claude 호출로 나눠서 진행했다.
 * 이 방식은 반박 구조가 정확한 대신, 회사에서 반복 사용하기에는 처리 시간과
 * Claude 구독 사용량이 커진다는 문제가 있었다. 그래서 "전문가 수를 줄이는" 게
 * 아니라 "한 번의 호출 안에 여러 전문가가 실제로 부딪히게" 프롬프트를 재설계해서
 * 호출 횟수를 4~5회로 줄였다. 7명의 역할과 서로 공격하는 구조 자체는 그대로다:
 *
 *   1차 호출 — 문제 분석 + 대상(실제 이해관계자) 판단 + 7명 전원의 1차 의견
 *              (형식적 동의 금지, 최소 2명은 서로 다른 방향 제시) + 초기 대안 생성
 *   2차 호출 — 실제 이해관계자·내부 운영·외부 벤치마킹 세 관점이 1차 대안들을
 *              서로 공격 → 약한 대안은 폐기, 살아남은 대안만 수정
 *   3차 호출 — 전략·혁신 전문가와 데이터 분석 전문가가 (서로 다른 기준으로
 *              긴장하며) 하나의 실행안으로 재설계 + 실행방법·성과측정 계획 확정
 *   4차 호출 — 최종 심사위원이 전체를 공격적으로 검증. 문제가 없으면 그 자리에서
 *              바로 완성된 최종 보고서까지 써서 돌려준다(→ 총 4회로 종료).
 *              보완이 필요하면 "REVISE"와 구체적 지시만 돌려준다.
 *   5차 호출 — (심사에서 REVISE가 나왔을 때만) 지시를 반영해 최종 보고서를 작성.
 *
 * - AI가 연결되어 있지 않으면 자동으로 데모 모드로 진행한다.
 * - AI 연결이 되어 있지만 호출이 실패하면(CORS, 로컬 서버 미실행 등) 데모 모드로
 *   안전하게 전환하고, 실패 사유를 사용자에게 보여줄 수 있도록 warning에 담는다.
 * - 자료(TXT/CSV 등)가 있으면 "근거분석 모드", 없으면 "전략회의 모드"로 자동
 *   판단한다 — 사용자가 모드를 직접 고르지 않는다.
 */

const MeetingEngine = {
  async run({ topic, attachedText, hasAttachment, onProgress }) {
    const emit = (roundId, status) => {
      if (typeof onProgress === 'function') onProgress(roundId, status);
    };

    if (!AiProvider.isConfigured()) {
      return this._runDemo({ topic, emit });
    }

    try {
      return await this._runLive({ topic, attachedText, hasAttachment, emit });
    } catch (err) {
      console.error('[MeetingEngine] 실AI 회의 실패, 데모로 전환:', err);
      const demoResult = await this._runDemo({ topic, emit });
      demoResult.warning =
        (err && err.message) || 'AI 연결에 실패해 데모 모드 결과로 대신 안내드립니다.';
      return demoResult;
    }
  },

  async _runDemo({ topic, emit }) {
    for (const round of MEETING_ROUNDS) {
      emit(round.id, 'active');
      await this._wait(450); // 실제 진행되는 느낌을 주기 위한 짧은 지연 (데모 전용)
      emit(round.id, 'done');
    }
    const scenario = DemoData.pickScenario(topic);
    return {
      mode: 'demo',
      report: scenario.report,
      log: scenario.log,
      warning: null
    };
  },

  /* ------------------------------------------------------------------ */
  /* 페르소나 텍스트를 하나의 시스템 프롬프트로 합치는 헬퍼                     */
  /* ------------------------------------------------------------------ */
  _personaBlock(byId, ids) {
    return ids
      .map((id) => byId[id])
      .filter(Boolean)
      .map((e) => `### ${e.name}\n${e.system}`)
      .join('\n\n');
  },

  /**
   * 모델 응답을 "**[이름]**" 또는 "## 이름" 같은 소제목 기준으로 나눠서
   * 내부 회의 로그(모달)에 전문가별로 보여준다. 모델이 형식을 안 지켜도
   * (섹션을 못 찾으면) 전체를 하나의 블록으로 fallback 처리해 항상 안전하다.
   */
  _splitSections(text) {
    if (!text) return [{ label: '내용', text: '' }];
    const lines = String(text).split('\n');
    const headerRe = /^\s*(?:\*\*\[(.+?)\]\*\*|\*\*(.+?)\*\*:?\s*$|##+\s*\[?(.+?)\]?\s*$|\[(.+?)\])\s*$/;
    const sections = [];
    let current = null;
    for (const line of lines) {
      const m = line.match(headerRe);
      if (m) {
        const label = (m[1] || m[2] || m[3] || m[4] || '').trim();
        if (label) {
          current = { label, text: '' };
          sections.push(current);
          continue;
        }
      }
      if (current) {
        current.text += (current.text ? '\n' : '') + line;
      }
    }
    const nonEmpty = sections.filter((s) => s.text.trim());
    if (nonEmpty.length >= 2) return nonEmpty.map((s) => ({ label: s.label, text: s.text.trim() }));
    return [{ label: '내용', text: text.trim() }];
  },

  async _runLive({ topic, attachedText, hasAttachment, emit }) {
    const mode = hasAttachment ? '근거분석 모드' : '전략회의 모드';
    const transcript = []; // 내부 회의 로그 (모달에서만 노출)
    let context = `[회의 모드] ${mode}\n[사용자가 입력한 주제]\n${topic}`;
    if (hasAttachment && attachedText) {
      context += `\n\n[첨부 자료에서 추출한 내용]\n${attachedText.slice(0, 6000)}`;
    }

    const byId = Object.fromEntries(EXPERTS.map((e) => [e.id, e]));
    const record = (roundLabel, text) => {
      const entries = this._splitSections(text).map((s) => ({ expert: s.label, text: s.text }));
      transcript.push({ round: roundLabel, entries });
      context += `\n\n[${roundLabel}]\n${text}`;
    };

    // ===== 1차 호출 — 문제 분석 + 대상 판단 + 7인 1차 의견 + 초기 대안 =====
    emit('analyze', 'active');
    const allPersonas = this._personaBlock(byId, ['stakeholder', 'ux', 'ops', 'benchmark', 'innovation', 'data', 'judge']);
    const round1 = await AiProvider.complete(
      `너는 7명의 전문가 역할을 동시에 맡아 하나의 응답 안에서 각자의 진짜 관점으로 말한다. 각 전문가의 정체성과 기준을 그대로 유지하라(요약하거나 뭉뚱그리지 마라):

${allPersonas}

반드시 아래 순서와 형식을 지켜서 답하라. 각 대괄호 제목은 그대로 소제목으로 써라.

[문제 분석]
확인된 사실(FACT)과 추론(INFERENCE)을 구분하고, 가능한 원인 가설을 2~3개 제시하라.

[대상 판단]
이 주제의 실제 이해관계자가 누구인지 스스로 판단해서 명시하라.

[전문가 1차 의견]
아래 7명 각각을 "**[이름]**" 소제목으로 구분해서, 그 전문가의 실제 기준으로 1~2문장씩 의견을 말하게 하라. 최소 2명 이상은 서로 다른 방향을 제시해야 한다. "좋은 의견입니다" 같은 형식적 동의는 금지.
**[실제 고객·사용자 관점 전문가]**
**[서비스·기획 전문가]**
**[내부 운영 현실성 전문가]**
**[외부 기업 벤치마킹 전문가]**
**[전략·혁신 전문가]**
**[데이터 분석·성과측정 전문가]**
**[최종 심사위원]**

[초기 대안]
위 의견을 종합해 서로 다른 대안을 2~3개, 각각 구체적으로 제시하라. 대안마다 어떤 전문가의 관점을 반영했는지도 밝혀라.`,
      `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라.`
    );
    record('1차 · 문제 분석 및 1차 의견', round1);
    emit('analyze', 'done');

    // ===== 2차 호출 — 이해관계자·운영·벤치마킹이 서로 반박, 약한 대안 폐기/수정 =====
    emit('debate', 'active');
    const debatePersonas = this._personaBlock(byId, ['stakeholder', 'ops', 'benchmark']);
    const round2 = await AiProvider.complete(
      `아래 3명의 전문가가 서로 다른 기준으로 앞서 나온 초기 대안들을 실제로 공격한다. 세 명의 의견이 항상 일치할 필요는 없다 — 서로 부딪히는 지점을 숨기지 말고 그대로 드러내라.

${debatePersonas}

반드시 아래 형식을 지켜라.

**[실제 이해관계자 관점]**
초기 대안들에 대해 실제 이해관계자 입장에서 문제점을 지적하라.

**[내부 운영 현실성 관점]**
같은 대안들을 운영 부담·비용·실행 난이도 기준으로 공격하라.

**[외부 벤치마킹 관점]**
관련 국내외 사례의 원리를 근거로 각 대안의 허점 또는 보완점을 지적하라. 확인 안 된 내용은 "확인 필요"라고 구분하라.

**[대안 정리 결과]**
위 세 관점의 공격을 반영해 어떤 대안을 폐기했는지(이유 포함)와, 살아남아 수정된 대안이 무엇인지 명확히 정리하라. 이름만 바꾸는 수정은 금지.`,
      `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라. 외부 벤치마킹 관점은 웹검색이 가능하면 실제로 검색해서 확인 가능한 사례와 출처를 근거로 답하고, 검색이 불가능했거나 결과가 없으면 "확인 필요" 또는 "일반적으로 알려진 방식"이라고 명확히 구분해라. 확인 안 된 내용을 최신 사실처럼 단정하지 마라.`,
      { webSearch: true }
    );
    record('2차 · 상호 반박 및 대안 정리', round2);
    emit('debate', 'done');

    // ===== 3차 호출 — 전략·데이터 재설계, 실행방법·측정계획 확정 =====
    emit('redesign', 'active');
    const redesignPersonas = this._personaBlock(byId, ['innovation', 'data']);
    const round3 = await AiProvider.complete(
      `아래 2명의 전문가가 앞서 살아남은 대안을 하나의 실행안으로 재설계한다. 전략·혁신 전문가는 더 나은 대안이 없는지 계속 의심하고, 데이터 분석 전문가는 근거 없는 낙관을 계속 견제한다 — 둘의 긴장을 유지한 채로 결론을 내라.

${redesignPersonas}

반드시 아래 형식을 지켜라.

**[전략·혁신 재설계]**
운영·벤치마킹의 공격을 반영해 대안을 최종 실행안 하나로 재설계하라. 실행 순서(누가 무엇을 언제)까지 구체적으로.

**[데이터 검증]**
이 실행안의 효과를 어떻게 측정할지 설계하라. 실제 수치가 없다면 가짜 숫자를 만들지 말고 측정 계획(기준값→수집데이터→수집위치→기간→비교대상→계산식)을 제시하라. 실제 데이터가 있으면 그 값을 근거로 계산 결과를 반영하라.

**[확정 실행안]**
위 내용을 하나로 합쳐, 실행 방법과 성과측정 방법이 모두 포함된 최종 실행안을 정리하라.`,
      `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라.`
    );
    record('3차 · 전략·데이터 재설계', round3);
    emit('redesign', 'done');

    // ===== 4차 호출 — 최종 심사 (통과 시 최종 보고서까지 즉시 작성) =====
    emit('judge', 'active');
    const reportStyleGuide = `"A의 의견", "토론결과", "AI 분석", "전문가별 의견" 같은 인위적인 섹션 제목은 절대 쓰지 마라. 처음부터 한 명이 자연스럽게 작성한 보고서처럼 마크다운 "## 소제목"으로 논리적으로 흐르게 써라. 전체 흐름은 현황 → 문제 → 원인 → 실제 이해관계자 관점 → 검토했던 대안과 왜 기각했는지 → 최종 방향 → 구체적인 실행 방법 → 데이터 측정 방법 → 향후 확장 순서로 자연스럽게 이어지게 하되, 소제목 문구 자체는 매번 똑같이 쓰지 말고 이번 주제에 맞는 전문적인 표현으로 정하라. 실행방법과 효과 측정 방법이 구체적으로 없는 아이디어는 넣지 마라. 과장, 확인되지 않은 숫자, AI 특유의 뜬구름 잡는 표현을 금지한다.`;
    const round4 = await AiProvider.complete(
      `${byId.judge.system}

너는 최종 심사위원이면서 동시에, 심사를 통과할 경우 그 자리에서 팀장/경영진에게 바로 제출할 최종 보고서까지 작성하는 전문 비즈니스 라이터 역할도 겸한다.

반드시 아래 형식 중 하나로만 답하라. 다른 텍스트를 앞뒤에 붙이지 마라.

- 심사 기준을 충분히 통과했다면:
STATUS: APPROVED
그 다음 줄부터 곧바로 최종 보고서를 markdown으로 작성하라. (${reportStyleGuide})

- 하나라도 중요하게 부족하면:
STATUS: REVISE
그 다음 줄부터 무엇을 보완해야 하는지 구체적으로 지시하라 (어떤 부분이 왜 부족한지, 무엇으로 채워야 하는지).`,
      `${context}\n\n위 회의 전체 내용을 최종 심사하라.`
    );
    record('4차 · 최종 심사', round4);
    emit('judge', 'done');

    const statusMatch = round4.match(/^\s*STATUS:\s*(APPROVED|REVISE)\s*\n?([\s\S]*)$/i);
    const status = statusMatch ? statusMatch[1].toUpperCase() : 'APPROVED';
    const afterStatus = statusMatch ? statusMatch[2].trim() : round4.trim();

    let finalReport;
    if (status === 'REVISE') {
      // ===== 5차 호출 (심사 반려 시에만) — 지시 반영해 최종 보고서 작성 =====
      emit('report', 'active');
      finalReport = await AiProvider.complete(
        `너는 이 회의 내용을 바탕으로 팀장/경영진에게 바로 제출할 수 있는 최종 보고서를 쓰는 전문 비즈니스 라이터다. ${reportStyleGuide}`,
        `${context}\n\n[최종 심사위원의 보완 지시]\n${afterStatus}\n\n위 보완 지시를 반드시 반영해서 최종 보고서를 작성하라.`
      );
      record('5차 · 보완 반영 최종 보고서', finalReport);
      emit('report', 'done');
    } else {
      // 심사 통과 — 추가 호출 없이 4차 응답에 이미 포함된 보고서를 그대로 사용
      finalReport = afterStatus;
      emit('report', 'active');
      emit('report', 'done');
    }

    return {
      mode: 'live',
      transport: AiProvider.getActiveTransport(),
      report: finalReport,
      log: transcript,
      warning: null
    };
  },

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};
