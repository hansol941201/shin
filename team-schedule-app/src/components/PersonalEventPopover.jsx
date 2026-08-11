import React, { useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM, parseHM } from '../utils/time.js';

// 한솔 개인 일정 추가 팝오버. 팀장님 승인 절차가 전혀 없다 — 저장 즉시
// confirmed로 저장되고 Google Calendar에는 절대 생성되지 않는다(앱 내부
// 데이터로만 관리). RequestPopover와 입력 필드는 같지만 제출 문구와
// 색상만 다르다.
export default function PersonalEventPopover({ anchor, day, initialStart, initialEnd, onClose, onSubmit }) {
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
        <span className="pv-date">{dateLabel} · 한솔 개인 일정</span>
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

      <button className="pv-submit pv-submit-personal" onClick={handleSubmit} disabled={submitting}>
        {submitting ? '저장 중…' : '개인 일정 저장'}
      </button>
    </PopoverShell>
  );
}
