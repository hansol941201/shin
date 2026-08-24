import React, { useState } from 'react';
import { useApp } from '../state/store.jsx';
import PopoverShell from './PopoverShell.jsx';

// 공동 백엔드 모드 전용 — 일정을 추가/수정/삭제하려는 첫 시도에서만 뜨는
// "편집 코드" 확인 팝업. Google 로그인/회원가입 화면이 아니라 아주 짧은
// 코드 하나만 물어본다. 성공하면 서버가 내려준 토큰이 이 브라우저에
// 저장되어(코드 원문 아님) 한동안(기본 90일) 다시 묻지 않는다.
export default function EditCodeGate() {
  const { editCodeGateOpen, editCodeError, editCodeSubmitting, submitEditCode, closeEditCodeGate } = useApp();
  const [code, setCode] = useState('');

  if (!editCodeGateOpen) return null;

  async function handleSubmit() {
    if (!code.trim()) return;
    await submitEditCode(code.trim());
    setCode('');
  }

  return (
    <PopoverShell anchor={{ x: window.innerWidth / 2 - 140, y: window.innerHeight / 3 }} onClose={closeEditCodeGate} width={280}>
      <div className="pv-head">
        <span className="pv-title-sm">편집 코드 확인</span>
        <button className="pv-close" onClick={closeEditCodeGate} aria-label="닫기">✕</button>
      </div>
      <div className="pv-hint" style={{ marginBottom: 8 }}>
        일정을 추가/수정/삭제하려면 편집 코드를 입력해주세요. 한 번 확인하면
        이 브라우저에서는 한동안 다시 묻지 않습니다.
      </div>
      <input
        className="pv-input"
        type="password"
        inputMode="numeric"
        placeholder="편집 코드"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
      />
      {editCodeError && <div className="pv-error">{editCodeError}</div>}
      <button className="pv-submit" onClick={handleSubmit} disabled={editCodeSubmitting || !code.trim()}>
        {editCodeSubmitting ? '확인 중…' : '확인'}
      </button>
    </PopoverShell>
  );
}
