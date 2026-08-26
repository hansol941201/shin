import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { formatHM } from '../utils/time.js';
import PopoverShell from './PopoverShell.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';

// 현재 cursorDate가 속한 "달"에 포함되는 일정만 카운트한다(그리드에 걸치는
// 앞/뒤 달의 며칠은 제외 — 실제 캘린더 월 기준).
function inCurrentMonth(e, monthAnchor) {
  const d = new Date(e.start);
  return d.getFullYear() === monthAnchor.getFullYear() && d.getMonth() === monthAnchor.getMonth();
}

// 카드 숫자를 누르면 뜨는 목록 팝오버. 항목을 클릭하면 기존
// EventDetailPopover를 그대로 열어 상세/수정/삭제를 이어서 쓸 수 있게 한다.
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

// 상단 요약 카드: 확정 일정(파랑, Google) / 공유 일정(회색, 다른 팀 —
// 있을 때만 아주 작은 보조 표시로 덧붙인다).
export default function SummaryCards() {
  const { events, cursorDate } = useApp();
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

  const confirmedItems = monthEvents.filter((e) => e.source === 'google');
  const sharedItems = monthEvents.filter((e) => e.source === 'shared_team_calendar');

  return (
    <div className="summary-bar">
      <button
        className="summary-card summary-card-confirmed"
        onClick={(e) => openList(e, '확정 일정', confirmedItems)}
      >
        <span className="summary-card-label">확정 일정</span>
        <span className="summary-card-num">{confirmedItems.length}</span>
      </button>
      {sharedItems.length > 0 && (
        <button
          className="summary-card-mini"
          onClick={(e) => openList(e, '공유 일정', sharedItems)}
        >
          공유 일정 {sharedItems.length}
        </button>
      )}
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
    </div>
  );
}
