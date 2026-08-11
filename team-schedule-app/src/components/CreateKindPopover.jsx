import React from 'react';
import PopoverShell from './PopoverShell.jsx';

// 한솔 화면에서 날짜 칸을 클릭했을 때 가장 먼저 뜨는 "일정 종류" 선택
// 팝오버. 팀장님께 요청(기존 흐름)과 한솔 개인 일정(승인 절차 없음)을
// 명확히 구분해서 시작한다.
export default function CreateKindPopover({ anchor, day, onClose, onPick }) {
  const dateLabel = `${day.getMonth() + 1}월 ${day.getDate()}일`;

  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={240}>
      <div className="pv-head">
        <span className="pv-date">{dateLabel}</span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div className="pv-title-sm" style={{ marginBottom: 8 }}>일정 추가</div>
      <div className="pv-kind-options">
        <button className="pv-kind-btn pv-kind-request" onClick={() => onPick('request')}>
          팀장님께 요청
        </button>
        <button className="pv-kind-btn pv-kind-personal" onClick={() => onPick('personal')}>
          한솔 개인 일정
        </button>
      </div>
    </PopoverShell>
  );
}
