import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, dateKey, getWeekStart, isSameDay, startOfDay, computeFreeBlocks, formatHM } from '../utils/time.js';
import { busyIntervalsForDay } from '../utils/eventHelpers.js';
import RequestPopover from './RequestPopover.jsx';
import PersonalEventPopover from './PersonalEventPopover.jsx';
import CreateKindPopover from './CreateKindPopover.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';
import woodpeckerIcon from '../assets/woodpecker.png';

// 네 가지 출처가 색으로 한눈에 구분된다:
// - source==='google' (팀장 Google 기본 일정): 기존 파란 계열
// - source==='shared_team_calendar' (다른 팀 Firebase에서 가져온 팀장님
//   관련 일정, 읽기 전용): 연한 보라 계열
// - source==='platform' (한솔 → 팀장 요청): 승인대기/확정=분홍, 시간변경
//   요청=주황, 거절=빨강 — 상태에 따라 처리 결과가 바로 보인다.
// - source==='hansol_personal' (한솔 개인 일정, 승인 절차 없음): 노란 계열
function chipClass(e) {
  if (e.source === 'hansol_personal') return 'dot-personal';
  if (e.source === 'shared_team_calendar') return 'dot-shared';
  if (e.source !== 'platform') return 'dot-confirmed';
  if (e.status === 'reschedule_requested') return 'dot-reschedule';
  if (e.status === 'rejected') return 'dot-rejected';
  return 'dot-pending';
}

