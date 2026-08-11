import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { formatHM } from '../utils/time.js';
import PopoverShell from './PopoverShell.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';
import woodpeckerIcon from '../assets/woodpecker.png';

// 현재 cursorDate가 속한 "달"에 포함되는 일정만 카운트한다(그리드에 걸치는
// 앞/뒤 달의 며칠은 제외 — 실제 캘린더 월 기준).
function inCurrentMonth(e, monthAnchor) {
  const d = new Date(e.start);
  return d.getFullYear() === monthAnchor.getFullYear() && d.getMonth() === monthAnchor.getMonth();
}

// 카드 숫자를 누르면 뜨는 목록 팝오버. 항목을 클릭하면 기존
// EventDetailPopover를 그대로 열어 상세/수락/거절/시간변경 등을 이어서
// 쓸 수 있게 한다(새 상세 UI를 따로 만들지 않고 재사용).
function SummaryListPopover({ title, items, anchor, onClose, onPick }) {
  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={260}>
      <div className="pv-head">
        <span className="pv-title-sm">{title}</span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      {items.length === 0 && <div className="pv-hint">해당하는 일정이 없습니다.</div>}
      <div className="approval-menu-list">
        {items.map((e) => {
          const s = new Date(e.start);
          return (
            <button key={e.id} className="approval-menu-item" onClick={(ev) => onPick(e, ev)}>
              <span className="approval-menu-title">{e.title}</span>
              <span className="approval-menu-time">
                {s.getMonth() + 1}/{s.getDate()} {formatHM(s.getHours() * 60 + s.getMinutes())}
              </span>
            </button>
          );
        })}
      </div>
    </PopoverShell>
  );
}

// 상단 요약 카드: [팀장 | 한솔] 필터에 맞춰 숫자가 즉시 바뀐다.
// - 팀장: 확정 일정(파랑, Google 기본 + 한솔 요청 수락분) / 승인대기(분홍,
//   한솔의 pending만) + 작게 시간변경 건수(있을 때만). 한솔 개인 일정은
//   팀장 업무와 무관하므로 전부 제외한다.
// - 한솔: 팀장 일정(파랑, source==='google'만) / 승인대기(분홍) / 시간변경
//   (주황) / 내 일정(노랑, source==='hansol_personal') — 너무 복잡해지지
//   않게 4개로 정리하고, 거절 건이 있을 때만 아주 작은 보조 표시를 덧붙인다
//   (거절 자체는 달력에서 이미 빨간색으로 계속 보이므로 상단은 보조 역할).
// 숫자를 클릭하면 해당 상태의 일정 목록을 바로 확인할 수 있다.
export default function SummaryCards() {
  const { events, cursorDate, role } = useApp();
  const monthEvents = events.filter((e) => inCurrentMonth(e, cursorDate));

  const [listPopover, setListPopover] = useState(null); // {title, items, x, y}
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  function openList(e, title, items) {
    const rect = e.currentTarget.getBoundingClientRect();
    setListPopover({ title, items, x: rect.left, y: rect.bottom + 6 });
  }

  function pickItem(ev, mouseEvent) {
    setListPopover(null);
    setDetailPopover({ event: ev, x: mouseEvent.clientX, y: mouseEvent.clientY });
  }

  const listAndDetailPopovers = (
    <>
      {listPopover && (
        <SummaryListPopover
          title={listPopover.title}
          items={listPopover.items}
          anchor={{ x: listPopover.x, y: listPopover.y }}
          onClose={() => setListPopover(null)}
          onPick={pickItem}
        />
      )}
      {detailPopover && (
        <EventDetailPopover
          event={detailPopover.event}
          anchor={{ x: detailPopover.x, y: detailPopover.y }}
          onClose={() => setDetailPopover(null)}
        />
      )}
    </>
  );

  if (role === 'manager') {
    // 개인 일정(source==='hansol_personal')은 팀장 화면에서 완전히 숨긴다.
    const managerEvents = monthEvents.filter((e) => e.source !== 'hansol_personal');
    const confirmedItems = managerEvents.filter((e) => e.status === 'confirmed');
    const pendingItems = managerEvents.filter((e) => e.source === 'platform' && e.status === 'pending');
    const rescheduleItems = managerEvents.filter((e) => e.source === 'platform' && e.status === 'reschedule_requested');

    return (
      <div className="summary-bar">
        <button
          className="summary-card summary-card-confirmed"
          onClick={(e) => openList(e, '확정 일정', confirmedItems)}
        >
          <span className="summary-card-label">확정 일정</span>
          <span className="summary-card-num">{confirmedItems.length}</span>
        </button>
        <button
          className="summary-card summary-card-pending"
          onClick={(e) => openList(e, '승인대기', pendingItems)}
        >
          <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
          <span className="summary-card-label">승인대기</span>
          <span className="summary-card-num">{pendingItems.length}</span>
        </button>
        {/* 상단을 복잡하게 만들지 않기 위해 시간변경은 건수가 있을 때만 아주
            작은 보조 표시로만 붙인다. */}
        {rescheduleItems.length > 0 && (
          <button
            className="summary-card-mini"
            onClick={(e) => openList(e, '시간변경 요청', rescheduleItems)}
          >
            시간변경 {rescheduleItems.length}
          </button>
        )}
        {listAndDetailPopovers}
      </div>
    );
  }

  // 한솔 화면: 팀장 일정 + 내 요청 + 내 개인 일정을 모두 한 화면에서 본다.
  const managerScheduleItems = monthEvents.filter((e) => e.source === 'google');
  const hansolRequestEvents = monthEvents.filter((e) => e.source === 'platform');
  const pendingItems = hansolRequestEvents.filter((e) => e.status === 'pending');
  const rescheduleItems = hansolRequestEvents.filter((e) => e.status === 'reschedule_requested');
  const rejectedItems = hansolRequestEvents.filter((e) => e.status === 'rejected');
  const personalItems = monthEvents.filter((e) => e.source === 'hansol_personal');

  return (
    <div className="summary-bar">
      <button
        className="summary-card summary-card-confirmed"
        onClick={(e) => openList(e, '팀장 일정', managerScheduleItems)}
      >
        <span className="summary-card-label">팀장 일정</span>
        <span className="summary-card-num">{managerScheduleItems.length}</span>
      </button>
      <button
        className="summary-card summary-card-pending"
        onClick={(e) => openList(e, '승인대기', pendingItems)}
      >
        <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
        <span className="summary-card-label">승인대기</span>
        <span className="summary-card-num">{pendingItems.length}</span>
      </button>
      <button
        className="summary-card summary-card-reschedule"
        onClick={(e) => openList(e, '시간변경 요청', rescheduleItems)}
      >
        <img className="summary-card-icon" src={woodpeckerIcon} alt="한솔 요청" />
        <span className="summary-card-label">시간변경</span>
        <span className="summary-card-num">{rescheduleItems.length}</span>
      </button>
      <button
        className="summary-card summary-card-personal"
        onClick={(e) => openList(e, '내 일정', personalItems)}
      >
        <span className="summary-card-label">내 일정</span>
        <span className="summary-card-num">{personalItems.length}</span>
      </button>
      {rejectedItems.length > 0 && (
        <button
          className="summary-card-mini summary-card-mini-reject"
          onClick={(e) => openList(e, '거절', rejectedItems)}
        >
          거절 {rejectedItems.length}
        </button>
      )}
      {listAndDetailPopovers}
    </div>
  );
}
