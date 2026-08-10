import { isSameDay, minutesOfDay } from './time.js';

// 화면/빈시간 계산에서 "막힌 시간"으로 취급할 상태
const BUSY_STATUSES = new Set(['confirmed', 'pending', 'reschedule_requested']);

export function eventsForDay(events, day) {
  return events
    .filter((e) => e.status !== 'rejected')
    .filter((e) => isSameDay(new Date(e.start), day))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

export function busyIntervalsForDay(events, day) {
  return events
    .filter((e) => BUSY_STATUSES.has(e.status))
    .filter((e) => isSameDay(new Date(e.start), day))
    .map((e) => ({
      start: minutesOfDay(new Date(e.start)),
      end: minutesOfDay(new Date(e.end)),
    }));
}
