import { addDays, addMinutes, startOfDay } from '../utils/time.js';
import { makeId } from '../utils/id.js';

// 실제 Google Calendar 연동 전, 기능 확인용 테스트 데이터.
// weekStart(해당 주 월요일 00:00)를 기준으로 월~금 일정을 생성한다.
export function buildSampleEvents(weekStart) {
  const day = (offset) => startOfDay(addDays(weekStart, offset));
  const at = (base, h, m) => addMinutes(base, h * 60 + m);

  const mon = day(0);
  const tue = day(1);
  const wed = day(2);
  const thu = day(3);
  const fri = day(4);

  const now = new Date().toISOString();

  const confirmed = (title, base, sh, sm, eh, em, location) => ({
    id: makeId('gcal'),
    title,
    start: at(base, sh, sm).toISOString(),
    end: at(base, eh, em).toISOString(),
    location: location || '',
    memo: '',
    requester: '팀장',
    manager: '팀장',
    status: 'confirmed',
    googleCalendarEventId: `gcal_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now,
    updatedAt: now,
    source: 'google',
  });

  const events = [
    confirmed('주간 업무회의', mon, 9, 0, 10, 0, '본사 회의실'),
    confirmed('현장 상담', mon, 15, 0, 16, 30, ''),
    confirmed('신광건설 1차 미팅', tue, 11, 0, 12, 0, '본사 회의실'),
    confirmed('업무 검토', tue, 13, 0, 14, 0, ''),
    confirmed('현장 방문', wed, 9, 0, 10, 30, '현장 사무소'),
    confirmed('공법 PT', wed, 13, 30, 15, 0, '본사 회의실'),
    confirmed('내부 회의', thu, 11, 0, 12, 0, ''),
    confirmed('임원 보고', thu, 16, 0, 17, 30, '본사 대회의실'),
    confirmed('외부업체 미팅', fri, 11, 0, 12, 30, '본사 회의실'),
  ];

  // 데모용: 승인대기 요청 1건
  events.push({
    id: makeId('req'),
    title: '삼우건설 협약 미팅',
    start: at(tue, 14, 0).toISOString(),
    end: at(tue, 15, 0).toISOString(),
    location: '본사 회의실',
    memo: '협약서 초안 지참',
    requester: '한솔',
    manager: '팀장',
    status: 'pending',
    googleCalendarEventId: null,
    createdAt: now,
    updatedAt: now,
    source: 'platform',
  });

  // 데모용: 팀장이 시간변경을 제안한 요청 1건
  events.push({
    id: makeId('req'),
    title: '협력사 계약 미팅',
    start: at(wed, 15, 30).toISOString(),
    end: at(wed, 16, 30).toISOString(),
    location: '',
    memo: '',
    requester: '한솔',
    manager: '팀장',
    status: 'reschedule_requested',
    // 원래 15:30~16:30 요청 -> 팀장이 16:00~17:00으로 제안 (기존 종료시각과 겹치지 않게 표기 명확화)
    proposedStart: at(wed, 16, 0).toISOString(),
    proposedEnd: at(wed, 17, 0).toISOString(),
    googleCalendarEventId: null,
    createdAt: now,
    updatedAt: now,
    source: 'platform',
  });

  return events;
}