// 상태별 짧은 배지. 승인대기는 문구 대신 체크 표시(✓)로 짧게 표시한다.
// 개인 일정은 색만으로 이미 구분되므로 배지를 따로 붙이지 않는다.
// 한솔 동행이 켜진 일정(주로 팀장 Google 일정)은 출처와 무관하게 "동행"
// 배지를 최우선으로 보여준다.
function chipBadge(e) {
  if (e.hansolAccompany) return '동행';
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

// 팀장 Google 일정 + 공유 일정(다른 팀 Firebase, 휴가/반차 포함)만 기준으로
// "N시 이후 가능" 같은 짧은 요약을 만든다. 한솔 개인 일정/요청은 팀장님의
// 실제 가능 여부와 무관하므로 절대 섞지 않는다.
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
// 없다 — 일정 추가는 반드시 각 칸의 `+` 버튼을 눌러야만 시작된다(예전에는
// 빈 공간 전체가 클릭 가능한 "일정 추가" 버튼이었지만, 실수로 눌리는 것을
// 막기 위해 명시적인 + 버튼 방식으로 바꿨다). 일정 카드 클릭은 + 버튼과는
// 완전히 분리된 별도 요소라 상세/수정 팝오버로만 이어진다.
// 시작/종료 시간은 30분 단위 선택지가 아니라 자유 입력(<input type="time">)
// 이며, 근무시간(09~18시) 범위 밖이어도 그대로 등록/수정할 수 있다.
export default function MonthView() {
  const { cursorDate, events, settings, addRequest, addPersonalEvent, role } = useApp();
  const today = startOfDay(new Date());

  // createPopover: {day, startMin, endMin, x, y, kind}
  // kind: null(한솔 화면에서 아직 "요청/개인 일정" 선택 전) | 'request' | 'personal'
  const [createPopover, setCreatePopover] = useState(null);
  const [detailPopover, setDetailPopover] = useState(null); // {event, x, y}

  // cursorDate가 속한 달을 기준으로 월 전체 그리드(항상 6주) 구성
  const monthAnchor = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = getWeekStart(monthAnchor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  // 우측 상단 [팀장 | 한솔] 필터에 따라 보여줄 일정을 나눈다.
  // - 팀장: 팀장님의 실제 일정(Google 기본 일정) + 팀장님이 확인/처리해야
  //   하는 한솔의 모든 요청(승인대기/시간변경/거절/수락 완료)까지 전부
  //   보여준다 — 승인대기를 캘린더에서 숨기면 놓치기 쉬우므로 반드시 표시한다.
  //   한솔 개인 일정(source==='hansol_personal')은 팀장 업무와 무관하므로
  //   팀장 화면에서는 숨긴다.
  // - 한솔: 팀장 Google 일정 + 한솔이 팀장님께 요청한 일정(승인대기/시간변경/
  //   거절/수락 완료) + 한솔 개인 일정까지 전부 보여준다 — "팀장님 일정 +
  //   내 요청 + 내 개인 일정"을 한 화면에서 같이 보는 것이 목표.
  // source/requester는 store.jsx가 명시적으로 채워 넣는 값이라 여기서는
  // 그 값만 그대로 사용한다(ID/상태 추측 금지).
  function visibleByRole(e) {
    if (e.source === 'hansol_personal') return role === 'coordinator';
    return true;
  }

  function dayEvents(d) {
    return events.filter((e) => visibleByRole(e) && isSameDay(new Date(e.start), d));
  }

  // `+` 버튼을 눌렀을 때만 호출된다(빈 칸 클릭으로는 절대 호출되지 않음).
  function handleAddClick(d, e) {
    e.stopPropagation();
    setDetailPopover(null);
    const base = {
      day: d,
      // 시간 입력 필드의 초기값일 뿐, 사용자가 자유롭게 바꿀 수 있다.
      startMin: settings.workStartMin,
      endMin: settings.workStartMin + 60,
      // 팝오버는 클릭 좌표 대신 셀 중앙 근처에 뜨도록 화면 중앙값을 씀
      // (날짜 칸 어디를 눌러도 팝업 위치가 안정적이도록).
      x: window.innerWidth / 2 - 140,
      y: window.innerHeight / 3,
    };
    // 한솔 화면에서만 "팀장님께 요청 / 한솔 개인 일정"을 먼저 고른다.
    // 팀장 화면은 개인 일정 개념이 없으므로 기존처럼 바로 요청 폼을 연다.
    setCreatePopover({ ...base, kind: role === 'coordinator' ? null : 'request' });
  }

  function handleEventClick(ev, e) {
    e.stopPropagation();
    setCreatePopover(null);
    setDetailPopover({ event: ev, x: e.clientX, y: e.clientY });
  }

  async function handleSubmitRequest(payload) {
    const { day } = createPopover;
    // 제출 시점에 다시 한 번 겹치는 일정이 없는지 확인(그 사이 다른 일정이
    // 생겼을 수 있음). 근무시간 범위로 자르지 않고 실제 일정끼리만 비교
    // 하되, 한솔 개인 일정은 팀장님과 무관한 별개 일정이므로 "이미 다른
    // 일정이 있습니다" 하드 차단 대상에서는 제외하고 아래에서 경고로만
    // 안내한다.
    const teamEvents = events.filter((e) => e.source !== 'hansol_personal');
    const busy = busyIntervalsForDay(teamEvents, day);
    if (hasOverlap(busy, payload.startMin, payload.endMin)) {
      return { error: '해당 시간에 이미 다른 일정이 있습니다.\n다른 시간을 선택해주세요.' };
    }
    if (!payload.force) {
      const personalEvents = events.filter((e) => e.source === 'hansol_personal');
      const personalBusy = busyIntervalsForDay(personalEvents, day);
      if (hasOverlap(personalBusy, payload.startMin, payload.endMin)) {
        return {
          warning: '이 시간에는 한솔 개인 일정이 있습니다.\n그래도 팀장님께 요청하시겠습니까?',
        };
      }
    }
    const base = startOfDay(day);
    const start = new Date(base.getTime() + payload.startMin * 60000).toISOString();
    const end = new Date(base.getTime() + payload.endMin * 60000).toISOString();
    addRequest({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
    setCreatePopover(null);
    return { ok: true };
  }

  // 한솔 개인 일정은 팀장님 승인 절차/겹침 차단이 없다 — 저장 즉시 확정.
  async function handleSubmitPersonal(payload) {
    const { day } = createPopover;
    const base = startOfDay(day);
    const start = new Date(base.getTime() + payload.startMin * 60000).toISOString();
    const end = new Date(base.getTime() + payload.endMin * 60000).toISOString();
    addPersonalEvent({ title: payload.title, location: payload.location, memo: payload.memo, start, end });
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
          // 가능 시간 요약은 팀장 Google 일정 + 공유 일정(휴가/반차 포함)만
          // 기준으로 계산하고(한솔 개인/요청 일정 절대 섞지 않음), 너무
          // 복잡해지지 않도록 한솔 화면에서만 보여준다.
          const label = role === 'coordinator'
            ? freeTimeLabel(
                busyIntervalsForDay(
                  events.filter((e) => e.source === 'google' || e.source === 'shared_team_calendar'),
                  d
                ),
                settings
              )
            : null;
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
                      {e.source === 'platform' && (
                        <img className="month-chip-icon" src={woodpeckerIcon} alt="한솔 요청" />
                      )}
                      {e.source === 'shared_team_calendar' && (
                        <span className="month-chip-source-tag">공유</span>
                      )}
                      <span className="month-chip-title">{e.title}</span>
                      {chipBadge(e) && (
                        <span className={`month-chip-badge${e.hansolAccompany ? ' month-chip-badge-accompany' : ''}`}>
                          {chipBadge(e)}
                        </span>
                      )}
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

      {createPopover && createPopover.kind === null && (
        <CreateKindPopover
          anchor={{ x: createPopover.x, y: createPopover.y }}
          day={createPopover.day}
          onClose={() => setCreatePopover(null)}
          onPick={(kind) => setCreatePopover({ ...createPopover, kind })}
        />
      )}

      {createPopover && createPopover.kind === 'request' && (
        <RequestPopover
          anchor={{ x: createPopover.x, y: createPopover.y }}
          day={createPopover.day}
          initialStart={createPopover.startMin}
          initialEnd={createPopover.endMin}
          onClose={() => setCreatePopover(null)}
          onSubmit={handleSubmitRequest}
        />
      )}

      {createPopover && createPopover.kind === 'personal' && (
        <PersonalEventPopover
          anchor={{ x: createPopover.x, y: createPopover.y }}
          day={createPopover.day}
          initialStart={createPopover.startMin}
          initialEnd={createPopover.endMin}
          onClose={() => setCreatePopover(null)}
          onSubmit={handleSubmitPersonal}
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
