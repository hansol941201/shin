import React, { useRef, useState } from 'react';
import { computeFreeBlocks } from '../utils/time.js';
import { eventsForDay } from '../utils/eventHelpers.js';
import { formatHM, minutesOfDay } from '../utils/time.js';

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
function snap30(v) {
  return Math.round(v / 30) * 30;
}

const STATUS_BADGE = {
  pending: '승인대기',
  reschedule_requested: '시간변경',
};

export default function DayColumn({ day, events, settings, isToday, now, onCreateRequest, onEventClick }) {
  const colRef = useRef(null);
  const [drag, setDrag] = useState(null); // { block, anchor, current }

  const { workStartMin, workEndMin, lunchStartMin, lunchEndMin } = settings;
  const total = workEndMin - workStartMin;

  const dayEvents = eventsForDay(events, day);
  const busyIntervals = dayEvents.map((e) => ({
    start: minutesOfDay(new Date(e.start)),
    end: minutesOfDay(new Date(e.end)),
  }));
  const freeBlocks = computeFreeBlocks(busyIntervals, settings);

  function pixelToMinute(clientY) {
    const rect = colRef.current.getBoundingClientRect();
    const ratio = clamp((clientY - rect.top) / rect.height, 0, 1);
    return workStartMin + ratio * total;
  }

  function pct(min) {
    return ((min - workStartMin) / total) * 100;
  }

  function handleFreeMouseDown(e, block) {
    e.preventDefault();
    e.stopPropagation();
    const raw = pixelToMinute(e.clientY);
    const anchor = clamp(snap30(raw), block.start, Math.max(block.start, block.end - 30));
    let state = { block, anchor, current: anchor };
    setDrag(state);

    function onMove(ev) {
      const m = clamp(snap30(pixelToMinute(ev.clientY)), block.start, block.end);
      state = { ...state, current: m };
      setDrag(state);
    }
    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDrag(null);
      let s = Math.min(state.anchor, state.current);
      let en = Math.max(state.anchor, state.current);
      if (en - s < 30) en = Math.min(s + 30, block.end);
      if (en - s < 30) return;
      onCreateRequest({ day, blockStart: block.start, blockEnd: block.end, startMin: s, endMin: en, x: ev.clientX, y: ev.clientY });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const hourMarks = [];
  for (let m = workStartMin; m <= workEndMin; m += 60) hourMarks.push(m);
  const halfMarks = [];
  for (let m = workStartMin + 30; m < workEndMin; m += 60) halfMarks.push(m);

  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null;
  const showNowLine = isToday && nowMin !== null && nowMin >= workStartMin && nowMin <= workEndMin;

  return (
    <div className={`day-col${isToday ? ' day-col-today' : ''}`} ref={colRef}>
      {hourMarks.map((m) => (
        <div key={`h${m}`} className="gridline gridline-hour" style={{ top: `${pct(m)}%` }} />
      ))}
      {halfMarks.map((m) => (
        <div key={`hh${m}`} className="gridline gridline-half" style={{ top: `${pct(m)}%` }} />
      ))}

      {lunchEndMin > workStartMin && lunchStartMin < workEndMin && (
        <div
          className="lunch-block"
          style={{ top: `${pct(Math.max(lunchStartMin, workStartMin))}%`, height: `${pct(Math.min(lunchEndMin, workEndMin)) - pct(Math.max(lunchStartMin, workStartMin))}%` }}
        >
          <span>점심</span>
        </div>
      )}

      {freeBlocks.map((b) => {
        const durationMin = b.end - b.start;
        const showHint = durationMin >= 55;
        return (
          <div
            key={`free-${b.start}`}
            className="free-block"
            style={{ top: `${pct(b.start)}%`, height: `${pct(b.end) - pct(b.start)}%` }}
            onMouseDown={(e) => handleFreeMouseDown(e, b)}
          >
            <div className="free-block-inner">
              <span className="free-time">{formatHM(b.start)}–{formatHM(b.end)}</span>
              {showHint && <span className="free-cta">+ 일정 배정</span>}
            </div>
          </div>
        );
      })}

      {drag && (
        <div
          className="drag-overlay"
          style={{
            top: `${pct(Math.min(drag.anchor, drag.current))}%`,
            height: `${pct(Math.max(drag.anchor, drag.current)) - pct(Math.min(drag.anchor, drag.current))}%`,
          }}
        >
          {formatHM(Math.min(drag.anchor, drag.current))}–{formatHM(Math.max(drag.anchor, drag.current))}
        </div>
      )}

      {dayEvents.map((ev) => {
        const s = minutesOfDay(new Date(ev.start));
        const en = minutesOfDay(new Date(ev.end));
        const cls =
          ev.status === 'confirmed'
            ? 'event-block event-confirmed'
            : ev.status === 'pending'
            ? 'event-block event-pending'
            : 'event-block event-reschedule';
        return (
          <div
            key={ev.id}
            className={cls}
            style={{ top: `${pct(s)}%`, height: `${Math.max(pct(en) - pct(s), 3)}%` }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => onEventClick(ev, e.clientX, e.clientY)}
          >
            {STATUS_BADGE[ev.status] && <span className="event-badge">{STATUS_BADGE[ev.status]}</span>}
            {ev.status === 'confirmed' && <span className="event-check">✓</span>}
            <div className="event-time">{ev.allDay ? '종일' : `${formatHM(s)}–${formatHM(en)}`}</div>
            <div className="event-title">{ev.title}</div>
            {ev.location && <div className="event-location">{ev.location}</div>}
          </div>
        );
      })}

      {showNowLine && (
        <div className="now-line" style={{ top: `${pct(nowMin)}%` }}>
          <span className="now-line-label">{formatHM(nowMin)}</span>
        </div>
      )}
    </div>
  );
}
