/* ==========================================================================
   일정(월간 달력) 데이터 계층
   화면 코드와 분리되어 있어 나중에 서버 API 로 바꿀 때 이 파일만 교체하면 된다.
   저장된 일정이 없을 때만 화면에 예시를 띄우며, 예시는 저장소에 절대 기록하지 않는다.
   기본 저장소는 index.html 의 state.schedules + saveState() (이 브라우저의 localStorage)이며,
   ScheduleStore.use({ read, write }) 로 다른 저장소를 끼워 넣을 수 있다.
   ========================================================================== */

/* 일정 유형 — 필터 칩과 색상에 함께 쓰인다. */
const SCHEDULE_TYPES = [
  { id: '영업',   color: '#2f6fb0', soft: '#e8f1fb' },
  { id: 'PT',     color: '#7c56c9', soft: '#f0eafc' },
  { id: '현설',   color: '#0f8a72', soft: '#e4f5f0' },
  { id: '세미나', color: '#b0730f', soft: '#fdf1de' },
  { id: '아스퀘', color: '#3f6b8c', soft: '#e9f0f6' },
  { id: '개인',   color: '#5a6472', soft: '#eef0f3' },
  { id: '휴가',   color: '#c2544f', soft: '#fdeceb' },
  { id: '회의',   color: '#1f7a8c', soft: '#e5f3f5' }
];
const SCHEDULE_TYPE_IDS = SCHEDULE_TYPES.map(t => t.id);
const SCHEDULE_STATUSES = ['확정', '미확정'];

/* 이 달력은 '조재연' 담당 일정만 보여 준다(원본 데이터는 지우지 않고 화면에서만 거른다). */
const SCHEDULE_OWNER_FOCUS = '조재연';

/* 대한민국 공휴일
   - FIXED: 매년 같은 날짜(양력)
   - LUNAR_BY_YEAR: 해마다 날짜가 바뀌는 음력 명절. 연도별로 채워 넣으면 그대로 표시된다.
     (대체공휴일은 확정되는 대로 해당 연도 배열에 추가하면 된다) */
const HOLIDAYS_FIXED = {
  '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일',
  '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절'
};
const HOLIDAYS_LUNAR_BY_YEAR = {
  2025: { '01-28': '설 연휴', '01-29': '설날', '01-30': '설 연휴', '05-05': '부처님오신날', '10-05': '추석 연휴', '10-06': '추석', '10-07': '추석 연휴' },
  2026: { '02-16': '설 연휴', '02-17': '설날', '02-18': '설 연휴', '05-24': '부처님오신날', '09-24': '추석 연휴', '09-25': '추석', '09-26': '추석 연휴' },
  2027: { '02-06': '설 연휴', '02-07': '설날', '02-08': '설 연휴', '05-13': '부처님오신날', '09-14': '추석 연휴', '09-15': '추석', '09-16': '추석 연휴' }
};
function holidayName(dateKey){
  const [year, month, day] = String(dateKey || '').split('-');
  const md = `${month}-${day}`;
  const lunar = HOLIDAYS_LUNAR_BY_YEAR[Number(year)];
  return (lunar && lunar[md]) || HOLIDAYS_FIXED[md] || '';
}

