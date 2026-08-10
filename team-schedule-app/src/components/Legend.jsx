import React from 'react';

export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-item"><i className="legend-swatch legend-free" /> 빈 시간</span>
      <span className="legend-item"><i className="legend-swatch legend-confirmed" /> 확정 일정</span>
      <span className="legend-item"><i className="legend-swatch legend-pending" /> 승인대기</span>
    </div>
  );
}
