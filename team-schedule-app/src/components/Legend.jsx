import React from 'react';

// 월간 전용 화면으로 전환되면서 노란 "빈 시간" 표시는 더 이상 쓰지 않으므로
// 범례에서도 뺐다(존재하지 않는 색에 대한 설명을 남겨두면 혼란만 준다).
export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-item"><i className="legend-swatch legend-confirmed" /> 확정 일정</span>
      <span className="legend-item"><i className="legend-swatch legend-pending" /> 내 등록/승인대기</span>
    </div>
  );
}
