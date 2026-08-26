import React, { useEffect, useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, dateKey, getWeekStart, isSameDay, startOfDay, computeFreeBlocks, formatHM } from '../utils/time.js';
import { busyIntervalsForDay } from '../utils/eventHelpers.js';
import RequestPopover from './RequestPopover.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';

// 두 가지 출처가 색으로 구분된다:
// - source==='google' (팀장 Google 확정 일정): 파란 계열
// - source==='shared_team_calendar' (다른 팀 Firebase에서 가져온 팀장님
//   관련 일정, 읽기 전용): 연한 회색 계열
function chipClass(e) {
  if (e.source === 'shared_team_calendar') return 'dot-shared';
  return 'dot-confirmed';
}

// 실제 겹치는 일정이 있는지만 확인한다(근무시간 범위로 자르지 않음 — 자유
// 시간 입력을 막지 않기 위해 work hour 제한은 여기서 아예 걷어냈다).
function hasOverlap(busyIntervals, startMin, endMin) {
  return busyIntervals.some((b) => b.start < endMin && startMin < b.end);
}

// 팀장 Google 일정 + 공유 일정(다른 팀 Firebase, 휴가/반차 포함) 기준으로
// "N시 이후 가능" 같은 짧은 요약을 만든다.
function freeTimeLabel(teamBusy, settings) {
  const free = computeFreeBlocks(teamBusy, settings);
  if (free.length === 0) return null;
  const workTotal = (settings.workEndMin - settings.workStartMin) - (settings.lunchEndMin - settings.lunchStartMin);
  const freeTotal = free.reduce((sum, f) => sum + (f.end - f.start), 0);
  if (freeTotal >= workTotal) return '종일 가능';
  // 근무 종료 시각까지 이어지는 빈 시간이 있으면 "N시 이후 가능"
  const trailing = free.find((f) => f.end >= settings.workEndMin);
  if (trailing) {
    return trailing.start % 60 === 0
      ? `${Math.floor(trailing.start / 60)}시 이후 가능`
      : `${formatHM(trailing.start)} 이후 가능`;
  }
  // 근무 시작 시각부터 이어지는 빈 시간만 있으면(오후에 일정이 있는 경우) "오전 가능"
  if (free.some((f) => f.start <= settings.workStartMin)) return '오전 가능';
  return null;
}

// 월간 화면이 유일한 화면이다. 날짜 칸의 빈 흰 공간을 클릭해도 아무 동작이
// 없다 — 일정 추가는 반드시 각 칸의 `+` 버튼을 눌러야만 시작된다(실수로
// 눌리는 것을 막기 위해 명시적인 + 버튼 방식). 일정 카드 클릭은 + 버튼과는
// 완전히 분리된 별도 요소라 상세/수정 팝오버로만 이어진다.
// 시작/종료 시간은 30분 단위 선택지가 아니라 자유 입력(<input type="time">)
// 이며, 근무시간(09~18시) 범위 밖이어도 그대로 등록/수정할 수 있다.
export default function MonthView() {
  const { cursorDate, events, settings, addEvent, focusedEvent, clearFocusedEvent } = useApp();
  const today = startOfDay(new Date());

  // createPopover: {day, startMin, endMin, x, y}
  const [createPopover, setCreatePopover] = useState(null);
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  // 상단 검색창에서 결과를 클릭하면 store가 cursorDate를 그 일정의 달로
  // 옮기고 focusedEvent를 채운다 — 여기서는 그 달 화면이 뜬 뒤 곧바로
  // 상세 팝오버를 열어주기만 하고, 다시 검색하지 못하도록 바로 비운다.
  useEffect(() => {
    if (!focusedEvent) return;
    setCreatePopover(null);
    setDetailPopover({
      event: focusedEvent,
      x: window.innerWidth / 2 - 140,
      y: window.innerHeight / 3,
    });
    clearFocusedEvent();
  }, [focusedEvent, clearFocusedEvent]);

  // cursorDate가 속한 달을 기준으로 월 전체 그리드(항상 6주) 구성
  const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthAnchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  function dayEvents(d) {
    return events.filter((e) => isSameDay(new Date(e.start), d));
  }

  // `+` 버튼을 눌렀을 때만 호출된다(빈 칸 클릭으로는 절대 호출되지 않음).
  function handleAddClick(d, e) {
    e.stopPropagation();
    setDetailPopover(null);
    setCreatePopover({
      day: d,
      // 시간 입력 필드의 초기값일 뿐, 사용자가 자유롭게 바꿀 수 있다.
      startMin: settings.workStartMin,
      endMin: settings.workStartMin + 60,
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
    const { day } = createPopover;
    // 제출 시점에 다시 한 번 겹치는 일정이 없는지 확인(그 사이 다른 일정이
    // 생겼을 수 있음).
    const busy = busyIntervalsForDay(events, day);
    if (hasOverlap(busy, payload.startMin, payload.endMin)) {
      return { error: '해당 시간에 이미 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
    }
    const base = startOfDay(day);
    const start = new Date(base.getTime() + payload.startMin * 60000).toISOString();
    const end = new Date(base.getTime() + payload.endMin * 60000).toISOString();
    const result = await addEvent({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
    if (result?.error) return { error: result.error };
    setCreatePopover(null);
    return { ok: true };
  }

  return (
    <div className="month-wrap">
      <div className="month-grid month-grid-head">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
          <div key={w} className="month-head-cell">{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d) => {
          const inMonth = d.getMonth() === monthAnchor.getMonth();
          const evts = dayEvents(d);
          const label = freeTimeLabel(busyIntervalsForDay(events, d), settings);
          return (
            <div
              key={dateKey(d)}
              className={`month-cell${inMonth ? '' : ' month-cell-out'}${isSameDay(d, today) ? ' month-cell-today' : ''}`}
            >
              <div className="month-cell-head">
                <span className="month-cell-date">{d.getDate()}</span>
                <button
                  className="month-cell-add-btn"
                  onClick={(e) => handleAddClick(d, e)}
                  aria-label="일정 추가"
                  title="일정 추가"
                >
                  +
                </button>
              </div>
              {evts.length > 0 && (
                <div className="month-cell-events">
                  {evts.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`month-event-chip ${chipClass(e)}`}
                      onClick={(ev) => handleEventClick(e, ev)}
                    >
                      {e.source === 'shared_team_calendar' && (
                        <span className="month-chip-source-tag">공유</span>
                      )}
                      <span className="month-chip-title">{e.title}</span>
                    </div>
                  ))}
                  {evts.length > 3 && <div className="month-more">+{evts.length - 3}</div>}
                </div>
              )}
              {label && <div className="month-cell-free">{label}</div>}
            </div>
          );
        })}
      </div>

      {createPopover && (
        <RequestPopover
          anchor={{ x: createPopover.x, y: createPopover.y }}
          day={createPopover.day}
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
        />
      )}
    </div>
  );
}
