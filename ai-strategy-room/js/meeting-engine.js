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
 *              보완이 필요하면 구조화된 판정 블록(REQUIRED_FIXES)만 돌려준다.
 *   5차 호출 — (심사에서 REVISE가 나왔을 때만) 지시를 반영해 최종 보고서를 작성.
 *
 * 재시도 3단계 구조 (중요):
 *   1) 네트워크 재시도 — claude 호출 자체가 실패(타임아웃/연결 끊김 등)하면
 *      같은 프롬프트로 최대 MEETING_RETRY_MAX회 재시도한다.
 *   2) 품질 가드레일(규칙 기반) — 응답이 성공했지만 quality-guardrails.js의
 *      규칙 검사에서 "필수 요소 자체가 없음"으로 확실히 실패하면, 곧바로
 *      "여기가 부족했다"는 피드백과 함께 재작성을 요청한다(추가 호출 없음).
 *   3) 품질 가드레일(선택적 LLM 판정) — 규칙 검사로는 "필수 요소는 있지만
 *      실제로 의미 있는 내용인지 애매함"으로만 판단되는 경우에만, Claude를
 *      1회 더 호출해 구조화된 PASS/FAIL 판정을 받는다(라운드당 최대 1회).
 *      FAIL이면 그 사유를 2)와 동일한 재시도-with-피드백 루프에 그대로 넘긴다.
 *      규칙 검사가 이미 확실한 통과/실패로 판정한 경우는 이 LLM 호출을 하지
 *      않는다 — 모든 응답을 LLM으로 다시 검사하지 않는다.
 *   위 재시도가 모두 소진되면(품질 재시도 최대 MEETING_QUALITY_RETRY_MAX회)
 *   전체 회의를 처음부터 다시 하지 않고 "N단계에서 일시 중단됨" 상태로
 *   체크포인트를 저장한 뒤 멈춘다. 사용자가 [이어서 진행]을 누르면 이미
 *   성공한 라운드는 절대 다시 호출하지 않는다.
 *
 * - Claude Code(로컬 서버)가 연결되어 있지 않으면 회의를 시작하지 않고
 *   명확한 오류를 던진다. 실패를 데모 결과로 조용히 감추지 않는다.
 * - 데모(예시)는 사용자가 [예시 보기] 버튼을 직접 눌렀을 때만 runExample()로
 *   별도 실행된다.
 * - 자료(TXT/CSV 등)가 있으면 "근거분석 모드", 없으면 "전략회의 모드"로 자동
 *   판단한다.
 */

const MEETING_RETRY_MAX = 2; // 네트워크 재시도 최대 횟수 (총 3회 시도)
const MEETING_QUALITY_RETRY_MAX = 2; // 품질 가드레일 재시도 최대 횟수
const MEETING_RETRY_DELAY_MS = 1500;

const REPORT_STYLE_GUIDE = `"A의 의견", "토론결과", "AI 분석", "전문가별 의견" 같은 인위적인 섹션 제목은 절대 쓰지 마라. 처음부터 한 명이 자연스럽게 작성한 보고서처럼 마크다운 "## 소제목"으로 논리적으로 흐르게 써라. 전체 흐름은 현황 → 문제 → 원인 → 실제 이해관계자 관점 → 검토했던 대안과 왜 기각했는지 → 최종 방향 → 구체적인 실행 방법 → 데이터 측정 방법 → 향후 확장 순서로 자연스럽게 이어지게 하되, 소제목 문구 자체는 매번 똑같이 쓰지 말고 이번 주제에 맞는 전문적인 표현으로 정하라. 실행방법과 효과 측정 방법이 구체적으로 없는 아이디어는 넣지 마라. 과장, 확인되지 않은 숫자, AI 특유의 뜬구름 잡는 표현을 금지한다. 최소 3개 이상의 "## 소제목"으로 구성하고, 전문가 이름이나 역할을 소제목처럼 나열하지 마라.`;

/**
 * [우리 팀 실행 방향] — 회의 결과를 "읽는 사람이 바로 뭘 해야 할지 아는" 실행
 * 지시 수준으로 한 번 더 번역한 요약을 상세 보고서보다 먼저 배치한다. 전문가
 * 회의 자체(7명/반박/가드레일/심사)는 그대로 두고, 마지막 산출물 형태만
 * 확장하는 것이다. "## 우리 팀 실행 방향"과 8개 "### N. 제목"은 프로그램이
 * ReportBuilder.splitActionPlan / QualityGuardrails.report에서 그대로 찾아
 * 파싱하므로 절대 바꾸거나 요약하지 마라(상세 보고서의 소제목과 달리 이 부분만
 * 문구를 고정한다).
 */
