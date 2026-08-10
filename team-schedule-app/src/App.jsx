import React from 'react';
import { AppProvider, useApp } from './state/store.jsx';
import Header from './components/Header.jsx';
import WeekView from './components/WeekView.jsx';
import MonthView from './components/MonthView.jsx';
import ManagerApprovalList from './components/ManagerApprovalList.jsx';
import { useIsMobile } from './utils/useIsMobile.js';

function Shell() {
  const { view, role } = useApp();
  const isMobile = useIsMobile();

  // 팀장이 모바일로 접속하면 승인/거절/시간변경에 최적화된 리스트 화면을 우선 노출.
  // 코디네이터의 메인 작업화면은 PC 캘린더 사용성을 최우선으로 한다.
  const showMobileApproval = isMobile && role === 'manager';

  return (
    <div className="app-root">
      <Header />
      <main className="main-area">
        {showMobileApproval ? (
          <ManagerApprovalList />
        ) : view === 'month' ? (
          <MonthView />
        ) : (
          <WeekView />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
