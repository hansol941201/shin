import React from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, dateKey, getWeekStart, isSameDay, startOfDay } from '../utils/time.js';

const STATUS_DOT = {
  confirmed: 'dot-confirmed',
  pending: 'dot-pending',
  reschedule_requested: 'dot-pending',
};

export default function MonthView() {
  const { cursorDate, setCursorDate, setView, events } = useApp();
  const today = startOfDay(new Date());

  // cursorDate가 속한 달을 기준으로 월 전체 그리드(항상 6주) 구성
  const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthAnchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function dayEvents(d) {
    return events.filter((e) => e.status !== 'rejected' && isSameDay(new Date(e.start), d));
  }

  function handlePick(d) {
    setCursorDate(d);
    setView('week');
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
              onClick={() => handlePick(d)}
            >
              <div className="month-cell-date">{d.getDate()}</div>
              <div className="month-cell-events">
                {evts.slice(0, 3).map((e) => (
                  <div key={e.id} className={`month-event-chip ${STATUS_DOT[e.status] || ''}`}>{e.title}</div>
                ))}
                {evts.length > 3 && <div className="month-more">+{evts.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