const ACTION_PLAN_GUIDE = `최종 보고서는 상세 분석 보고서보다 먼저 아래 [우리 팀 실행 방향] 섹션을 반드시 작성한다. "##"·"###" 제목 문구는 절대 바꾸지 말고 그대로 써라.

## 우리 팀 실행 방향

### 1. 결론 한 줄
이번 안건에서 우리 팀이 가야 할 방향을 어려운 표현 없이 1~2문장으로 쓴다.

### 2. 우리가 준비해야 할 것
"홍보 강화", "교육 강화" 같은 추상적 표현은 금지한다. 비교표/업체 리스트/안내문/데이터/FAQ/샘플/테스트 대상/담당자/기존자료/측정표 등 실제 준비물을 "- " bullet로 나열하고, 각 항목 뒤에 왜 필요한지 한 줄로 덧붙인다.

### 3. 실행 순서
무엇을 먼저 하고 → 그다음 무엇을 하고 → 결과를 보고 무엇을 결정하는지 "- " bullet로 순서대로 쓴다. 가능하면 준비 → 소규모 테스트 → 측정 → 수정 → 확대 형태로 구체화한다.

### 4. 역할 분담
반드시 아래와 같은 markdown 표로 작성한다(행 수는 자유). 실제 담당자가 정해지지 않았다면 운영/기획/고객응대/데이터/개발/책임자 등 역할 기준으로 채운다.
| 담당 | 해야 할 일 | 필요한 자료 | 완료 기준 |
|---|---|---|---|
| ... | ... | ... | ... |

### 5. 지금 당장 할 일
회의가 끝난 직후 바로 시작할 수 있는 일만, 최대 3~5개를 "□ " 체크리스트로 쓴다.

### 6. 준비 완료 기준
"어디까지 준비되면 실행해도 되는가"를 "□ " 체크리스트로 명확히 쓴다.

### 7. 하지 말아야 할 것
전문가 회의에서 폐기되거나 위험하다고 판단한 방식을 3~5개 이내로 "- " bullet로 명확히 쓴다.

### 8. 효과 확인 방법
막연한 기대효과가 아니라 실제로 무엇을 측정할지("- " bullet로 전환율/현장등록률/자료요청률/재사용률/문의량/처리시간/이탈률 등 구체적 지표) 쓴다. 근거 없는 목표 퍼센트는 만들지 마라. 현재 기준값이 없으면 "현재 기준값 없음 → 2주 측정 후 기준값 설정"처럼 써라.

시공사가 관련된 안건이라면 [2. 우리가 준비해야 할 것]과 [3. 실행 순서]에 반드시 시공사 입장에서 "이걸 왜 해야 하는가", "귀찮아하지 않을까", "실제로 행동할 이유가 있는가"를 검토한 결과를 반영하라.

이 섹션을 쓴 다음에 상세 분석 보고서를 이어서 작성한다. 전문가 7명의 토론 깊이나 반박 내용을 줄이라는 뜻이 아니다 — 회의 결과 자체는 그대로 두고, 그것을 팀이 바로 움직일 수 있는 형태로 한 번 더 정리하는 것이다.`;

