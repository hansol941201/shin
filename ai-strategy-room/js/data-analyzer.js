/**
 * data-analyzer.js
 * "데이터 분석·성과측정 전문가"가 사용하는 계산 로직.
 * 중요: 실제 숫자가 없는데 AI가 임의로 "약 30% 증가 예상" 같은 가짜 수치를
 * 만들지 않도록, 계산이 필요한 부분은 반드시 이 모듈의 함수로 처리한다.
 * (AI 프롬프트에도 "숫자는 이 계산 결과만 사용하라"고 지시한다.)
 */

const DataAnalyzer = {
  /** 전환율(%) = (다음 단계 수 / 이전 단계 수) * 100. 0으로 나누는 경우 null 반환 */
  conversionRate(fromCount, toCount) {
    if (!fromCount || fromCount <= 0) return null;
    return Math.round(((toCount / fromCount) * 100) * 10) / 10;
  },

  /** 이탈률(%) = 100 - 전환율 */
  dropOffRate(fromCount, toCount) {
    const conv = this.conversionRate(fromCount, toCount);
    return conv === null ? null : Math.round((100 - conv) * 10) / 10;
  },

  /** 증감률(%) = ((이후 - 이전) / 이전) * 100 */
  changeRate(before, after) {
    if (!before || before === 0) return null;
    return Math.round((((after - before) / before) * 100) * 10) / 10;
  },

  /**
   * 표준 퍼널(현장등록 → 노출 → 클릭 → 신청 → 이용 → 재이용) 단계별 전환율을 계산한다.
   * steps: [{label:'현장등록 업체 수', value: 120}, {label:'서비스 노출 업체 수', value: 90}, ...]
   * 반환: [{label, value, conversionFromPrev, dropOffFromPrev}, ...]
   */
  buildFunnel(steps) {
    return steps.map((step, i) => {
      if (i === 0) return { ...step, conversionFromPrev: null, dropOffFromPrev: null };
      const prev = steps[i - 1].value;
      return {
        ...step,
        conversionFromPrev: this.conversionRate(prev, step.value),
        dropOffFromPrev: this.dropOffRate(prev, step.value)
      };
    });
  },

  /** 실측 데이터가 없을 때, 데이터 분석 전문가가 제시할 "측정 계획" 뼈대를 만든다 */
  buildMeasurementPlan(topicHint) {
    return {
      baseline: '현재 기준값을 먼저 확정한다 (예: 최근 1~3개월간의 관련 활동 건수·이용 건수·처리 건수 등 주제에 맞는 지표).',
      collect: '무엇을 수집할지 정의한다 (주제에 맞는 단계별 카운트 — 노출/인지 수, 시도 수, 완료 수, 재이용 수 등).',
      source: '어디서 수집할지 정의한다 (서비스 로그, 상담·CRM 기록, 설문, 내부 시스템 등 주제에 맞는 데이터 소스).',
      duration: '측정 기간을 정의한다 (예: 변경 적용 후 4~8주 관찰).',
      comparison: '무엇과 비교할지 정의한다 (변경 전 동일 기간 대비, 또는 대조군 대비).',
      formula: '개선율 산정 공식을 정의한다 (전환율 = 다음 단계 수 / 이전 단계 수 × 100).'
    };
  }
};
