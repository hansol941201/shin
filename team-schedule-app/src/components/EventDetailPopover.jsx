import React, { useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM, parseHM, dateKey } from '../utils/time.js';
import { useApp } from '../state/store.jsx';

// 일정 카드 클릭 시 뜨는 상세/수정/삭제 팝오버. 시작/종료 시간은 30분
// 단위 선택지가 아니라 <input type="time">으로 자유롭게 입력한다
// (RequestPopover와 동일한 패턴 — 근무시간 범위에 갇히지 않음).
export default function EventDetailPopover({ event: eventProp, anchor, onClose }) {
  const { events, updateEvent, deleteEventAction } = useApp();
  // 팝오버를 연 시점의 event는 클릭 당시 스냅샷이라, 같은 id의 최신 버전이
  // events 배열에 있으면 그걸 우선 써서 팝오버가 열려 있는 동안에도 즉시
  // 최신 상태(시간 변경 등)를 보여준다 — 원본이 삭제된 경우에만 스냅샷을
  // 그대로 쓴다.
  const event = events.find((e) => e.id === eventProp.id) || eventProp;
  // 'view' | 'edit-form' | 'delete-confirm'
  const [mode, setMode] = useState('view');
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 수정 폼 필드
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);
  const [editLocation, setEditLocation] = useState('');
  const [editMemo, setEditMemo] = useState('');

  const start = new Date(event.start);
  const end = new Date(event.end);
  const dateLabel = `${start.getMonth() + 1}월 ${start.getDate()}일 (${'일월화수목금토'[start.getDay()]})`;
  const timeLabel = event.allDay
    ? '종일'
    : `${formatHM(start.getHours() * 60 + start.getMinutes())} ~ ${formatHM(end.getHours() * 60 + end.getMinutes())}`;

  // 다른 팀 Firebase에서 가져온 공유 일정은 완전히 읽기 전용이다 —
  // 수정/삭제 등 어떤 액션 버튼도 두지 않고 정보만 보여준다. source와
  // readOnly 플래그를 이중으로 검사해 실수로라도 아래의 수정/삭제 로직에
  // 도달하지 않게 한다.
  if (event.source === 'shared_team_calendar' || event.readOnly) {
    return (
      <PopoverShell anchor={anchor} onClose={onClose} width={296}>
        <div className="pv-head">
          <span className="pv-status-badge pv-status-shared">공유 일정</span>
          <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="pv-title">{event.title}</div>
        <div className="pv-meta">{dateLabel}</div>
        <div className="pv-meta">
          {timeLabel}
          {event.approximateTime && <span className="pv-hint-inline"> (종료시간은 추정값)</span>}
        </div>
        {event.location && <div className="pv-meta">📍 {event.location}</div>}
        {event.assignee && <div className="pv-meta">담당자: {event.assignee}</div>}
        {event.attendees?.length > 0 && (
          <div className="pv-meta">참석자: {event.attendees.join(', ')}</div>
        )}
        {event.memo && <div className="pv-memo">{event.memo}</div>}
        <div className="pv-hint" style={{ marginTop: 8 }}>
          다른 팀 프로그램에서 가져온 읽기 전용 일정입니다. 수정·삭제는 원본 프로그램에서만 가능합니다.
        </div>
      </PopoverShell>
    );
  }

  function beginEdit() {
    setEditTitle(event.title);
    setEditDate(dateKey(start));
    setEditStart(start.getHours() * 60 + start.getMinutes());
    setEditEnd(end.getHours() * 60 + end.getMinutes());
    setEditLocation(event.location || '');
    setEditMemo(event.memo || '');
    setActionError('');
    setMode('edit-form');
  }

  async function submitEdit() {
    if (editEnd <= editStart) {
      setActionError('종료시간은 시작시간보다 늦어야 합니다.');
      return;
    }
    if (!editTitle.trim()) {
      setActionError('일정명을 입력해주세요.');
      return;
    }
    const dayBase = new Date(`${editDate}T00:00:00`);
    const nextStart = new Date(dayBase.getTime() + editStart * 60000).toISOString();
    const nextEnd = new Date(dayBase.getTime() + editEnd * 60000).toISOString();

    setActionError('');
    setSubmitting(true);
    const res = await updateEvent(event.id, {
      title: editTitle.trim(),
      start: nextStart,
      end: nextEnd,
      location: editLocation.trim(),
      memo: editMemo.trim(),
    });
    setSubmitting(false);
    if (res?.error) {
      setActionError(res.error);
      return;
    }
    onClose();
  }

  async function confirmDelete() {
    setActionError('');
    setSubmitting(true);
    const res = await deleteEventAction(event.id);
    setSubmitting(false);
    if (res?.error) {
      setActionError(res.error);
      return;
    }
    onClose();
  }

  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={296}>
      <div className="pv-head">
        <span className="pv-status-badge pv-status-confirmed">확정</span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      {mode === 'view' && (
        <>
          <div className="pv-title">{event.title}</div>
          <div className="pv-meta">{dateLabel}</div>
          <div className="pv-meta">{timeLabel}</div>
          {event.location && <div className="pv-meta">📍 {event.location}</div>}
          {event.memo && <div className="pv-memo">{event.memo}</div>}

          {actionError && <div className="pv-error">{actionError}</div>}

          <div className="pv-actions pv-actions-editrow">
            <button className="pv-btn" onClick={beginEdit} disabled={submitting}>수정</button>
            <button className="pv-btn pv-btn-danger-outline" onClick={() => setMode('delete-confirm')} disabled={submitting}>삭제</button>
          </div>
        </>
      )}

      {mode === 'edit-form' && (
        <>
          <div className="pv-title">일정 수정</div>
          <div className="pv-edit-form">
            <label className="pv-edit-label">
              일정명
              <input
                className="pv-edit-input"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            <label className="pv-edit-label">
              날짜
              <input
                className="pv-edit-input"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </label>
            <div className="pv-row pv-row-time">
              <input
                type="time"
                className="pv-time-input"
                value={formatHM(editStart)}
                onChange={(e) => setEditStart(parseHM(e.target.value))}
              />
              <span className="pv-tilde">~</span>
              <input
                type="time"
                className="pv-time-input"
                value={formatHM(editEnd)}
                onChange={(e) => setEditEnd(parseHM(e.target.value))}
              />
            </div>
            <label className="pv-edit-label">
              장소
              <input
                className="pv-edit-input"
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
              />
            </label>
            <label className="pv-edit-label">
              메모
              <textarea
                className="pv-edit-textarea"
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
              />
            </label>
          </div>
          {actionError && <div className="pv-error">{actionError}</div>}
          <div className="pv-actions">
            <button className="pv-btn pv-btn-primary" onClick={submitEdit} disabled={submitting}>
              {submitting ? '저장 중…' : '저장'}
            </button>
            <button className="pv-btn" onClick={() => setMode('view')} disabled={submitting}>취소</button>
          </div>
        </>
      )}

      {mode === 'delete-confirm' && (
        <>
          <div className="pv-title">{event.title}</div>
          <div className="pv-meta">{dateLabel} · {timeLabel}</div>
          <div className="pv-confirm-text">이 일정을 삭제하시겠습니까?</div>
          {actionError && <div className="pv-error">{actionError}</div>}
          <div className="pv-actions">
            <button className="pv-btn" onClick={() => setMode('view')} disabled={submitting}>취소</button>
            <button className="pv-btn pv-btn-danger" disabled={submitting} onClick={confirmDelete}>
              {submitting ? '처리 중…' : '삭제'}
            </button>
          </div>
        </>
      )}
    </PopoverShell>
  );
}
