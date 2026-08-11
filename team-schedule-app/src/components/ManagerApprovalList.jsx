import React, { useMemo, useState } from 'react';
import { useApp } from '../state/store.jsx';
import { formatHM } from '../utils/time.js';

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function ApprovalCard({ event }) {
  const { acceptRequest, rejectRequest, proposeReschedule } = useApp();
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setError('');
    setSubmitting(true);
    const res = await acceptRequest(event.id);
    setSubmitting(false);
    if (res?.error) setError(res.error);
  }

  const start = new Date(event.start);
  const end = new Date(event.end);
  const dateLabel = `${start.getMonth() + 1}월 ${start.getDate()}일 ${WEEKDAY_KR[start.getDay()]}요일`;
  const sMin = start.getHours() * 60 + start.getMinutes();
  const eMin = end.getHours() * 60 + end.getMinutes();

  const [newStart, setNewStart] = useState(sMin);
  const [newEnd, setNewEnd] = useState(eMin + 30);

  function submitChange() {
    const base = new Date(start);
    base.setHours(0, 0, 0, 0);
    const ps = new Date(base.getTime() + newStart * 60000).toISOString();
    const pe = new Date(base.getTime() + newEnd * 60000).toISOString();
    proposeReschedule(event.id, ps, pe);
    setChanging(false);
  }

  const options = [];
  for (let m = 8 * 60; m <= 19 * 60; m += 30) options.push(m);

  return (
    <div className="approval-card">
      <div className="approval-card-title">{event.title}</div>
      <div className="approval-card-meta">{dateLabel}</div>
      <div className="approval-card-meta approval-card-time">{formatHM(sMin)} ~ {formatHM(eMin)}</div>
      {event.location && <div className="approval-card-meta">📍 {event.location}</div>}
      {event.memo && <div className="approval-card-memo">{event.memo}</div>}

      {event.status === 'reschedule_requested' && (
        <div className="approval-pending-note">코디네이터 응답 대기 중</div>
      )}

      {error && <div className="pv-error">{error}</div>}

      {event.status === 'pending' && !changing && (
        <div className="approval-actions">
          <button className="pv-btn pv-btn-primary" onClick={handleAccept} disabled={submitting}>
            {submitting ? '처리 중…' : '수락'}
          </button>
          <button className="pv-btn" onClick={() => setChanging(true)} disabled={submitting}>시간변경</button>
          <button className="pv-btn pv-btn-danger" onClick={() => rejectRequest(event.id)} disabled={submitting}>거절</button>
        </div>
      )}

      {event.status === 'pending' && changing && (
        <div className="approval-change-form">
          <div className="pv-row pv-row-time">
            <select value={newStart} onChange={(e) => setNewStart(Number(e.target.value))}>
              {options.map((m) => <option key={m} value={m}>{formatHM(m)}</option>)}
            </select>
            <span className="pv-tilde">~</span>
            <select value={newEnd} onChange={(e) => setNewEnd(Number(e.target.value))}>
              {options.map((m) => <option key={m} value={m}>{formatHM(m)}</option>)}
            </select>
          </div>
          <div className="approval-actions">
            <button className="pv-btn pv-btn-primary" onClick={submitChange}>제안 보내기</button>
            <button className="pv-btn" onClick={() => setChanging(false)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 코디네이터가 팀장의 시간변경 제안에 응답하는 카드(모바일에서 코디네이터도 사용 가능)
function ResponseCard({ event }) {
  const { acceptReschedule, cancelReschedule } = useApp();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const start = new Date(event.start);
  const proposed = new Date(event.proposedStart);
  const sMin = start.getHours() * 60 + start.getMinutes();
  const pMin = proposed.getHours() * 60 + proposed.getMinutes();

  async function handleAccept() {
    setError('');
    setSubmitting(true);
    const res = await acceptReschedule(event.id);
    setSubmitting(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div className="approval-card">
      <div className="approval-card-title">{event.title}</div>
      <div className="approval-pending-note">팀장님이 시간을 변경했습니다.</div>
      <div className="approval-card-time">{formatHM(sMin)} → {formatHM(pMin)}</div>
      {error && <div className="pv-error">{error}</div>}
      <div className="approval-actions">
        <button className="pv-btn pv-btn-primary" onClick={handleAccept} disabled={submitting}>
          {submitting ? '처리 중…' : '수락'}
        </button>
        <button className="pv-btn" onClick={() => cancelReschedule(event.id)} disabled={submitting}>다른 시간 선택</button>
      </div>
    </div>
  );
}

// 코디네이터가 자신이 올린 승인대기 요청을 취소할 수 있는 카드.
// 아직 Google Calendar에 생성된 적 없는 요청이므로 로컬에서만 제거한다.
function OwnPendingCard({ event }) {
  const { cancelOwnRequest } = useApp();
  const [confirming, setConfirming] = useState(false);
  const start = new Date(event.start);
  const end = new Date(event.end);
  const sMin = start.getHours() * 60 + start.getMinutes();
  const eMin = end.getHours() * 60 + end.getMinutes();

  return (
    <div className="approval-card">
      <div className="approval-card-title">{event.title}</div>
      <div className="approval-card-meta approval-card-time">{formatHM(sMin)} ~ {formatHM(eMin)}</div>
      <div className="approval-pending-note">승인대기 · 팀장님 확인 중</div>
      {!confirming ? (
        <div className="approval-actions">
          <button className="pv-btn pv-btn-danger" onClick={() => setConfirming(true)}>요청 취소</button>
        </div>
      ) : (
        <div className="approval-actions">
          <span className="pv-hint">이 요청을 취소하시겠습니까?</span>
          <button className="pv-btn pv-btn-danger" onClick={() => cancelOwnRequest(event.id)}>취소</button>
          <button className="pv-btn" onClick={() => setConfirming(false)}>아니오</button>
        </div>
      )}
    </div>
  );
}

// 모바일 최적화된 승인함: 팀장은 대기중 요청을, 코디네이터는 시간변경 응답이 필요한 건을 본다.
export default function ManagerApprovalList() {
  const { events, role } = useApp();

  const pending = useMemo(
    () => events.filter((e) => e.status === 'pending').sort((a, b) => new Date(a.start) - new Date(b.start)),
    [events]
  );
  const rescheduling = useMemo(
    () => events.filter((e) => e.status === 'reschedule_requested').sort((a, b) => new Date(a.start) - new Date(b.start)),
    [events]
  );

  if (role === 'manager') {
    const items = [...pending, ...rescheduling];
    return (
      <div className="approval-list">
        {items.length === 0 && <div className="approval-empty">대기 중인 요청이 없습니다.</div>}
        {items.map((e) => <ApprovalCard key={e.id} event={e} />)}
      </div>
    );
  }

  return (
    <div className="approval-list">
      {rescheduling.length === 0 && pending.length === 0 && (
        <div className="approval-empty">진행 중인 요청이 없습니다.</div>
      )}
      {rescheduling.map((e) => <ResponseCard key={e.id} event={e} />)}
      {pending.map((e) => <OwnPendingCard key={e.id} event={e} />)}
    </div>
  );
}
