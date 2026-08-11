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

// 월간 화면이 유일한 화면이다. 노란 "빈 시간" 박스/"+ 일정 배정" 문구는
// 쓰지 않고, 날짜 칸의 빈 공간 자체가 클릭 가능한 "일정 추가" 버튼 역할을
// 한다(호버 시에만 아주 작은 + 힌트를 보여줌). 이미 일정이 있는 칸도 빈
// 공간을 클릭하면 새 일정을 추가할 수 있다. 기존 일정 칩 클릭은
// stopPropagation으로 셀 클릭과 분리해 상세/수정 팝오버로만 이어진다.
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

  // 일정 추가 팝오버의 기본 시간 범위를 정할 때만 내부적으로 사용(화면에는
  // 더 이상 노란 박스로 표시하지 않음). 빈 시간이 없는 날(완전히 예약됨)은
  // 근무시간 전체를 기본 범위로 두고, 실제 겹침 여부는 제출 시 다시 확인한다.
  function firstFreeBlock(d) {
    const busy = busyIntervalsForDay(events, d);
    const blocks = computeFreeBlocks(busy, settings);
    if (blocks.length > 0) return blocks[0];
    return { start: settings.workStartMin, end: settings.workEndMin };
  }

  function handleCellClick(d) {
    const block = firstFreeBlock(d);
    setDetailPopover(null);
    setCreatePopover({
      day: d,
      blockStart: block.start,
      blockEnd: block.end,
      startMin: block.start,
      endMin: Math.min(block.start + 30, block.end),
      // 팝오버는 클릭 좌표 대신 셀 중앙 근처에 뜨도록 화면 중앙값을 씀
      // (날짜 칸 어디를 눌러도 팝업 위치가 안정적이도록).
      x: window.innerWidth / 2 - 140,
      y: window.innerHeight / 3,
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
      return { error: '해당 시간에 이미 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
    }
    const base = startOfDay(day);
    const start = new Date(base.getTime() + payload.startMin * 60000).toISOString();
    const end = new Date(base.getTime() + payload.endMin * 60000).toISOString();
    addRequest({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
    setCreatePopover(null);
    return { ok: true };
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
          return (
            <div
              key={dateKey(d)}
              className={`month-cell${inMonth ? '' : ' month-cell-out'}${isSameDay(d, today) ? ' month-cell-today' : ''}`}
              onClick={() => handleCellClick(d)}
            >
              <div className="month-cell-date">{d.getDate()}</div>
              {evts.length > 0 && (
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
              )}
              <span className="month-cell-plus-hint">+</span>
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
