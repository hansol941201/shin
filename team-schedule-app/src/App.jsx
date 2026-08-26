import React from 'react';
import { AppProvider } from './state/store.jsx';
import { SharedAppProvider } from './state/sharedStore.jsx';
import { SHARED_BACKEND_CONFIGURED } from './services/sharedBackend.js';
import Header from './components/Header.jsx';
import MonthView from './components/MonthView.jsx';
import EditCodeGate from './components/EditCodeGate.jsx';

// 팀장 전용 달력 — 역할/화면 전환 개념이 없다.
function Shell() {
  return (
    <div className="app-root">
      <Header />
      <main className="main-area">
        <MonthView />
      </main>
      {/* 공동 백엔드 모드가 아니면 editCodeGateOpen이 항상 falsy라 아무것도
          렌더링하지 않는다(store.jsx의 AppProvider는 이 필드를 안 준다). */}
      <EditCodeGate />
    </div>
  );
}

// VITE_FIREBASE_*(공동 백엔드) Secret이 설정돼 있으면 Firestore/Cloud
// Functions 기반 SharedAppProvider를, 아니면 지금까지 쓰던 사용자별
// Google OAuth 기반 AppProvider를 그대로 쓴다. 관리자가 백엔드 설정을
// 끝내기 전까지는 이 앱의 동작이 전혀 바뀌지 않는다.
const Provider = SHARED_BACKEND_CONFIGURED ? SharedAppProvider : AppProvider;

export default function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
