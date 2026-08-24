import React, { useRef, useState } from 'react';
import { useApp } from '../state/store.jsx';
import PopoverShell from './PopoverShell.jsx';
import { hasEverConnectedGoogle, IS_DEV } from '../services/googleAuth.js';

// 상단 헤더에 항상 보이는 Google 연결 상태 버튼.
// 상태(미설정/형식오류/미로그인/로그인됨)와 무관하게 절대 사라지지 않으며,
// 미설정/형식오류 상태에서도 클릭하면 안내 팝오버가 뜨도록 항상 버튼(클릭 가능)으로 렌더링한다.
export default function GoogleConnectButton() {
  const {
    googleConfigured,
    googleClientIdValid,
    googleClientIdMasked,
    googleSignedIn,
    googleUserEmail,
    googleAuthLoading,
    googleRestoring,
    signInGoogle,
    signOutGoogle,
  } = useApp();
  const [infoAnchor, setInfoAnchor] = useState(null);
  const btnRef = useRef(null);

  function openInfo() {
    const rect = btnRef.current.getBoundingClientRect();
    setInfoAnchor({ x: rect.left, y: rect.bottom + 6 });
  }
  function closeInfo() {
    setInfoAnchor(null);
  }

  function handleClick() {
    if (!googleConfigured) return openInfo();
    if (!googleClientIdValid) return openInfo();
    if (googleSignedIn) return signOutGoogle();
    signInGoogle();
  }

  // 이전에 한 번이라도 연결에 성공했던 사용자면 "다시 연결"로, 완전히
  // 처음이면 "연결"로 문구를 구분한다(요구된 UX: 정상 연결 상태에서는
  // 버튼을 작게, 끊겼을 때만 "다시 연결"로 안내).
  const isReconnect = hasEverConnectedGoogle();

  let label = isReconnect ? 'Google 다시 연결' : 'Google 캘린더 연결';
  let extraClass = '';
  if (!googleConfigured) {
    label = 'Google 미설정';
    extraClass = 'google-btn-disabled';
  } else if (!googleClientIdValid) {
    label = 'Client ID 오류';
    extraClass = 'google-btn-warn';
  } else if (googleSignedIn) {
    label = 'Google 연결됨';
    extraClass = 'google-btn-connected';
  } else if (googleRestoring) {
    label = '연결 확인 중…';
    extraClass = 'google-btn-disabled';
  } else if (googleAuthLoading) {
    label = '연결 중…';
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`google-btn ${extraClass}`}
        onClick={handleClick}
        disabled={googleAuthLoading || googleRestoring}
        title={
          !googleConfigured
            ? 'Google 연동이 설정되지 않았습니다. 클릭해서 설정 방법을 확인하세요.'
            : !googleClientIdValid
            ? 'Client ID 형식이 올바르지 않습니다. 클릭해서 자세히 보기.'
            : googleSignedIn
            ? '클릭하면 연결이 해제됩니다'
            : googleRestoring
            ? '이전 연결 정보를 확인하는 중입니다…'
            : 'Google 캘린더에 연결합니다'
        }
      >
        {googleSignedIn && <span className="google-dot" />}
        <span className="google-btn-text">
          <span className="google-btn-line1">{label}</span>
          {googleSignedIn && googleUserEmail && <span className="google-btn-line2">{googleUserEmail}</span>}
        </span>
      </button>

      {infoAnchor && (
        <PopoverShell anchor={infoAnchor} onClose={closeInfo} width={280}>
          <div className="pv-head">
            <span className="pv-title-sm">
              {!googleConfigured ? 'Google 연동 설정 안내' : 'Client ID 형식 오류'}
            </span>
            <button className="pv-close" onClick={closeInfo}>✕</button>
          </div>
          {!googleConfigured && (
            <div className="pv-hint">
              Google Client ID: <b>미설정</b><br />
              {IS_DEV ? (
                <>
                  Windows에서는 <b>구글연동설정.bat</b>을 실행해 Google Cloud에서
                  발급받은 OAuth Client ID를 입력하고, 팀장 일정 앱을 다시
                  실행해주세요. (README의 &quot;Google Calendar 연동 설정&quot; 참고)
                </>
              ) : (
                <>
                  Google 연동 설정이 배포에 적용되지 않았습니다. 저장소
                  Settings → Secrets and variables → Actions에{' '}
                  <b>VITE_GOOGLE_CLIENT_ID</b>를 등록한 뒤, 배포 워크플로를
                  다시 실행(재배포)하면 반영됩니다.
                </>
              )}
            </div>
          )}
          {googleConfigured && !googleClientIdValid && (
            <div className="pv-error">
              Google Client ID: {googleClientIdMasked || '(비어있음)'}<br />
              Client ID는 &quot;.apps.googleusercontent.com&quot;으로 끝나야
              합니다.{' '}
              {IS_DEV ? (
                <><b>구글연동설정.bat</b>을 다시 실행해 값을 정확히 다시 입력해주세요.</>
              ) : (
                <>저장소 Secret에 등록한 값이 올바른 Client ID 형식인지 확인 후
                  재배포해주세요.</>
              )}
            </div>
          )}
        </PopoverShell>
      )}
    </>
  );
}
