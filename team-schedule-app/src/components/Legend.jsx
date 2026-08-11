import React from 'react';
import woodpeckerIcon from '../assets/woodpecker.png';

// 월간 전용 화면으로 전환되면서 노란 "빈 시간" 표시는 더 이상 쓰지 않으므로
// 범례에서도 뺐다(존재하지 않는 색에 대한 설명을 남겨두면 혼란만 준다).
// "내 등록/승인대기" 항목에는 달력 칩과 동일한 딱따구리 아이콘을 붙여서,
// 화면 상단에서도 한솔 요청 일정을 같은 아이콘으로 알아볼 수 있게 한다.
export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-item"><i className="legend-swatch legend-confirmed" /> 확정 일정</span>
      <span className="legend-item">
        <i className="legend-swatch legend-pending" />
        <img className="legend-woodpecker" src={woodpeckerIcon} alt="한솔 요청" />
        내 등록/승인대기
      </span>
    </div>
  );
}