/* ---------- 날짜 도우미 (한국어 표기) ---------- */
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function dateKeyOf(dateObj){
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayKey(){ return dateKeyOf(new Date()); }
function formatDateKo(dateKey){
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if(!y) return '';
  const weekday = WEEKDAY_KO[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}
function formatTimeKo(time){
  const raw = String(time || '').trim();
  if(!/^\d{1,2}:\d{2}$/.test(raw)) return raw;
  const [hour, minute] = raw.split(':').map(Number);
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`;
}

/* ---------- 담당자 ---------- */
/* 담당자는 배열/쉼표 문자열 어느 쪽으로 들어와도 같은 방식으로 다룬다. */
function ownerList(schedule){
  const raw = schedule && (schedule.owners ?? schedule.owner);
  const parts = Array.isArray(raw) ? raw : String(raw || '').split(/[,·/]/);
  return parts.map(name => String(name).trim()).filter(Boolean);
}
/* 담당자 이름은 앞뒤 공백만 무시하고 정확히 일치할 때만 본인 일정으로 본다.
   일정 내용(제목·현장·메모 등)에 이름이 들어 있는 경우도 함께 표시한다. */
function isOwnedBy(schedule, name = SCHEDULE_OWNER_FOCUS){
  if(!schedule) return false;
  const target = String(name).trim();
  if(ownerList(schedule).some(owner => owner === target)) return true;
  const text = [schedule.title, schedule.memo, schedule.site, schedule.client, schedule.trade]
    .map(value => String(value || '')).join(' ');
  return text.includes(target);
}

/* ---------- 조회 ---------- */
/* 화면에 보여 줄 일정만 걸러 낸다. 저장된 원본은 그대로 둔다. */
function visibleSchedules(list, { type = '전체', owner = SCHEDULE_OWNER_FOCUS } = {}){
  return (Array.isArray(list) ? list : [])
    .filter(item => item && !item.deleted)
    .filter(item => isOwnedBy(item, owner))
    .filter(item => type === '전체' || item.type === type);
}
function schedulesOnDate(list, dateKey, options){
  return visibleSchedules(list, options)
    .filter(item => item.date === dateKey)
    .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
}
function groupByDate(list, options){
  const map = new Map();
  for(const item of visibleSchedules(list, options)){
    if(!map.has(item.date)) map.set(item.date, []);
    map.get(item.date).push(item);
  }
  for(const rows of map.values()){
    rows.sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  }
  return map;
}

/* ---------- 저장소 ---------- */
/* 기본은 index.html 의 state.schedules. use() 로 API 어댑터를 끼우면 화면 코드는 그대로 둔 채 교체된다. */
const ScheduleStore = {
  adapter: { read: () => [], write: () => {} },
  use(adapter){ if(adapter && typeof adapter.read === 'function') this.adapter = adapter; },
  list(){ const rows = this.adapter.read(); return Array.isArray(rows) ? rows : []; },
  find(id){ return this.list().find(item => item.id === id) || null; },
  add(input){
    const now = new Date().toISOString();
    const item = { ...normalizeSchedule(input), id: `sch-${Math.random().toString(36).slice(2, 10)}`, createdAt: now, updatedAt: now };
    this.adapter.write([...this.list(), item]);
    return item;
  },
  update(id, patch){
    const rows = this.list();
    const index = rows.findIndex(item => item.id === id);
    if(index < 0) return null;
    const merged = { ...rows[index], ...normalizeSchedule({ ...rows[index], ...patch }), id, updatedAt: new Date().toISOString() };
    const next = rows.slice();
    next[index] = merged;
    this.adapter.write(next);
    return merged;
  },
  remove(id){
    this.adapter.write(this.list().filter(item => item.id !== id));
  },
};

function normalizeSchedule(input = {}){
  return {
    date: String(input.date || todayKey()),
    time: String(input.time || '').trim(),
    endTime: String(input.endTime || '').trim(),
    type: SCHEDULE_TYPE_IDS.includes(input.type) ? input.type : '영업',
    title: String(input.title || '').trim(),
    status: SCHEDULE_STATUSES.includes(input.status) ? input.status : '미확정',
    owners: ownerList(input),
    site: String(input.site || '').trim(),      // 현장명
    trade: String(input.trade || '').trim(),    // 공종
    client: String(input.client || '').trim(),  // 요청 업체
    memo: String(input.memo || '').trim()
  };
}

/* ---------- 예시 일정 ---------- */
/* 저장된 일정이 하나도 없을 때 화면에만 띄우는 예시(저장하지 않는다).
   마지막 두 건은 조재연 담당이 아니라서 화면에는 나오지 않는다(필터 확인용). */
function sampleSchedules(base = new Date()){
  const day = (offset) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    return dateKeyOf(d);
  };
  return [
    { date: day(0),  time: '10:00', type: '영업',   title: '한솔아파트 리모델링 영업 방문', status: '확정',   owners: ['조재연'], site: '한솔아파트', trade: '방수', client: '㈜금화기업' },
    { date: day(0),  time: '14:30', type: '회의',   title: '주간 영업 회의',               status: '확정',   owners: ['조재연', '천민호'], site: '본사 3층 회의실', trade: '', client: '' },
    { date: day(1),  time: '09:30', type: 'PT',     title: '자오건설 공법설명회',           status: '미확정', owners: ['조재연'], site: '자오건설 본사', trade: '보수보강', client: '자오건설' },
    { date: day(2),  time: '13:00', type: '현설',   title: '우단건설 현장설명회',           status: '확정',   owners: ['조재연', '김대리'], site: '우단 2차 현장', trade: '균열보수', client: '우단건설' },
    { date: day(5),  time: '11:00', type: '세미나', title: '건설신기술 세미나 참석',         status: '미확정', owners: ['조재연'], site: '코엑스 3층', trade: '', client: '' },
    { date: day(7),  time: '',      type: '휴가',   title: '연차',                          status: '확정',   owners: ['조재연'], site: '', trade: '', client: '' },
    { date: day(9),  time: '15:00', type: '아스퀘', title: '아스퀘 시공 협의',              status: '미확정', owners: ['조재연'], site: '아스퀘 현장', trade: '아스팔트', client: '아스퀘' },
    { date: day(12), time: '18:30', type: '개인',   title: '자격증 스터디',                 status: '확정',   owners: ['조재연'], site: '', trade: '', client: '' },
    { date: day(1),  time: '10:00', type: '영업',   title: '타팀 영업 방문(다른 담당자)',    status: '확정',   owners: ['홍길동'], site: '', trade: '', client: '' },
    { date: day(3),  time: '16:00', type: 'PT',     title: '타팀 공법설명회(다른 담당자)',   status: '미확정', owners: ['이순신', '강감찬'], site: '', trade: '', client: '' }
  ];
}
