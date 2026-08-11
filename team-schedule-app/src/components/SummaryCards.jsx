import React from 'react';
import { useApp } from '../state/store.jsx';
import woodpeckerIcon from '../assets/woodpecker.png';

// 현재 cursorDate가 속한 "달"에 포함되는 일정만 카운트한다(그리드에 걸치는
// 앞/뒤 달의 며칠은 제외 — 실제 캘린더 월 기준).
function inCurrentMonth(e, monthAnchor) {
  const d = new Date(e.start);
  return d.getFullYear() === monthAnchor.getFullYear() && d.getMonth() === monthAnchor.getMonth();
}

// 상단 요약 카드: [팀장 | 한솔] 필터에 맞춰 숫자가 즉시 바뀐다.
// - 팀장: 확정 일정(Google 기본 + 한솔 요청 수락분) / 승인대기(한솔 요청 중
//   아직 처리 안 된 것 — 승인대기+시간변경 대기 합산)
// - 한솔: 승인대기 / 확정 요청(한솔 요청이 수락되어 확정된 것만, 팀장이
//   Google에 직접 등록한 일반 일정은 제외)
export default function SummaryCards() {
  const { events, cursorDate, role } = useApp();
  const monthEvents = events.filter((e) => e.status !== 'rejected' && inCurrentMonth(e, cursorDate));

  const isPendingLike = (e) => e.status === 'pending' || e.status === 'reschedule_requested';

  if (role === 'manager') {
    const confirmedCount = monthEvents.filter((e) => e.status === 'confirmed').length;
    const pendingCount = monthEvents.filter((e) => e.source === 'platform' && isPendingLike(e)).length;
    return (
      <div className="summary-bar">
        <div className="summary-card summary-card-confirmed">
          <span className="summary-card-label">확정 일정</span>
          <span className="summary-card-num">{confirmedCount}</span>
        </div>
        <div className="summary-card summary-card-pending">
          <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
          <span className="summary-card-label">승인대기</span>
          <span className="summary-card-num">{pendingCount}</span>
        </div>
      </div>
    );
  }

  const hansolEvents = monthEvents.filter((e) => e.source === 'platform');
  const pendingCount = hansolEvents.filter(isPendingLike).length;
  const confirmedRequestCount = hansolEvents.filter((e) => e.status === 'confirmed').length;

  return (
    <div className="summary-bar">
      <div className="summary-card summary-card-pending">
        <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
        <span className="summary-card-label">승인대기</span>
        <span className="summary-card-num">{pendingCount}</span>
      </div>
      <div className="summary-card summary-card-pending">
        <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
        <span className="summary-card-label">확정 요청</span>
        <span className="summary-card-num">{confirmedRequestCount}</span>
      </div>
    </div>
  );
}
