import React, { useRef, useState } from 'react';
import { useApp } from '../state/store.jsx';
import { formatHM, formatMonthLabel } from '../utils/time.js';
import Legend from './Legend.jsx';
import PopoverShell from './PopoverShell.jsx';
import GoogleConnectButton from './GoogleConnectButton.jsx';
import EventDetailPopover from './EventDetailPopover.jsx';

// "팀장" 화면은 실제 확정 일정만 보여주므로(요구사항), 승인대기/시간변경
// 요청은 달력에서 클릭할 수 없다. 대신 헤더의 작은 배지에서 목록을 열어
// 기존 EventDetailPopover(수락/시간변경/거절)를 그대로 재사용한다 — 승인
// 관련 로직/버튼은 하나도 새로 만들지 않고 기존 컴포넌트를 그대로 연다.
function PendingApprovalMenu({ anchor, items, onClose, onPick }) {
  return (
    <PopoverShell anchor={anchor} onClose={onClose} width={260}>
      <div className="pv-head">
        <span className="pv-title-sm">승인대기 / 시간변경</span>
        <button className="pv-close" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      {items.length === 0 && <div className="pv-hint">대기 중인 요청이 없습니다.</div>}
      <div className="approval-menu-list">
        {items.map((e) => {
          const s = new Date(e.start);
          return (
            <button key={e.id} className="approval-menu-item" onClick={(ev) => onPick(e, ev)}>
              <span className="approval-menu-title">{e.title}</span>
              <span className="approval-menu-time">
                {s.getMonth() + 1}/{s.getDate()} {formatHM(s.getHours() * 60 + s.getMinutes())}
                {e.status === 'reschedule_requested' ? ' · 시간변경' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </PopoverShell>
  );
}

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
    cursorDate,
    setCursorDate,
    role,
    setRole,
    googleActive,
    googleEventsLoading,
    googleEventsError,
    calendarsError,
    googleAuthError,
    refreshGoogleEvents,
    events,
  } = useApp();
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const gearRef = useRef(null);
  const approvalRef = useRef(null);
  const [approvalMenuAnchor, setApprovalMenuAnchor] = useState(null);
  const [approvalDetail, setApprovalDetail] = useState(null); // {event, x, y}

  // "팀장" 화면에서 숨겨진 승인대기/시간변경 요청 — 개수 배지 + 목록에 쓴다.
  const pendingItems = events
    .filter((e) => e.status === 'pending' || e.status === 'reschedule_requested')
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  function openApprovalMenu() {
    const rect = approvalRef.current.getBoundingClientRect();
    setApprovalMenuAnchor({ x: rect.left, y: rect.bottom + 6 });
  }

  function pickApprovalItem(ev, mouseEvent) {
    setApprovalMenuAnchor(null);
    setApprovalDetail({ event: ev, x: mouseEvent.clientX, y: mouseEvent.clientY });
  }

  // 이제 월간 화면이 유일한 화면이므로 이전/다음은 항상 월 단위로 이동한다
  // (오늘/주간 버튼은 삭제 — 요구사항에 따라 UI에서 완전히 제거).
  function goPrev() {
    setCursorDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function goNext() {
    setCursorDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
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
          <button className="nav-arrow" onClick={goPrev} aria-label="이전달">‹</button>
          <span className="topbar-range">{formatMonthLabel(cursorDate)}</span>
          <button className="nav-arrow" onClick={goNext} aria-label="다음달">›</button>
        </div>

        <div className="topbar-right">
          <Legend />
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
          {role === 'manager' && pendingItems.length > 0 && (
            <button
              ref={approvalRef}
              className="icon-btn approval-badge-btn"
              onClick={openApprovalMenu}
              title="승인대기 / 시간변경 요청"
            >
              승인대기 {pendingItems.length}
            </button>
          )}
          <button ref={gearRef} className="icon-btn" onClick={openSettings} title="근무시간/캘린더 설정" aria-label="설정">⚙</button>
          <div className="role-switch view-switch" title="달력 보기 전환 — 팀장: 팀장님 실제 일정만 / 한솔: 내가 요청한 일정만">
            <button
              className={role === 'manager' ? 'active' : ''}
              onClick={() => setRole('manager')}
            >
              팀장
            </button>
            <button
              className={role === 'coordinator' ? 'active' : ''}
              onClick={() => setRole('coordinator')}
            >
              한솔
            </button>
          </div>
        </div>

        {settingsAnchor && <SettingsPopover anchor={settingsAnchor} onClose={() => setSettingsAnchor(null)} />}
        {approvalMenuAnchor && (
          <PendingApprovalMenu
            anchor={approvalMenuAnchor}
            items={pendingItems}
            onClose={() => setApprovalMenuAnchor(null)}
            onPick={pickApprovalItem}
          />
        )}
        {approvalDetail && (
          <EventDetailPopover
            event={approvalDetail.event}
            anchor={{ x: approvalDetail.x, y: approvalDetail.y }}
            onClose={() => setApprovalDetail(null)}
          />
        )}
      </header>

      {bannerMessage && (
        <div className="google-error-banner">{bannerMessage}</div>
      )}
    </>
  );
}
