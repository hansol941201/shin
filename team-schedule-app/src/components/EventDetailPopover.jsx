import React, { useMemo, useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM } from '../utils/time.js';
import { useApp } from '../state/store.jsx';

const STATUS_LABEL = {
  confirmed: '확정',
  pending: '승인대기',
  reschedule_requested: '시간변경 제안',
  rejected: '거절됨',
};

function slotOptions(minMin, maxMin, step = 30) {
  const opts = [];
  for (let m = minMin; m <= maxMin; m += step) opts.push(m);
  return opts;
}

// 일정 블록(확정/승인대기/시간변경) 클릭 시 뜨는 상세/액션 팝오버
export default function EventDetailPopover({ event, anchor, onClose, dayWorkStart, dayWorkEnd }) {
  const { role, acceptRequest, rejectRequest, proposeReschedule, acceptReschedule, cancelReschedule } = useApp();
  const [mode, setMode] = useState('view'); // 'view' | 'reschedule-form'
  const [newStart, setNewStart] = useState(null);
  const [newEnd, setNewEnd] = useState(null);
  const [actionError, setActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const start = new Date(event.start);
  const end = new Date(event.end);
  const dateLabel = `${start.getMonth() + 1}월 ${start.getDate()}일 (${'일월화수목금토'[start.getDay()]})`;
  const timeLabel = event.allDay
    ? '종일'
    : `${formatHM(start.getHours() * 60 + start.getMinutes())} ~ ${formatHM(end.getHours() * 60 + end.getMinutes())}`;

  const startOptions = useMemo(() => slotOptions(dayWorkStart, dayWorkEnd - 30), [dayWorkStart, dayWorkEnd]);
  const endOptions = useMemo(() => {
    const base = newStart ?? dayWorkStart;
    return slotOptions(base + 30, dayWorkEnd);
  }, [newStart, dayWorkStart, dayWorkEnd]);

  function beginReschedule() {
    const sm = start.getHours() * 60 + start.getMinutes();
    setNewStart(sm);
    setNewEnd(Math.min(sm + (end - start) / 60000, dayWorkEnd));
    setMode('reschedule-form');
  }

  function submitReschedule() {
    if (newEnd <= newStart) return;
    const dayBase = new Date(start);
    dayBase.setHours(0, 0, 0, 0);
    const proposedStart = new Date(dayBase.getTime() + newStart * 60000).toISOString();
    const proposedEnd = new Date(dayBase.getTime() + newEnd * 60000).toISOString();
    proposeReschedule(event.id, proposedStart, proposedEnd);
    onClose();
  }

  const isManager = role === 'manager';
  const isCoordinator = role === 'coordinator';

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
        <span className={`pv-status-badge pv-status-${event.status}`}>{STATUS_LABEL[event.status]}</span>
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
              <div className="pv-reschedule-title">팀장님이 시간을 변경했습니다.</div>
              <div className="pv-reschedule-diff">
                {timeLabel.split(' ~ ')[0]} → {formatHM(new Date(event.proposedStart).getHours() * 60 + new Date(event.proposedStart).getMinutes())}
              </div>
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
                <button className="pv-btn pv-btn-danger" onClick={() => { rejectRequest(event.id); onClose(); }} disabled={submitting}>거절</button>
              </>
            )}
            {isCoordinator && event.status === 'reschedule_requested' && (
              <>
                <button className="pv-btn pv-btn-primary" onClick={handleAcceptReschedule} disabled={submitting}>
                  {submitting ? '처리 중…' : '수락'}
                </button>
                <button className="pv-btn" onClick={() => { cancelReschedule(event.id); onClose(); }} disabled={submitting}>다른 시간 선택</button>
              </>
            )}
            {isManager && event.status === 'reschedule_requested' && (
              <div className="pv-hint">코디네이터 응답 대기 중</div>
            )}
          </div>
        </>
      )}

      {mode === 'reschedule-form' && (
        <>
          <div className="pv-title">새 시간 제안</div>
          <div className="pv-meta">{dateLabel}</div>
          <div className="pv-row pv-row-time">
            <select value={newStart} onChange={(e) => setNewStart(Number(e.target.value))}>
              {startOptions.map((m) => (
                <option key={m} value={m}>{formatHM(m)}</option>
              ))}
            </select>
            <span className="pv-tilde">~</span>
            <select value={newEnd} onChange={(e) => setNewEnd(Number(e.target.value))}>
              {endOptions.map((m) => (
                <option key={m} value={m}>{formatHM(m)}</option>
              ))}
            </select>
          </div>
          <div className="pv-actions">
            <button className="pv-btn pv-btn-primary" onClick={submitReschedule}>제안 보내기</button>
            <button className="pv-btn" onClick={() => setMode('view')}>취소</button>
          </div>
        </>
      )}
    </PopoverShell>
  );
}
