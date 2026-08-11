import React from 'react';
import { useApp } from '../state/store.jsx';

// 상단의 작은 Google 연결 버튼. 연동 전/후 상태만 최소한으로 보여준다.
export default function GoogleConnectButton() {
  const {
    googleConfigured,
    googleClientIdValid,
    googleClientIdMasked,
    googleSignedIn,
    googleUserEmail,
    googleAuthLoading,
    signInGoogle,
    signOutGoogle,
  } = useApp();

  if (!googleConfigured) {
    return (
      <span className="google-btn google-btn-disabled" title="VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다(README 참고)">
        Google 미설정
      </span>
    );
  }

  if (!googleClientIdValid) {
    return (
      <span
        className="google-btn google-btn-disabled google-btn-warn"
        title={`Client ID 형식이 올바르지 않습니다(".apps.googleusercontent.com"으로 끝나야 함). 현재 값: ${googleClientIdMasked || '(비어있음)'} · 구글연동설정.bat을 다시 실행해주세요.`}
      >
        Client ID 형식 오류
      </span>
    );
  }

  if (googleSignedIn) {
    return (
      <button className="google-btn google-btn-connected" onClick={signOutGoogle} title="클릭하면 연결이 해제됩니다">
        <span className="google-dot" />
        <span className="google-btn-text">
          <span className="google-btn-line1">Google 연결됨</span>
          {googleUserEmail && <span className="google-btn-line2">{googleUserEmail}</span>}
        </span>
      </button>
    );
  }

  return (
    <button className="google-btn" onClick={signInGoogle} disabled={googleAuthLoading}>
      {googleAuthLoading ? '연결 중…' : 'Google 캘린더 연결'}
    </button>
  );
}
