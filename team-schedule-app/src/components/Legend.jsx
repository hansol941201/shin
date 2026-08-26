import React from 'react';

export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-item"><i className="legend-swatch legend-confirmed" /> 확정 일정</span>
      <span className="legend-item"><i className="legend-swatch legend-shared" /> 공유 일정(다른 팀)</span>
    </div>
  );
}
