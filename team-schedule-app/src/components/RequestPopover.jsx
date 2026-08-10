import React, { useMemo, useState } from 'react';
import PopoverShell from './PopoverShell.jsx';
import { formatHM } from '../utils/time.js';

function slotOptions(minMin, maxMin, step = 30) {
  const opts = [];
  for (let m = minMin; m <= maxMin; m += step) opts.push(m);
  return opts;
}

// 빈 시간 클릭/드래그 후 뜨는 일정 요청 입력 팝오버
export default function RequestPopover({ anchor, day, blockStart, blockEnd, initialStart, initialEnd, onClose, onSubmit }) {
  const [startMin, setStartMin] = useState(initialStart);
  const [endMin, setEndMin] = useState(initialEnd);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const startOptions = useMemo(() => slotOptions(blockStart, blockEnd - 30), [blockStart, blockEnd]);
  const endOptions = useMemo(() => slotOptions(startMin + 30, blockEnd), [startMin, blockEnd]);

  function handleStartChange(v) {
    const next = Number(v);
    setStartMin(next);
    if (endMin <= next) setEndMin(Math.min(next + 30, blockEnd));
  }

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
        <select value={startMin} onChange={(e) => handleStartChange(e.target.value)}>
          {startOptions.map((m) => (
            <option key={m} value={m}>{formatHM(m)}</option>
          ))}
        </select>
        <span className="pv-tilde">~</span>
        <select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
          {endOptions.map((m) => (
            <option key={m} value={m}>{formatHM(m)}</option>
          ))}
        </select>
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
        {submitting ? '확인 중…' : '팀장님께 요청'}
      </button>
    </PopoverShell>
  );
}
