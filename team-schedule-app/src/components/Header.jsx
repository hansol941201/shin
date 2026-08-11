import React, { useRef, useState } from 'react';
import { useApp } from '../state/store.jsx';
import { addDays, formatMonthRange, formatMonthLabel } from '../utils/time.js';
import Legend from './Legend.jsx';
import PopoverShell from './PopoverShell.jsx';
import GoogleConnectButton from './GoogleConnectButton.jsx';

function SettingsPopover({ anchor, onClose }) {
  const {
    settings,
    updateSettings,
    googleConfigured,
    googleClientIdValid,
    googleClientIdMasked,
    googleSignedIn,
    calendars,
    calendarsLoading,
    calendarsError,
    managerCalendarId,
    selectManagerCalendar,
    demoMode,
    setDemoMode,
    googleActive,
  } = useApp();
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
    <PopoverShell anchor={anchor} onClose={onClose} width={260}>
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

      <hr className="settings-sep" />

      <div className="settings-block-title">팀장 캘린더</div>
      {!googleConfigured && (
        <div className="pv-hint">Google 연동이 설정되지 않았습니다. (README 참고)</div>
      )}
      {googleConfigured && !googleClientIdValid && (
        <div className="pv-error">
          Client ID 형식이 올바르지 않습니다({googleClientIdMasked || '값 없음'}).<br />
          &quot;.apps.googleusercontent.com&quot;으로 끝나야 합니다. 구글연동설정.bat을
          다시 실행해 값을 다시 입력해주세요.
        </div>
      )}
      {googleConfigured && googleClientIdValid && (
        <div className="pv-hint">설정된 Client ID: {googleClientIdMasked}</div>
      )}
      {googleConfigured && googleClientIdValid && !googleSignedIn && (
        <div className="pv-hint">Google 캘린더를 먼저 연결해주세요.</div>
      )}
      {googleConfigured && googleSignedIn && (
        <>
          {calendarsLoading && <div className="pv-hint">캘린더 목록을 불러오는 중…</div>}
          {calendarsError && <div className="pv-error">{calendarsError}</div>}
          {!calendarsLoading && !calendarsError && (
            <select
              className="settings-select-full"
              value={managerCalendarId}
              onChange={(e) => selectManagerCalendar(e.target.value)}
            >
              <option value="">캘린더 선택</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}{c.primary ? ' (기본)' : ''}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <hr className="settings-sep" />

      <label className="settings-checkbox-row">
        <input type="checkbox" checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)} />
        <span>샘플 데이터 사용 (개발용)</span>
      </label>
      {googleActive && <div className="pv-hint">Google 연동 중에는 사용되지 않습니다.</div>}

      <hr className="settings-sep" />

      <div className="settings-block-title">개발자 진단</div>
      <div className="settings-diag">
        <div className="settings-diag-row">
          <span>환경변수 로드됨</span>
          <b className={googleConfigured ? 'diag-ok' : 'diag-bad'}>{googleConfigured ? '예' : '아니오'}</b>
        </div>
        <div className="settings-diag-row">
          <span>Client ID 형식 정상</span>
          <b className={googleClientIdValid ? 'diag-ok' : 'diag-bad'}>{googleClientIdValid ? '예' : '아니오'}</b>
        </div>
        <div className="settings-diag-row">
          <span>현재 origin</span>
          <b>{window.location.origin}</b>
        </div>
        <div className="settings-diag-row">
          <span>Google 연결 상태</span>
          <b className={googleSignedIn ? 'diag-ok' : 'diag-bad'}>{googleSignedIn ? '연결됨' : '미연결'}</b>
        </div>
        {googleConfigured && (
          <div className="settings-diag-row">
            <span>Client ID</span>
            <b>{googleClientIdMasked || '(비어있음)'}</b>
          </div>
        )}
        <div className="settings-diag-row">
          <span>실행 프로젝트 경로</span>
          <b>{typeof __APP_PROJECT_ROOT__ !== 'undefined' ? __APP_PROJECT_ROOT__ : '(알 수 없음)'}</b>
        </div>
        <div className="settings-diag-row">
          <span>MODE</span>
          <b>{import.meta.env.MODE}</b>
        </div>
        <div className="settings-diag-row">
          <span>DEV</span>
          <b>{String(import.meta.env.DEV)}</b>
        </div>
        <div className="settings-diag-row">
          <span>BASE_URL</span>
          <b>{import.meta.env.BASE_URL}</b>
        </div>
        <div className="settings-diag-row">
          <span>VITE_GOOGLE_CLIENT_ID 존재</span>
          <b className={googleConfigured ? 'diag-ok' : 'diag-bad'}>
            {typeof import.meta.env.VITE_GOOGLE_CLIENT_ID === 'string' && import.meta.env.VITE_GOOGLE_CLIENT_ID.length > 0 ? '예' : '아니오'}
          </b>
        </div>
      </div>
    </PopoverShell>
  );
}

export default function Header() {
  const {
    currentWeekStart,
    cursorDate,
    setCursorDate,
    view,
    setView,
    role,
    setRole,
    googleActive,
    googleEventsLoading,
    googleEventsError,
    calendarsError,
    googleAuthError,
    refreshGoogleEvents,
  } = useApp();
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

  const bannerMessage = googleEventsError || calendarsError || googleAuthError;

  return (
    <>
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
          {googleActive && (
            <button
              className="icon-btn"
              onClick={refreshGoogleEvents}
              title="일정 새로고침"
              aria-label="일정 새로고침"
              disabled={googleEventsLoading}
            >
              {googleEventsLoading ? '…' : '↻'}
            </button>
          )}
          <GoogleConnectButton />
          <button ref={gearRef} className="icon-btn" onClick={openSettings} title="근무시간/캘린더 설정" aria-label="설정">⚙</button>
          <div className="role-switch">
            <select value={role} onChange={(e) => setRole(e.target.value)} title="역할(데모용)">
              <option value="coordinator">코디네이터</option>
              <option value="manager">팀장</option>
            </select>
          </div>
        </div>

        {settingsAnchor && <SettingsPopover anchor={settingsAnchor} onClose={() => setSettingsAnchor(null)} />}
      </header>

      {bannerMessage && (
        <div className="google-error-banner">{bannerMessage}</div>
      )}
    </>
  );
}
