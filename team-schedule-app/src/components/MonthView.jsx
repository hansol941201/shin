import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, dateKey, getWeekStart, isSameDay, startOfDay } from '../utils/time.js';
import { busyIntervalsForDay } from '../utils/eventHelpers.js';
import RequestPopover from './RequestPopover.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';
import woodpeckerIcon from '../assets/woodpecker.png';

// 한솔이 요청한 일정(source==='platform')은 상태별로 색이 다르다 — 팀장이
// Google에 직접 등록한 일반 일정(source==='google')은 기존 파란 계열
// 그대로 두고, 한솔 요청은 승인대기/확정=분홍, 시간변경 요청=주황,
// 거절=빨강으로 색만 봐도 처리 결과를 바로 알 수 있게 한다.
function chipClass(e) {
  if (e.source !== 'platform') return 'dot-confirmed';
  if (e.status === 'reschedule_requested') return 'dot-reschedule';
  if (e.status === 'rejected') return 'dot-rejected';
  return 'dot-pending';
}

// 상태별 짧은 배지. 승인대기는 문구 대신 체크 표시(✓)로 짧게 표시한다.
function chipBadge(e) {
  if (e.source !== 'platform') return null;
  if (e.status === 'confirmed') return '확정';
  if (e.status === 'reschedule_requested') return '시간변경 요청';
  if (e.status === 'pending') return '✓';
  if (e.status === 'rejected') return e.rejectionReason === 'unavailable' ? '일정 불가' : '거절';
  return null;
}

// 실제 겹치는 일정이 있는지만 확인한다(근무시간 범위로 자르지 않음 — 자유
// 시간 입력을 막지 않기 위해 work hour 제한은 여기서 아예 걷어냈다).
function hasOverlap(busyIntervals, startMin, endMin) {
  return busyIntervals.some((b) => b.start < endMin && startMin < b.end);
}

// 월간 화면이 유일한 화면이다. 노란 "빈 시간" 박스/"+ 일정 배정" 문구는
// 쓰지 않고, 날짜 칸의 빈 공간 자체가 클릭 가능한 "일정 추가" 버튼 역할을
// 한다(호버 시에만 아주 작은 + 힌트를 보여줌). 이미 일정이 있는 칸도 빈
// 공간을 클릭하면 새 일정을 추가할 수 있다. 기존 일정 칩 클릭은
// stopPropagation으로 셀 클릭과 분리해 상세/수정 팝오버로만 이어진다.
// 시작/종료 시간은 30분 단위 선택지가 아니라 자유 입력(<input type="time">)
// 이며, 근무시간(09~18시) 범위 밖이어도 그대로 등록/수정할 수 있다.
export default function MonthView() {
  const { cursorDate, events, settings, addRequest, role } = useApp();
  const today = startOfDay(new Date());

  const [createPopover, setCreatePopover] = useState(null); // {day, startMin, endMin, x, y}
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  // cursorDate가 속한 달을 기준으로 월 전체 그리드(항상 6주) 구성
  const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthAnchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  // 우측 상단 [팀장 | 한솔] 필터에 따라 보여줄 일정을 나눈다.
  // - 팀장: 팀장님의 실제 일정(Google 기본 일정) + 팀장님이 확인/처리해야
  //   하는 한솔의 모든 요청(승인대기/시간변경/거절/수락 완료)까지 전부
  //   보여준다 — 승인대기를 캘린더에서 숨기면 놓치기 쉬우므로 반드시 표시한다.
  // - 한솔: 한솔이 팀장님께 요청한 일정만(승인대기/시간변경/거절/수락 완료).
  //   팀장이 Google에 직접 등록한 일반 일정은 숨긴다.
  // 거절된 요청도 이제 빨간색으로 계속 표시해 한솔이 처리 결과를 놓치지
  // 않게 한다(예전에는 화면에서 완전히 숨겼음).
  // source/requester는 store.jsx가 명시적으로 채워 넣는 값이라 여기서는
  // 그 값만 그대로 사용한다(ID/상태 추측 금지).
  function visibleByRole(e) {
    if (role === 'manager') return true;
    return e.source === 'platform';
  }

  function dayEvents(d) {
    return events.filter((e) => visibleByRole(e) && isSameDay(new Date(e.start), d));
  }

  function handleCellClick(d) {
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
    // 생겼을 수 있음). 근무시간 범위로 자르지 않고 실제 일정끼리만 비교한다.
    const busy = busyIntervalsForDay(events, day);
    if (hasOverlap(busy, payload.startMin, payload.endMin)) {
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
                      className={`month-event-chip ${chipClass(e)}`}
                      onClick={(ev) => handleEventClick(e, ev)}
                    >
                      {e.source === 'platform' && (
                        <img className="month-chip-icon" src={woodpeckerIcon} alt="한솔 요청" />
                      )}
                      <span className="month-chip-title">{e.title}</span>
                      {chipBadge(e) && <span className="month-chip-badge">{chipBadge(e)}</span>}
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
