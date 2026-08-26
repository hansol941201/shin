import React, { useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM, parseHM } from '../utils/time.js';

// 날짜 칸의 `+` 버튼을 눌렀을 때 뜨는 일정 추가 팝오버. 팀장 전용 달력이라
// 승인 절차 없이 곧바로 확정되고, 실제 Google Calendar에도 바로 등록된다.
// 시작/종료 시간은 30분 단위 선택지가 아니라 <input type="time">으로
// 자유롭게 입력한다(근무시간 범위에 갇히지 않음 — 07:30, 21:00 등도 그대로
// 입력 가능).
export default function RequestPopover({ anchor, day, initialStart, initialEnd, onClose, onSubmit }) {
  const [startMin, setStartMin] = useState(initialStart);
  const [endMin, setEndMin] = useState(initialEnd);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!title.trim()) {
      setError('일정명을 입력해주세요.');
      return;
    }
    if (endMin <= startMin) {
      setError('종료시간은 시작시간보다 늦어야 합니다.');
      return;
    }
    setSubmitting(true);
    const result = await onSubmit({
      title: title.trim(),
      location: location.trim(),
      memo: memo.trim(),
      startMin,
      endMin,
    });
    setSubmitting(false);
    if (result && result.error) {
      setError(result.error);
    }
  }

  const dateLabel = `${day.getMonth() + 1}월 ${day.getDate()}일`;

  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={288}>
      <div className="pv-head">
        <span className="pv-date">{dateLabel}</span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <div className="pv-row pv-row-time">
        <input
          type="time"
          className="pv-time-input"
          value={formatHM(startMin)}
          onChange={(e) => setStartMin(parseHM(e.target.value))}
        />
        <span className="pv-tilde">~</span>
        <input
          type="time"
          className="pv-time-input"
          value={formatHM(endMin)}
          onChange={(e) => setEndMin(parseHM(e.target.value))}
        />
      </div>

      <input
        className="pv-input"
        placeholder="일정명"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <input
        className="pv-input"
        placeholder="장소 (선택)"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <textarea
        className="pv-textarea"
        placeholder="메모 (선택)"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        rows={2}
      />

      {error && <div className="pv-error">{error}</div>}
      <button className="pv-submit" onClick={handleSubmit} disabled={submitting}>
        {submitting ? '등록 중…' : '일정 추가'}
      </button>
    </PopoverShell>
  );
}
