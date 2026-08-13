import React, { useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM, parseHM, dateKey } from '../utils/time.js';
import { useApp } from '../state/store.jsx';

const STATUS_LABEL = {
  confirmed: '확정',
  pending: '승인대기',
  reschedule_requested: '시간변경 요청',
  rejected: '거절됨',
};

// 거절 사유에 따른 표시 문구. '일정 불가'는 그대로, '기타'는 "거절"로
// 짧게 표시하고 상세 사유는 별도 줄에 보여준다.
function rejectionLabel(e) {
  return e.rejectionReason === 'unavailable' ? '일정 불가' : '거절';
}

// 일정 블록(확정/승인대기/시간변경) 클릭 시 뜨는 상세/액션 팝오버.
// 시작/종료 시간은 30분 단위 선택지가 아니라 <input type="time">으로 자유롭게
// 입력한다(RequestPopover와 동일한 패턴 — 근무시간 범위에 갇히지 않음).
export default function EventDetailPopover({ event, anchor, onClose }) {
  const {
    role,
    acceptRequest,
    rejectRequest,
    proposeReschedule,
    acceptReschedule,
    cancelReschedule,
    cancelOwnRequest,
    updateEvent,
    deleteEventAction,
  } = useApp();
  // 'view' | 'reschedule-form' | 'edit-form' | 'delete-confirm' | 'reject-reason'
  const [mode, setMode] = useState('view');
  const [newStart, setNewStart] = useState(null);
  const [newEnd, setNewEnd] = useState(null);
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 거절 사유 선택 폼
  const [rejectReason, setRejectReason] = useState('unavailable'); // 'unavailable' | 'reschedule_request' | 'other'
  const [rejectDetail, setRejectDetail] = useState('');

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
  // 수정/삭제/수락/거절 등 어떤 액션 버튼도 두지 않고 정보만 보여준다.
  if (event.source === 'shared_team_calendar') {
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

  function beginReschedule() {
    const sm = start.getHours() * 60 + start.getMinutes();
    const em = end.getHours() * 60 + end.getMinutes();
    setNewStart(sm);
    setNewEnd(em);
    setActionError('');
    setMode('reschedule-form');
  }

  function submitReschedule() {
    if (newEnd <= newStart) {
      setActionError('종료시간은 시작시간보다 늦어야 합니다.');
      return;
    }
    const dayBase = new Date(start);
    dayBase.setHours(0, 0, 0, 0);
    const proposedStart = new Date(dayBase.getTime() + newStart * 60000).toISOString();
    const proposedEnd = new Date(dayBase.getTime() + newEnd * 60000).toISOString();
    proposeReschedule(event.id, proposedStart, proposedEnd);
    onClose();
  }

  function beginRejectReason() {
    setRejectReason('unavailable');
    setRejectDetail('');
    setActionError('');
    setMode('reject-reason');
  }

  // '일정 변경 요청'을 고르면 완전히 거절하지 않고, 기존 시간변경 제안
  // 흐름(beginReschedule → submitReschedule → proposeReschedule)을 그대로
  // 재사용한다 — 결과 상태는 reschedule_requested로 [시간변경] 버튼을 눌렀을
  // 때와 동일하게 처리된다.
  function submitRejectReason() {
    if (rejectReason === 'reschedule_request') {
      beginReschedule();
      return;
    }
    if (rejectReason === 'other' && !rejectDetail.trim()) {
      setActionError('사유를 입력해주세요.');
      return;
    }
    setActionError('');
    rejectRequest(event.id, rejectReason, rejectReason === 'other' ? rejectDetail.trim() : '');
    onClose();
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

  const isManager = role === 'manager';
  const isCoordinator = role === 'coordinator';
  // 확정 일정 수정/삭제는 양쪽 역할 모두 가능(이 앱은 팀 전체가 공유하는
  // 하나의 캘린더를 다루므로 개인별 소유권 개념이 없다). 승인대기 요청의
  // 수정/취소는 요청을 올린 쪽(코디네이터)만 가능하다.
  const canEditConfirmed = event.status === 'confirmed';
  const canEditPending = event.status === 'pending' && isCoordinator;

  async function handleAccept() {
    setActionError('');
    setSubmitting(true);
    const res = await acceptRequest(event.id);
    setSubmitting(false);
    if (res?.error) {
      setActionError(res.error);
      return;
    }
    onClose();
  }

  async function handleAcceptReschedule() {
    setActionError('');
    setSubmitting(true);
    const res = await acceptReschedule(event.id);
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
        <span
          className={`pv-status-badge ${event.source === 'hansol_personal' ? 'pv-status-personal' : `pv-status-${event.status}`}`}
        >
          {event.source === 'hansol_personal'
            ? '개인 일정'
            : event.status === 'rejected' ? rejectionLabel(event) : STATUS_LABEL[event.status]}
        </span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      {mode === 'view' && (
        <>
          <div className="pv-title">{event.title}</div>
          <div className="pv-meta">{dateLabel}</div>
          <div className="pv-meta">{timeLabel}</div>
          {event.location && <div className="pv-meta">📍 {event.location}</div>}
          {event.memo && <div className="pv-memo">{event.memo}</div>}

          {event.status === 'reschedule_requested' && (
            <div className="pv-reschedule-box">
              <div className="pv-reschedule-title">팀장님이 시간변경을 요청했습니다.</div>
              <div className="pv-reschedule-diff">
                {timeLabel.split(' ~ ')[0]} → {formatHM(new Date(event.proposedStart).getHours() * 60 + new Date(event.proposedStart).getMinutes())}
              </div>
            </div>
          )}

          {event.status === 'rejected' && (
            <div className="pv-reject-box">
              <div className="pv-reject-title">{rejectionLabel(event)}</div>
              {event.rejectionDetail && (
                <div className="pv-reject-detail">사유: {event.rejectionDetail}</div>
              )}
            </div>
          )}

          {actionError && <div className="pv-error">{actionError}</div>}

          <div className="pv-actions">
            {isManager && event.status === 'pending' && (
              <>
                <button className="pv-btn pv-btn-primary" onClick={handleAccept} disabled={submitting}>
                  {submitting ? '처리 중…' : '수락'}
                </button>
                <button className="pv-btn" onClick={beginReschedule} disabled={submitting}>시간변경</button>
                <button className="pv-btn pv-btn-danger" onClick={beginRejectReason} disabled={submitting}>거절</button>
              </>
            )}
            {isCoordinator && event.status === 'reschedule_requested' && (
              <>
                <button className="pv-btn pv-btn-primary" onClick={handleAcceptReschedule} disabled={submitting}>
                  {submitting ? '처리 중…' : '변경시간 확인'}
                </button>
                <button className="pv-btn" onClick={() => { cancelReschedule(event.id); onClose(); }} disabled={submitting}>다른 시간 선택</button>
              </>
            )}
            {isManager && event.status === 'reschedule_requested' && (
              <div className="pv-hint">한솔 응답 대기 중</div>
            )}
          </div>

          {(canEditConfirmed || canEditPending) && (
            <div className="pv-actions pv-actions-editrow">
              <button className="pv-btn" onClick={beginEdit} disabled={submitting}>수정</button>
              {canEditConfirmed && (
                <button className="pv-btn pv-btn-danger-outline" onClick={() => setMode('delete-confirm')} disabled={submitting}>삭제</button>
              )}
              {canEditPending && (
                <button className="pv-btn pv-btn-danger-outline" onClick={() => setMode('delete-confirm')} disabled={submitting}>요청 취소</button>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'reschedule-form' && (
        <>
          <div className="pv-title">새 시간 제안</div>
          <div className="pv-meta">{dateLabel}</div>
          <div className="pv-row pv-row-time">
            <input
              type="time"
              className="pv-time-input"
              value={formatHM(newStart)}
              onChange={(e) => setNewStart(parseHM(e.target.value))}
            />
            <span className="pv-tilde">~</span>
            <input
              type="time"
              className="pv-time-input"
              value={formatHM(newEnd)}
              onChange={(e) => setNewEnd(parseHM(e.target.value))}
            />
          </div>
          {actionError && <div className="pv-error">{actionError}</div>}
          <div className="pv-actions">
            <button className="pv-btn pv-btn-primary" onClick={submitReschedule}>제안 보내기</button>
            <button className="pv-btn" onClick={() => setMode('view')}>취소</button>
          </div>
        </>
      )}

      {mode === 'reject-reason' && (
        <>
          <div className="pv-title">거절 사유</div>
          <div className="pv-meta">{event.title}</div>
          <div className="pv-reject-options">
            <label className="pv-reject-option">
              <input
                type="radio"
                name="reject-reason"
                checked={rejectReason === 'unavailable'}
                onChange={() => setRejectReason('unavailable')}
              />
              일정 불가
            </label>
            <label className="pv-reject-option">
              <input
                type="radio"
                name="reject-reason"
                checked={rejectReason === 'reschedule_request'}
                onChange={() => setRejectReason('reschedule_request')}
              />
              일정 변경 요청
            </label>
            <label className="pv-reject-option">
              <input
                type="radio"
                name="reject-reason"
                checked={rejectReason === 'other'}
                onChange={() => setRejectReason('other')}
              />
              기타
            </label>
          </div>
          {rejectReason === 'other' && (
            <textarea
              className="pv-edit-textarea"
              placeholder="기타 사유"
              value={rejectDetail}
              onChange={(e) => setRejectDetail(e.target.value)}
              autoFocus
            />
          )}
          {actionError && <div className="pv-error">{actionError}</div>}
          <div className="pv-actions">
            <button className="pv-btn pv-btn-primary" onClick={submitRejectReason} disabled={submitting}>확인</button>
            <button className="pv-btn" onClick={() => setMode('view')} disabled={submitting}>취소</button>
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
          <div className="pv-confirm-text">
            {event.status === 'pending'
              ? '이 요청을 취소하시겠습니까?'
              : '이 일정을 삭제하시겠습니까?'}
          </div>
          {actionError && <div className="pv-error">{actionError}</div>}
          <div className="pv-actions">
            <button className="pv-btn" onClick={() => setMode('view')} disabled={submitting}>취소</button>
            <button
              className="pv-btn pv-btn-danger"
              disabled={submitting}
              onClick={() => {
                if (event.status === 'pending') {
                  cancelOwnRequest(event.id);
                  onClose();
                } else {
                  confirmDelete();
                }
              }}
            >
              {submitting ? '처리 중…' : (event.status === 'pending' ? '요청 취소' : '삭제')}
            </button>
          </div>
        </>
      )}
    </PopoverShell>
  );
}
