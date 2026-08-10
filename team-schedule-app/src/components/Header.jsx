import React, { useRef, useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, formatMonthRange, formatMonthLabel } from '../utils/time.js';
import Legend from './Legend.jsx';
import PopoverShell from './PopoverShell.jsx';

function SettingsPopover({ anchor, onClose }) {
  const { settings, updateSettings } = useApp();
  const [workStart, setWorkStart] = useState(Math.floor(settings.workStartMin / 60));
  const [workEnd, setWorkEnd] = useState(Math.floor(settings.workEndMin / 60));
  const [lunchStart, setLunchStart] = useState(Math.floor(settings.lunchStartMin / 60));
  const [lunchEnd, setLunchEnd] = useState(Math.floor(settings.lunchEndMin / 60));

  function save() {
    updateSettings({
      workStartMin: workStart * 60,
      workEndMin: workEnd * 60,
      lunchStartMin: lunchStart * 60,
      lunchEndMin: lunchEnd * 60,
      hourLabelStart: workStart,
      hourLabelEnd: workEnd,
    });
    onClose();
  }

  const hourOpts = Array.from({ length: 15 }, (_, i) => i + 6); // 06~20시

  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={240}>
      <div className="pv-head">
        <span className="pv-title-sm">근무시간 설정</span>
        <button className="pv-close" onClick={onClose}>✕</button>
      </div>
      <div className="settings-row">
        <label>근무</label>
        <select value={workStart} onChange={(e) => setWorkStart(Number(e.target.value))}>
          {hourOpts.map((h) => <option key={h} value={h}>{h}시</option>)}
        </select>
        <span className="pv-tilde">~</span>
        <select value={workEnd} onChange={(e) => setWorkEnd(Number(e.target.value))}>
          {hourOpts.map((h) => <option key={h} value={h}>{h}시</option>)}
        </select>
      </div>
      <div className="settings-row">
        <label>점심</label>
        <select value={lunchStart} onChange={(e) => setLunchStart(Number(e.target.value))}>
          {hourOpts.map((h) => <option key={h} value={h}>{h}시</option>)}
        </select>
        <span className="pv-tilde">~</span>
        <select value={lunchEnd} onChange={(e) => setLunchEnd(Number(e.target.value))}>
          {hourOpts.map((h) => <option key={h} value={h}>{h}시</option>)}
        </select>
      </div>
      <button className="pv-submit" onClick={save}>저장</button>
    </PopoverShell>
  );
}

export default function Header() {
  const { currentWeekStart, cursorDate, setCursorDate, view, setView, role, setRole } = useApp();
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const gearRef = useRef(null);

  function goToday() {
    setCursorDate(new Date());
    setView('week');
  }
  function goPrev() {
    if (view === 'month') {
      setCursorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    } else {
      setCursorDate((d) => addDays(d, -7));
    }
  }
  function goNext() {
    if (view === 'month') {
      setCursorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    } else {
      setCursorDate((d) => addDays(d, 7));
    }
  }

  function openSettings() {
    const rect = gearRef.current.getBoundingClientRect();
    setSettingsAnchor({ x: rect.left, y: rect.bottom + 6 });
  }

  return (
    <header className="topbar">
      <div className="topbar-left">팀장 일정</div>

      <div className="topbar-center">
        <button className="nav-arrow" onClick={goPrev} aria-label="이전">‹</button>
        <span className="topbar-range">
          {view === 'month' ? formatMonthLabel(cursorDate) : formatMonthRange(currentWeekStart)}
        </span>
        <button className="nav-arrow" onClick={goNext} aria-label="다음">›</button>
      </div>

      <div className="topbar-right">
        <Legend />
        <div className="view-switch">
          <button onClick={goToday}>오늘</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>주간</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>월간</button>
        </div>
        <button ref={gearRef} className="icon-btn" onClick={openSettings} title="근무시간 설정" aria-label="설정">⚙</button>
        <div className="role-switch">
          <select value={role} onChange={(e) => setRole(e.target.value)} title="역할(데모용)">
            <option value="coordinator">코디네이터</option>
            <option value="manager">팀장</option>
          </select>
        </div>
      </div>

      {settingsAnchor && <SettingsPopover anchor={settingsAnchor} onClose={() => setSettingsAnchor(null)} />}
    </header>
  );
}
