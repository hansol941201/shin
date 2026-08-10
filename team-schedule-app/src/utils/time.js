// 시간 계산 유틸리티
// 근무시간/점심시간은 설정 가능한 값으로 다룬다 (기본값만 여기 상수로 정의).

export const DEFAULT_SETTINGS = {
  workStartMin: 9 * 60, // 09:00
  workEndMin: 18 * 60, // 18:00
  lunchStartMin: 12 * 60, // 12:00
  lunchEndMin: 13 * 60, // 13:00
  slotMinutes: 30, // 내부적으로 30분 단위 선택 가능
  hourLabelStart: 9,
  hourLabelEnd: 18,
};

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatHM(minutesFromMidnight) {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatTimeRange(startMin, endMin) {
  return `${formatHM(startMin)}–${formatHM(endMin)}`;
}

export function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMinutes(date, n) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + n);
  return d;
}

// 해당 날짜가 속한 주의 월요일을 반환
export function getWeekStart(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=일 ... 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(d, diffToMonday);
}

export function getWeekdays(weekStart) {
  return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
}

export function weekdayLabel(date) {
  return WEEKDAY_KR[date.getDay()];
}

export function isSameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

export function formatMonthLabel(anyDateInMonth) {
  return `${anyDateInMonth.getFullYear()}년 ${anyDateInMonth.getMonth() + 1}월`;
}

export function formatMonthRange(weekStart) {
  const end = addDays(weekStart, 4);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startStr = `${weekStart.getMonth() + 1}월 ${weekStart.getDate()}일`;
  const endStr = sameMonth
    ? `${end.getDate()}일`
    : `${end.getMonth() + 1}월 ${end.getDate()}일`;
  return `${weekStart.getFullYear()}년 ${startStr} - ${endStr}`;
}

// 특정 날짜의 근무시간 구간에서, 주어진 busy 구간(분단위, 당일 기준)들을 뺀
// 빈 시간 구간을 병합된 형태로 반환한다. 점심시간은 별도로 제외된다.
export function computeFreeBlocks(busyIntervals, settings = DEFAULT_SETTINGS) {
  const { workStartMin, workEndMin, lunchStartMin, lunchEndMin } = settings;

  // 점심시간도 "막힌 시간"으로 취급해 계산에서 제외
  const blocked = [...busyIntervals, { start: lunchStartMin, end: lunchEndMin }]
    .filter((b) => b.end > workStartMin && b.start < workEndMin)
    .map((b) => ({ start: Math.max(b.start, workStartMin), end: Math.min(b.end, workEndMin) }))
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const b of blocked) {
    if (merged.length && b.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
    } else {
      merged.push({ ...b });
    }
  }

  const free = [];
  let cursor = workStartMin;
  for (const b of merged) {
    if (b.start > cursor) {
      free.push({ start: cursor, end: b.start });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < workEndMin) {
    free.push({ start: cursor, end: workEndMin });
  }
  // 너무 짧은(0분) 조각 제거
  return free.filter((f) => f.end - f.start >= 1);
}

// 마우스 Y좌표 -> 30분 단위로 스냅된 "분(min from work start)" 값
export function snapMinutesToSlot(minutes, slot = 30) {
  return Math.round(minutes / slot) * slot;
}