const MeetingEngine = {
  /**
   * resumeState를 넘기면(같은 주제의 저장된 체크포인트) 이미 성공한 라운드는
   * 다시 호출하지 않고 실패했던 라운드부터 이어서 진행한다.
   *
   * referenceContext를 넘기면(사용자가 [이번 회의에 참고]로 직접 선택한 과거
   * 회의 요약) 1차 프롬프트의 배경 정보로만 포함한다 — 절대 자동으로 주입되지
   * 않으며, 재개(resumeState)일 때는 이미 체크포인트의 context에 포함되어
   * 있으므로 여기서 다시 붙이지 않는다(중복 방지).
   */
  async run({ topic, attachedText, hasAttachment, onProgress, resumeState, referenceContext }) {
    const emit = (roundId, status) => {
      if (typeof onProgress === 'function') onProgress(roundId, status);
    };

    if (!AiProvider.isConfigured()) {
      throw new Error('Claude Code가 연결되어 있지 않습니다. AI전략회의실.bat으로 실행했는지 확인해주세요.');
    }

    return await this._runLive({ topic, attachedText, hasAttachment, emit, resumeState, referenceContext });
  },

  /** 사용자가 [예시 보기]를 직접 눌렀을 때만 호출되는 데모 실행 경로 */
  async runExample({ topic, onProgress }) {
    const emit = (roundId, status) => {
      if (typeof onProgress === 'function') onProgress(roundId, status);
    };
    return this._runDemo({ topic, emit });
  },

  /**
   * 이미 완성된 최종 보고서를 사용자 코멘트에 맞춰 다시 다듬는다.
   * 1~4차 회의를 처음부터 다시 하지 않고, 기존 보고서 + 회의 핵심 내용(transcript) +
   * 사용자 코멘트만으로 딱 1회 추가 호출한다.
   */
  async refineReport({ topic, previousReport, transcript, comment }) {
    if (!AiProvider.isConfigured()) {
      throw new Error('Claude Code가 연결되어 있지 않습니다. AI전략회의실.bat으로 실행했는지 확인해주세요.');
    }
    if (!comment || !comment.trim()) {
      throw new Error('보완 요청 내용을 입력해주세요.');
    }

    const coreSummary = (transcript || [])
      .map((round) => `[${round.round}]\n` + (round.entries || []).map((e) => `${e.expert}: ${e.text}`).join('\n'))
      .join('\n\n')
      .slice(0, 8000); // 프롬프트가 과도하게 커지지 않도록 제한

    const systemPrompt = `너는 이미 완성된 보고서를 사용자의 추가 요청에 맞춰 다시 다듬는 전문 비즈니스 라이터다. 전체 회의를 처음부터 다시 하지 않고, 기존 최종 보고서와 회의 핵심 내용을 참고해서 사용자가 요청한 부분만 정확히 반영해 보고서를 다시 작성하라. 요청과 무관한 부분은 기존 내용을 최대한 유지하라. 기존 보고서에 [우리 팀 실행 방향] 섹션이 있다면 그 형식(제목 고정)을 유지한 채 요청 내용에 맞게 갱신하고, 없다면 아래 형식으로 새로 추가하라. ${ACTION_PLAN_GUIDE} 상세 보고서는 다음 스타일을 따른다: ${REPORT_STYLE_GUIDE}`;
    const userPrompt = `[기존 최종 보고서]\n${previousReport}\n\n[회의 핵심 내용 요약]\n${coreSummary}\n\n[사용자 보완 요청]\n${comment.trim()}\n\n위 보완 요청을 반드시 반영해서 최종 보고서를 다시 작성하라.`;

    const result = await this._completeWithGuardrail({
      roundId: 'refine',
      systemPrompt,
      userPrompt,
      opts: {},
      validate: (text) => QualityGuardrails.report(text, false)
    });

    if (!result.ok) {
      throw new Error(`보고서 보완 결과가 품질 기준을 통과하지 못했습니다: ${result.failures.join(' / ')}`);
    }
    return result.text;
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

  /** 라운드 id를 "N단계" 표시용 숫자로 바꾼다 */
  _roundNumber(roundId) {
    const idx = MEETING_ROUNDS.findIndex((r) => r.id === roundId);
    return idx >= 0 ? idx + 1 : '?';
  },

  /** 네트워크 재시도 / 규칙 기반 품질 재시도 / LLM 품질 판정을 구분해서 콘솔 + 내부 로그에 남긴다 */
  _logRetry(type, roundId, attempt, detail) {
    const tagMap = {
      network: '[네트워크 재시도]',
      quality: '[품질 재시도]',
      'llm-quality': '[LLM 품질판정]'
    };
    const tag = tagMap[type] || '[재시도]';
    try {
      console.log(`${tag} ${roundId} 시도 #${attempt}: ${detail}`);
    } catch (e) {
      /* 무시 */
    }
    if (typeof MeetingProgress !== 'undefined' && MeetingProgress.pushRetryLog) {
      MeetingProgress.pushRetryLog({ roundId, type, attempt, detail });
    }
  },

  /**
   * 규칙 기반 가드레일이 "애매함"으로 판단했을 때만 호출되는 선택적 LLM 품질
   * 판정. 라운드당 최대 1회만 호출된다(_completeWithGuardrail의 llmCheckUsed
   * 플래그로 강제). 실패하거나 응답을 해석하지 못하면 안전하게 "그냥 통과"
   * 처리한다(fail-open) — 이 보조 판정 자체의 오류가 정상 진행을 막아서는
   * 안 된다.
   */
  async _runLlmQualityCheck(roundId, text, concerns) {
    const systemPrompt = `너는 이 프로그램의 내부 품질 검수 담당자다. 형식적으로는 필요한 요소를 갖췄지만 실질적인 품질이 애매하다고 자동 검사가 표시한 부분만 냉정하게 판정한다. 애매하지 않다고 표시되지 않은 부분은 다시 언급하지 마라.`;
    const userPrompt = `[검토 대상 라운드] ${roundId}

[자동 검사에서 애매하다고 표시된 항목]
${concerns.map((c) => `- ${c}`).join('\n')}

[검토할 응답 전체]
${text}

위에서 애매하다고 표시된 항목을 중심으로, 실제로 기준을 충족했는지 엄격하게 판정하라. 반드시 아래 형식으로만 답하라. 다른 텍스트를 앞뒤에 붙이지 마라.

---QUALITY_RESULT---
STATUS: PASS 또는 FAIL 중 하나만 적는다
REASON: 판정 근거를 한두 문장으로
MISSING: FAIL이면 부족한 항목을 "- " bullet로 구체적으로 나열하고, PASS면 "없음"이라고 적는다
---END_QUALITY_RESULT---`;

    let responseText;
    try {
      responseText = await AiProvider.complete(systemPrompt, userPrompt, {});
    } catch (err) {
      this._logRetry('llm-quality', roundId, 1, `호출 실패로 기존 판정을 그대로 사용합니다: ${(err && err.message) || '알 수 없는 오류'}`);
      return null;
    }
    const parsed = this._parseQualityBlock(responseText);
    if (!parsed) {
      this._logRetry('llm-quality', roundId, 1, '응답 해석 실패로 기존 판정을 그대로 사용합니다.');
      return null;
    }
    this._logRetry('llm-quality', roundId, 1, `판정 ${parsed.status} — ${parsed.reason}`);
    return parsed;
  },

  /**
   * LLM 품질 판정 응답에서 구조화된 블록을 파싱한다.
   *   ---QUALITY_RESULT---
   *   STATUS: PASS | FAIL
   *   REASON: ...
   *   MISSING: ...
   *   ---END_QUALITY_RESULT---
   */
  _parseQualityBlock(text) {
    const t = String(text || '');
    const m = t.match(/---QUALITY_RESULT---\s*\n?([\s\S]*?)\n?---END_QUALITY_RESULT---/);
    if (!m) return null;
    const block = m[1];
    const statusM = block.match(/STATUS:\s*(PASS|FAIL)/i);
    if (!statusM) return null;
    const reasonM = block.match(/REASON:\s*(.+)/i);
    const missingM = block.match(/MISSING:\s*([\s\S]*)/i);
    const missingRaw = missingM ? missingM[1].trim() : '';
    let missing = [];
    if (missingRaw && !/^없음\W*$/.test(missingRaw)) {
      missing = missingRaw
        .split('\n')
        .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);
    }
    return { status: statusM[1].toUpperCase(), reason: reasonM ? reasonM[1].trim() : '', missing };
  },

  /**
   * claude 호출 하나를 "네트워크 재시도 → 규칙 기반 품질 가드레일 → (애매할 때만)
   * LLM 품질 판정 → 재시도-with-피드백" 순서로 감싼다.
   * 성공하면 { ok:true, text }를, 품질 가드레일을 끝내 통과하지 못하면
   * { ok:false, failures, text(마지막 시도 결과) }를 반환한다.
   * 네트워크 자체가 끝내 실패하면 예외를 던진다(호출부가 pausedReason='network'로 처리).
   */
  async _completeWithGuardrail({ roundId, systemPrompt, userPrompt, opts, validate }) {
    let currentUserPrompt = userPrompt;
    let qualityAttempt = 0;
    let llmCheckUsed = false; // 라운드당 최대 1회 — 이 함수 호출(=라운드) 안에서만 유효

    while (true) {
      let text = null;
      let networkErr = null;
      for (let networkAttempt = 0; networkAttempt <= MEETING_RETRY_MAX; networkAttempt++) {
        try {
          text = await AiProvider.complete(systemPrompt, currentUserPrompt, opts || {});
          networkErr = null;
          break;
        } catch (err) {
          networkErr = err;
          this._logRetry('network', roundId, networkAttempt + 1, (err && err.message) || '알 수 없는 오류');
          if (networkAttempt < MEETING_RETRY_MAX) {
            await this._wait(MEETING_RETRY_DELAY_MS * (networkAttempt + 1));
          }
        }
      }

      if (text == null) {
        const e = new Error((networkErr && networkErr.message) || '알 수 없는 오류');
        e.pausedReason = 'network';
        throw e;
      }

      if (!validate) return { ok: true, text };

      let result = validate(text);

      // 규칙 기반 검사가 "통과"했지만 "애매함" 신호가 있는 경우에만, 라운드당
      // 딱 1회 Claude에게 추가로 판정을 맡긴다. 확실한 통과/실패는 이 호출을
      // 하지 않는다.
      if (result.ok && result.ambiguous && !llmCheckUsed) {
        llmCheckUsed = true;
        const verdict = await this._runLlmQualityCheck(roundId, text, result.ambiguousConcerns || []);
        if (verdict && verdict.status === 'FAIL') {
          result = { ok: false, failures: verdict.missing.length ? verdict.missing : [verdict.reason || 'LLM 품질 판정에서 부족하다고 판단했습니다.'] };
        }
        // verdict가 PASS이거나(그대로 통과) null(호출 실패 — fail-open)이면
        // result는 이미 ok:true이므로 별도 처리 없이 그대로 진행한다.
      }

      if (result.ok) return { ok: true, text };

      this._logRetry('quality', roundId, qualityAttempt + 1, result.failures.join(' / '));

      if (qualityAttempt >= MEETING_QUALITY_RETRY_MAX) {
        return { ok: false, failures: result.failures, text };
      }

      currentUserPrompt = `${userPrompt}\n\n[이전 시도 결과]\n${text}\n\n[품질 검증 실패 사유]\n${result.failures.map((f) => `- ${f}`).join('\n')}\n\n기존 좋은 내용은 유지하고 부족한 부분만 보완해서 다시 작성하세요.`;
      qualityAttempt++;
    }
  },

  /**
   * 라운드 하나를 실행한다. 이미 체크포인트에 이 라운드 결과가 있으면(재개
   * 시) 절대 다시 호출하지 않고 그대로 재사용한다 — Claude 사용량 중복 방지.
   * 반환값은 갱신된 context 문자열이다(다음 라운드의 프롬프트에 이어 붙인다).
   */
  async _runStep({ roundId, label, systemPrompt, userPrompt, opts, context, transcript, roundTexts, emit, meta, validate }) {
    if (Object.prototype.hasOwnProperty.call(roundTexts, roundId) && roundTexts[roundId] != null) {
      emit(roundId, 'done');
      return context;
    }

    emit(roundId, 'active');

    let text;
    try {
      const result = await this._completeWithGuardrail({ roundId, systemPrompt, userPrompt, opts, validate });
      if (!result.ok) {
        MeetingProgress.saveCheckpoint({
          topic: meta.topic,
          attachedText: meta.attachedText,
          hasAttachment: meta.hasAttachment,
          context,
          transcript,
          roundTexts,
          status: 'paused',
          pausedAtRound: roundId,
          pausedReason: 'quality',
          pausedMessage: result.failures.join(' / ')
        });
        const pausedErr = new Error(`${this._roundNumber(roundId)}단계 품질검증 실패로 일시 중단되었습니다: ${result.failures.join(' / ')}`);
        pausedErr.pausedAtRound = roundId;
        pausedErr.pausedReason = 'quality';
        pausedErr.isPaused = true;
        throw pausedErr;
      }
      text = result.text;
    } catch (err) {
      if (err && err.isPaused) throw err; // 위에서 이미 체크포인트 저장 + 가공 완료
      // 네트워크 재시도까지 모두 실패
      MeetingProgress.saveCheckpoint({
        topic: meta.topic,
        attachedText: meta.attachedText,
        hasAttachment: meta.hasAttachment,
        context,
        transcript,
        roundTexts,
        status: 'paused',
        pausedAtRound: roundId,
        pausedReason: 'network',
        pausedMessage: (err && err.message) || '알 수 없는 오류'
      });
      const pausedErr = new Error((err && err.message) || '알 수 없는 오류');
      pausedErr.pausedAtRound = roundId;
      pausedErr.pausedReason = 'network';
      pausedErr.isPaused = true;
      throw pausedErr;
    }

    roundTexts[roundId] = text;
    const entries = this._splitSections(text).map((s) => ({ expert: s.label, text: s.text }));
    transcript.push({ round: label, entries });
    const newContext = `${context}\n\n[${label}]\n${text}`;

    MeetingProgress.saveCheckpoint({
      topic: meta.topic,
      attachedText: meta.attachedText,
      hasAttachment: meta.hasAttachment,
      context: newContext,
      transcript,
      roundTexts,
      status: 'in-progress',
      pausedAtRound: null
    });

    emit(roundId, 'done');
    return newContext;
  },

  /**
   * 4차 심사 응답에서 판정 블록을 파싱한다.
   *   ---JUDGE_RESULT---
   *   STATUS: APPROVED | REVISE
   *   REASON: ...
   *   REQUIRED_FIXES: ...
   *   ---END_JUDGE_RESULT---
   * 블록을 못 찾거나 STATUS를 못 읽으면 null을 반환한다(호출부가 이걸
   * "임의로 APPROVED 처리"하지 않고 품질 가드레일 실패로 취급한다).
   */
  _parseJudgeBlock(text) {
    const t = String(text || '');
    const m = t.match(/---JUDGE_RESULT---\s*\n?([\s\S]*?)\n?---END_JUDGE_RESULT---/);
    if (!m) return null;
    const block = m[1];
    const statusM = block.match(/STATUS:\s*(APPROVED|REVISE)/i);
    if (!statusM) return null;
    const reasonM = block.match(/REASON:\s*(.+)/i);
    const fixesM = block.match(/REQUIRED_FIXES:\s*([\s\S]*)/i);
    return {
      status: statusM[1].toUpperCase(),
      reason: reasonM ? reasonM[1].trim() : '',
      requiredFixes: fixesM ? fixesM[1].trim() : '',
      blockStart: m.index
    };
  },

  async _runLive({ topic, attachedText, hasAttachment, emit, resumeState, referenceContext }) {
    const mode = hasAttachment ? '근거분석 모드' : '전략회의 모드';
    const byId = Object.fromEntries(EXPERTS.map((e) => [e.id, e]));
    const meta = { topic, attachedText, hasAttachment };

    let context;
    let transcript;
    let roundTexts;

    if (resumeState && resumeState.topic === topic) {
      // 이어서 진행 — 이미 성공한 라운드의 원문과 누적 context를 그대로 재사용한다.
      context = resumeState.context;
      transcript = Array.isArray(resumeState.transcript) ? resumeState.transcript.slice() : [];
      roundTexts = resumeState.roundTexts ? { ...resumeState.roundTexts } : {};
      // 예전 버전(구조화된 판정 블록 도입 이전)에서 저장된 4차 결과라면 새 형식이
      // 아니므로 안전하게 다시 만들도록 비워둔다(잘못 파싱해서 죽는 것을 방지).
      if (roundTexts.judge && !this._parseJudgeBlock(roundTexts.judge)) {
        delete roundTexts.judge;
        delete roundTexts.report;
      }
    } else {
      context = `[회의 모드] ${mode}\n[사용자가 입력한 주제]\n${topic}`;
      if (referenceContext) {
        // 사용자가 [이번 회의에 참고]로 직접 선택한 경우에만 여기 들어온다.
        context += `\n\n${referenceContext}`;
      }
      if (hasAttachment && attachedText) {
        context += `\n\n[첨부 자료에서 추출한 내용]\n${attachedText.slice(0, 6000)}`;
      }
      transcript = [];
      roundTexts = {};
      MeetingProgress.clearRetryLog();
      MeetingProgress.saveCheckpoint({ ...meta, context, transcript, roundTexts, status: 'in-progress', pausedAtRound: null });
    }

    // ===== 1차 호출 — 문제 분석 + 대상 판단 + 7인 1차 의견 + 초기 대안 =====
    const allPersonas = this._personaBlock(byId, ['stakeholder', 'ux', 'ops', 'benchmark', 'innovation', 'data', 'judge']);
    context = await this._runStep({
      roundId: 'analyze',
      label: '1차 · 문제 분석 및 1차 의견',
      systemPrompt: `너는 7명의 전문가 역할을 동시에 맡아 하나의 응답 안에서 각자의 진짜 관점으로 말한다. 각 전문가의 정체성과 기준을 그대로 유지하라(요약하거나 뭉뚱그리지 마라):

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
      userPrompt: `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라.`,
      opts: {},
      context,
      transcript,
      roundTexts,
      emit,
      meta,
      validate: (text) => QualityGuardrails.analyze(text)
    });

    // ===== 2차 호출 — 이해관계자·운영·벤치마킹이 서로 반박, 약한 대안 폐기/수정 =====
    const debatePersonas = this._personaBlock(byId, ['stakeholder', 'ops', 'benchmark']);
    context = await this._runStep({
      roundId: 'debate',
      label: '2차 · 상호 반박 및 대안 정리',
      systemPrompt: `아래 3명의 전문가가 서로 다른 기준으로 앞서 나온 초기 대안들을 실제로 공격한다. 세 명의 의견이 항상 일치할 필요는 없다 — 서로 부딪히는 지점을 숨기지 말고 그대로 드러내라.

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
      userPrompt: `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라. 외부 벤치마킹 관점은 웹검색이 가능하면 실제로 검색해서 확인 가능한 사례와 출처를 근거로 답하고, 검색이 불가능했거나 결과가 없으면 "확인 필요" 또는 "일반적으로 알려진 방식"이라고 명확히 구분해라. 확인 안 된 내용을 최신 사실처럼 단정하지 마라.`,
      opts: { webSearch: true },
      context,
      transcript,
      roundTexts,
      emit,
      meta,
      validate: (text) => QualityGuardrails.debate(text)
    });

    // ===== 3차 호출 — 전략·데이터 재설계, 실행방법·측정계획 확정 =====
    const redesignPersonas = this._personaBlock(byId, ['innovation', 'data']);
    context = await this._runStep({
      roundId: 'redesign',
      label: '3차 · 전략·데이터 재설계',
      systemPrompt: `아래 2명의 전문가가 앞서 살아남은 대안을 하나의 실행안으로 재설계한다. 전략·혁신 전문가는 더 나은 대안이 없는지 계속 의심하고, 데이터 분석 전문가는 근거 없는 낙관을 계속 견제한다 — 둘의 긴장을 유지한 채로 결론을 내라.

${redesignPersonas}

반드시 아래 형식을 지켜라.

**[전략·혁신 재설계]**
운영·벤치마킹의 공격을 반영해 대안을 최종 실행안 하나로 재설계하라. 실행 순서(누가 무엇을 언제)까지 구체적으로.

**[데이터 검증]**
이 실행안의 효과를 어떻게 측정할지 설계하라. 실제 수치가 없다면 가짜 숫자를 만들지 말고 측정 계획(기준값→수집데이터→수집위치→기간→비교대상→계산식)을 제시하라. 실제 데이터가 있으면 그 값을 근거로 계산 결과를 반영하라.

**[확정 실행안]**
위 내용을 하나로 합쳐, 실행 방법과 성과측정 방법이 모두 포함된 최종 실행안을 정리하라.`,
      userPrompt: `${context}\n\n위 내용을 바탕으로 지시된 형식대로 답하라.`,
      opts: {},
      context,
      transcript,
      roundTexts,
      emit,
      meta,
      validate: (text) => QualityGuardrails.redesign(text, hasAttachment)
    });

    // ===== 4차 호출 — 최종 심사 (통과 시 최종 보고서까지 즉시 작성) =====
    context = await this._runStep({
      roundId: 'judge',
      label: '4차 · 최종 심사',
      systemPrompt: `${byId.judge.system}

너는 최종 심사위원이면서 동시에, 심사를 통과할 경우 그 자리에서 팀장/경영진에게 바로 제출할 최종 보고서까지 작성하는 전문 비즈니스 라이터 역할도 겸한다.

반드시 아래 순서로만 답하라. 이 형식을 벗어나면 프로그램이 응답을 처리하지 못한다.

1) 심사를 통과했다면(APPROVED), 먼저 최종 보고서를 markdown으로 작성하라. ${ACTION_PLAN_GUIDE} 그 다음 상세 보고서는 다음 스타일을 따른다: ${REPORT_STYLE_GUIDE} 통과하지 못했다면(REVISE) 이 단계는 생략하고 바로 2)로 간다.
2) 그 다음 반드시 아래 형식의 판정 블록을 정확히 그대로 출력하라(다른 텍스트로 감싸거나 형식을 바꾸지 마라):

---JUDGE_RESULT---
STATUS: APPROVED 또는 REVISE 중 하나만 적는다
REASON: 심사 근거와 주요 허점/리스크 검토 내용을 한두 문장으로
REQUIRED_FIXES: REVISE인 경우 보완해야 할 항목을 "- " bullet로 구체적으로 나열하고, APPROVED면 "없음"이라고 적는다
---END_JUDGE_RESULT---`,
      userPrompt: `${context}\n\n위 회의 전체 내용을 최종 심사하라.`,
      opts: {},
      context,
      transcript,
      roundTexts,
      emit,
      meta,
      validate: (text) => {
        const parsed = this._parseJudgeBlock(text);
        if (!parsed) {
          return { ok: false, failures: ['---JUDGE_RESULT--- 판정 블록을 찾을 수 없습니다. 반드시 지정된 형식으로 STATUS/REASON/REQUIRED_FIXES를 포함해 응답하세요.'], ambiguous: false, ambiguousConcerns: [] };
        }
        const reportBody = text.slice(0, parsed.blockStart).trim();
        const blockCheck = QualityGuardrails.judgeBlock(parsed, reportBody);
        if (!blockCheck.ok) return blockCheck;
        if (parsed.status === 'APPROVED') {
          const reportCheck = QualityGuardrails.report(reportBody, hasAttachment);
          if (!reportCheck.ok) return reportCheck;
          if (reportCheck.ambiguous) {
            return { ok: true, failures: [], ambiguous: true, ambiguousConcerns: reportCheck.ambiguousConcerns };
          }
        }
        return { ok: true, failures: [], ambiguous: false, ambiguousConcerns: [] };
      }
    });
    const round4 = roundTexts.judge;
    const parsedJudge = this._parseJudgeBlock(round4); // validate를 이미 통과했으므로 항상 파싱 성공
    const status = parsedJudge.status;
    const reportBodyFromJudge = round4.slice(0, parsedJudge.blockStart).trim();

    let finalReport;
    if (status === 'REVISE') {
      // ===== 5차 호출 (심사 반려 시에만) — 지시 반영해 최종 보고서 작성 =====
      context = await this._runStep({
        roundId: 'report',
        label: '5차 · 보완 반영 최종 보고서',
        systemPrompt: `너는 이 회의 내용을 바탕으로 팀장/경영진에게 바로 제출할 수 있는 최종 보고서를 쓰는 전문 비즈니스 라이터다. ${ACTION_PLAN_GUIDE} 그 다음 상세 보고서는 다음 스타일을 따른다: ${REPORT_STYLE_GUIDE}`,
        userPrompt: `${context}\n\n[최종 심사위원의 판정 근거]\n${parsedJudge.reason}\n\n[보완이 필요한 항목]\n${parsedJudge.requiredFixes}\n\n위 보완 지시를 반드시 반영해서 최종 보고서를 작성하라.`,
        opts: {},
        context,
        transcript,
        roundTexts,
        emit,
        meta,
        validate: (text) => QualityGuardrails.report(text, hasAttachment)
      });
      finalReport = roundTexts.report;
    } else {
      // 심사 통과 — 추가 호출 없이 4차 응답에 이미 포함된 보고서를 그대로 사용.
      // (재개 시에도 roundTexts.judge가 이미 있으면 이 분기는 항상 호출 없이 즉시 계산된다.)
      finalReport = roundTexts.report != null ? roundTexts.report : reportBodyFromJudge;
      roundTexts.report = finalReport; // 재개 체크포인트에도 report를 채워 일관되게 둔다
      emit('report', 'active');
      emit('report', 'done');
    }

    // 완성된 보고서가 나온 경우에만 완료 상태로 바꾼다
    MeetingProgress.markDone({ ...meta, report: finalReport, transcript });

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
