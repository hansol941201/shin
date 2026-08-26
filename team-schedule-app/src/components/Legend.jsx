import React from 'react';

// 공유 일정(다른 팀) 기능은 화면에서만 숨긴 상태다(state/store.jsx,
// state/sharedStore.jsx의 SHOW_SHARED_EVENTS) — 화면에 나올 일이 없는
// 항목이라 범례에서도 함께 숨긴다. 나중에 다시 켤 때는 저 플래그와 함께
// 아래 주석 처리된 항목도 되살리면 된다.
const SHOW_SHARED_LEGEND = false;

export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-item"><i className="legend-swatch legend-confirmed" /> 확정 일정</span>
      {SHOW_SHARED_LEGEND && (
        <span className="legend-item"><i className="legend-swatch legend-shared" /> 공유 일정(다른 팀)</span>
      )}
    </div>
  );
}
