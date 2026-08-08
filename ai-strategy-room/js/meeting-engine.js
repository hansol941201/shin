/**
 * meeting-engine.js
 * 라운드 구조로 7명의 전문가를 순서대로 호출해 "반박 → 수정 → 재검증"을
 * 진행하고, 마지막에 하나의 완성된 보고서를 만든다.
 *
 * - AI가 연결되어 있지 않으면 자동으로 데모 모드로 진행한다.
 * - AI 연결이 되어 있지만 호출이 실패하면(CORS, 네트워크 등) 데모 모드로
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
      return this._runDemo({ emit });
    }

    try {
      return await this._runLive({ topic, attachedText, hasAttachment, emit });
    } catch (err) {
      console.error('[MeetingEngine] 실AI 회의 실패, 데모로 전환:', err);
      const demoResult = await this._runDemo({ emit });
      demoResult.warning =
        (err && err.message) || 'AI 연결에 실패해 데모 모드 결과로 대신 안내드립니다.';
      return demoResult;
    }
  },

  async _runDemo({ emit }) {
    for (const round of MEETING_ROUNDS) {
      emit(round.id, 'active');
      await this._wait(450); // 실제 진행되는 느낌을 주기 위한 짧은 지연 (데모 전용)
      emit(round.id, 'done');
    }
    return {
      mode: 'demo',
      report: DEMO_REPORT,
      log: DEMO_MEETING_LOG,
      warning: null
    };
  },

  async _runLive({ topic, attachedText, hasAttachment, emit }) {
    const mode = hasAttachment ? '근거분석 모드' : '전략회의 모드';
    const transcript = []; // 내부 회의 로그 (모달에서만 노출)
    let context = `[회의 모드] ${mode}\n[사용자가 입력한 주제]\n${topic}`;
    if (hasAttachment && attachedText) {
      context += `\n\n[첨부 자료에서 추출한 내용]\n${attachedText.slice(0, 6000)}`;
    }

    const byId = Object.fromEntries(EXPERTS.map((e) => [e.id, e]));
    const record = (roundLabel, expert, text) => {
      transcript.push({ round: roundLabel, entries: [{ expert: expert.name, text }] });
      context += `\n\n[${expert.name}]\n${text}`;
    };

    // ROUND 1 — 주제 분석 (전략·혁신 전문가가 문제를 프레이밍)
    emit('analyze', 'active');
    const framing = await AiProvider.complete(
      byId.innovation.system,
      `${context}\n\n위 내용을 바탕으로 이 문제의 핵심을 분석하라. 확인된 사실(FACT)과 추론(INFERENCE)을 구분하고, 가능한 원인 가설을 2~3개 제시하라.`
    );
    record('ROUND 1 · 주제 분석', byId.innovation, framing);
    emit('analyze', 'done');

    // ROUND 2 — 시공사 관점 검토 (공격)
    emit('contractor-view', 'active');
    const contractorView = await AiProvider.complete(
      byId.contractor.system,
      `${context}\n\n위 분석에 대해 실제 시공사 대표 입장에서 문제점을 지적하라. 형식적인 동의는 금지다.`
    );
    record('ROUND 2 · 시공사 관점 검토', byId.contractor, contractorView);
    emit('contractor-view', 'done');

    // ROUND 3 — 대안 제시 및 상호 반박 (UX 기획 제안 → 내부운영 공격 → 전략혁신 재설계)
    emit('debate', 'active');
    const uxIdea = await AiProvider.complete(
      byId.ux.system,
      `${context}\n\n위 논의를 바탕으로 시공사가 실제로 행동할 구체적인 UX 대안을 제시하라. 사용자가 어떤 순서로 행동하는지까지 설명하라.`
    );
    record('ROUND 3 · 대안 제시', byId.ux, uxIdea);

    const opsAttack = await AiProvider.complete(
      byId.ops.system,
      `${context}\n\n위 UX 대안을 내부 운영 관점에서 공격하라. 운영 부담이 크면 반려하고, 더 단순한 방식을 요구하라.`
    );
    record('ROUND 3 · 운영 관점 반박', byId.ops, opsAttack);

    const revisedIdea = await AiProvider.complete(
      byId.innovation.system,
      `${context}\n\n운영 전문가의 공격을 반영해 대안을 수정하거나 완전히 새로운 방식으로 재설계하라. 이름만 바꾸는 것은 금지다.`
    );
    record('ROUND 3 · 대안 수정', byId.innovation, revisedIdea);
    emit('debate', 'done');

    // ROUND 4 — 외부 사례 검토
    emit('benchmark', 'active');
    const benchmark = await AiProvider.complete(
      byId.benchmark.system,
      `${context}\n\n지금까지의 수정안과 관련해 참고할 만한 외부 사례의 "원리"를 분석하라. 그대로 적용하면 왜 실패할 수 있는지도 반드시 포함하라.`
    );
    record('ROUND 4 · 외부 사례 검토', byId.benchmark, benchmark);
    emit('benchmark', 'done');

    // ROUND 5 — 운영 현실성 + 데이터 재검증
    emit('verify', 'active');
    const opsVerify = await AiProvider.complete(
      byId.ops.system,
      `${context}\n\n최종 수정안이 실제로 운영 가능한지 다시 검증하라. 누가 담당하고, 추가 업무가 얼마나 되는지 구체적으로 판단하라.`
    );
    record('ROUND 5 · 운영 재검증', byId.ops, opsVerify);

    const dataVerify = await AiProvider.complete(
      byId.data.system,
      `${context}\n\n이 안의 효과를 어떻게 측정할지 설계하라. 실제 수치가 없다면 가짜 숫자를 만들지 말고 측정 계획(기준값→수집데이터→수집위치→기간→비교대상→계산식)을 제시하라.`
    );
    record('ROUND 5 · 데이터 검증', byId.data, dataVerify);
    emit('verify', 'done');

    // ROUND 6 — 최종 심사
    emit('judge', 'active');
    const judgement = await AiProvider.complete(
      byId.judge.system,
      `${context}\n\n지금까지의 논의를 최종 심사하라. 체크리스트 각 항목에 답하고, 승인/반려를 명확히 밝혀라. 반려라면 무엇을 보완해야 하는지 밝혀라.`
    );
    record('ROUND 6 · 최종 심사', byId.judge, judgement);
    emit('judge', 'done');

    // ROUND 7 — 최종 보고서 통합
    emit('report', 'active');
    const finalReport = await AiProvider.complete(
      `너는 이 회의 내용을 바탕으로 팀장/경영진에게 바로 제출할 수 있는 보고서를 쓰는 전문 비즈니스 라이터다.
"A의 의견", "토론결과", "AI 분석", "전문가별 의견" 같은 인위적인 섹션 제목은 절대 쓰지 마라.
처음부터 한 명이 자연스럽게 작성한 보고서처럼, 마크다운 "## 소제목" 형식을 사용해 논리적으로 흐르게 써라.
과장, 확인되지 않은 숫자, AI 특유의 뜬구름 잡는 표현을 금지한다. 실행 순서와 측정 방법을 구체적으로 포함하라.`,
      `${context}\n\n위 회의 전체 내용을 바탕으로 최종 보고서를 작성하라.`
    );
    record('ROUND 7 · 보고서 작성', { name: '보고서 통합' }, '최종 보고서를 생성했습니다.');
    emit('report', 'done');

    return { mode: 'live', report: finalReport, log: transcript, warning: null };
  },

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};
