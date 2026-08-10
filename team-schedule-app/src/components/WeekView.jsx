import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { getWeekdays, weekdayLabel, isSameDay, dateKey, addMinutes, startOfDay, computeFreeBlocks } from '../utils/time.js';
import { busyIntervalsForDay } from '../utils/eventHelpers.js';
import { useNow } from '../utils/useNow.js';
import TimeAxis from './TimeAxis.jsx';
import DayColumn from './DayColumn.jsx';
import RequestPopover from './RequestPopover.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';

export default function WeekView() {
  const { settings, currentWeekStart, events, addRequest } = useApp();
  const now = useNow();
  const days = getWeekdays(currentWeekStart);

  const [createPopover, setCreatePopover] = useState(null); // {day, blockStart, blockEnd, startMin, endMin, x, y}
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  function handleCreateRequest(payload) {
    setDetailPopover(null);
    setCreatePopover(payload);
  }

  function handleEventClick(ev, x, y) {
    setCreatePopover(null);
    setDetailPopover({ event: ev, x, y });
  }

  async function handleSubmitRequest(payload) {
    const { day, blockStart, blockEnd } = createPopover;
    // 중복 방지: 제출 시점에 다시 한 번 해당 시간이 비어 있는지 확인
    const busy = busyIntervalsForDay(events, day);
    const free = computeFreeBlocks(busy, settings);
    const stillFree = free.some((f) => f.start <= payload.startMin && f.end >= payload.endMin);
    if (!stillFree) {
      return { error: '방금 다른 일정이 등록되었습니다. 다른 빈 시간을 선택해주세요.' };
    }
    const base = startOfDay(day);
    const start = addMinutes(base, payload.startMin).toISOString();
    const end = addMinutes(base, payload.endMin).toISOString();
    addRequest({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
    setCreatePopover(null);
    return { ok: true };
  }

  return (
    <div className="week-wrap">
      <div className="week-header-row">
        <div className="week-header-axis-spacer" />
        {days.map((d) => {
          const today = isSameDay(d, now);
          return (
            <div key={dateKey(d)} className={`week-header-cell${today ? ' is-today' : ''}`}>
              <span className="wh-weekday">{weekdayLabel(d)}</span>
              <span className="wh-date">{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      <div className="week-body">
        <TimeAxis settings={settings} />
        {days.map((d) => (
          <DayColumn
            key={dateKey(d)}
            day={d}
            events={events}
            settings={settings}
            isToday={isSameDay(d, now)}
            now={now}
            onCreateRequest={handleCreateRequest}
            onEventClick={handleEventClick}
          />
        ))}
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
