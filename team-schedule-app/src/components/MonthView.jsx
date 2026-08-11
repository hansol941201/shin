import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, dateKey, getWeekStart, isSameDay, startOfDay } from '../utils/time.js';
import { computeFreeBlocks } from '../utils/time.js';
import { busyIntervalsForDay } from '../utils/eventHelpers.js';
import RequestPopover from './RequestPopover.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';

const STATUS_DOT = {
  confirmed: 'dot-confirmed',
  pending: 'dot-pending',
  reschedule_requested: 'dot-pending',
};

// 월간 화면이 유일한 화면이 되면서(주간 화면 진입 없이), 일정 클릭 →
// 상세 팝오버, 빈 시간 클릭 → 일정 요청 팝오버를 모두 이 화면 안에서
// 직접 처리한다(예전에는 셀 클릭 시 주간 화면으로 이동해서 처리했음).
export default function MonthView() {
  const { cursorDate, events, settings, addRequest } = useApp();
  const today = startOfDay(new Date());

  const [createPopover, setCreatePopover] = useState(null); // {day, blockStart, blockEnd, startMin, endMin, x, y}
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  // cursorDate가 속한 달을 기준으로 월 전체 그리드(항상 6주) 구성
  const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthAnchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function dayEvents(d) {
    return events.filter((e) => e.status !== 'rejected' && isSameDay(new Date(e.start), d));
  }

  // 주간뷰와 동일한 계산(computeFreeBlocks)을 재사용해 이 날짜의 빈 시간
  // 블록 목록을 그대로 얻는다(요청 생성 시 기본 시간 범위로 사용).
  function freeBlocksFor(d) {
    const busy = busyIntervalsForDay(events, d);
    return computeFreeBlocks(busy, settings);
  }

  function handleFreeAreaClick(d, e) {
    e.stopPropagation();
    const blocks = freeBlocksFor(d);
    if (blocks.length === 0) return;
    const first = blocks[0];
    setDetailPopover(null);
    setCreatePopover({
      day: d,
      blockStart: first.start,
      blockEnd: first.end,
      startMin: first.start,
      endMin: Math.min(first.start + 30, first.end),
      x: e.clientX,
      y: e.clientY,
    });
  }

  function handleEventClick(ev, e) {
    e.stopPropagation();
    setCreatePopover(null);
    setDetailPopover({ event: ev, x: e.clientX, y: e.clientY });
  }

  async function handleSubmitRequest(payload) {
    const { day, blockStart, blockEnd } = createPopover;
    // 제출 시점에 다시 한 번 그 시간이 비어 있는지 확인(그 사이 다른 일정이
    // 생겼을 수 있음).
    const busy = busyIntervalsForDay(events, day);
    const free = computeFreeBlocks(busy, settings);
    const stillFree = free.some((f) => f.start <= payload.startMin && f.end >= payload.endMin);
    if (!stillFree) {
      return { error: '방금 다른 일정이 등록되었습니다. 다른 빈 시간을 선택해주세요.' };
    }
    const base = startOfDay(day);
    const start = addDaysMinutes(base, payload.startMin);
    const end = addDaysMinutes(base, payload.endMin);
    addRequest({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
    setCreatePopover(null);
    return { ok: true };
  }

  function addDaysMinutes(base, minutes) {
    return new Date(base.getTime() + minutes * 60000).toISOString();
  }

  return (
    <div className="month-wrap">
      <div className="month-grid month-grid-head">
        {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
          <div key={w} className="month-head-cell">{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d) => {
          const inMonth = d.getMonth() === monthAnchor.getMonth();
          const evts = dayEvents(d);
          const free = freeBlocksFor(d);
          return (
            <div
              key={dateKey(d)}
              className={`month-cell${inMonth ? '' : ' month-cell-out'}${isSameDay(d, today) ? ' month-cell-today' : ''}`}
            >
              <div className="month-cell-date">{d.getDate()}</div>
              <div className="month-cell-events">
                {evts.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={`month-event-chip ${STATUS_DOT[e.status] || ''}`}
                    onClick={(ev) => handleEventClick(e, ev)}
                  >
                    {e.title}
                  </div>
                ))}
                {evts.length > 3 && <div className="month-more">+{evts.length - 3}</div>}
              </div>
              {free.length > 0 && (
                <div className="month-free-area" onClick={(e) => handleFreeAreaClick(d, e)}>
                  <span>+ 일정 배정</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createPopover && (
        <RequestPopover
          anchor={{ x: createPopover.x, y: createPopover.y }}
          day={createPopover.day}
          blockStart={createPopover.blockStart}
          blockEnd={createPopover.blockEnd}
          initialStart={createPopover.startMin}
          initialEnd={createPopover.endMin}
          onClose={() => setCreatePopover(null)}
          onSubmit={handleSubmitRequest}
        />
      )}

      {detailPopover && (
        <EventDetailPopover
          event={detailPopover.event}
          anchor={{ x: detailPopover.x, y: detailPopover.y }}
          onClose={() => setDetailPopover(null)}
          dayWorkStart={settings.workStartMin}
          dayWorkEnd={settings.workEndMin}
        />
      )}
    </div>
  );
}
