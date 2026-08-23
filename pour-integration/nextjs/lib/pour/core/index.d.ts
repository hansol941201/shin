/**
 * 검증이 끝난 공용 로직(UMD)의 타입 선언.
 *
 * 로직을 TypeScript 로 다시 쓰지 않고 그대로 가져다 씁니다.
 * 이미 272건의 테스트로 검증된 코드라 다시 옮기면서 동작이 달라질 위험을 없애기 위함입니다.
 * (webpack 이 CommonJS 로 해석하므로 Next.js 에서 그대로 import 됩니다.)
 */

export type PatentKind = "POUR" | "THIRD_PARTY";

export interface PatentItem {
  id: string;
  recordId: string;
  kind: PatentKind;
  number: string;
  display: string;
  name: string;
  method: string;
  company: string;
  category: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface HistoryEntry {
  at: string;
  action: string;
  statusBefore: string;
  statusAfter: string;
  changes: HistoryChange[];
}

export type ProjectStatus = "공고" | "낙찰" | "유찰" | "공고취소" | "재공고" | "타공법 낙찰";

/** 화면과 API 가 주고받는 공고·실적 한 건. */
/** 공종 한 건 — 대분류와 세부 공종 짝 */
export interface CategoryItem {
  group: string;
  name: string;
}

export interface PourRecord {
  id: string;
  status: ProjectStatus;
  client: string;
  region: string;
  city: string;
  projectNames: string[];
  categories: string[];
  categoryItems: CategoryItem[];
  categoryGroups: string[];
  scopes: string[];
  scope: string;
  phone: string;
  households: number | "";
  year: string;
  /** 어디서 들어온 자료인지 ("import" = 연도별 실적 List 이전분) */
  source: string;
  /** 원본 위치 ("2025년 348행") */
  sourceRef: string;
  /** 겹치는 줄이면 먼저 나온 줄의 id */
  duplicateOf: string;
  noticeDate: string;
  documentDueDate: string;
  /** K-APT 공고번호 (공고 단계에서 확인) */
  noticeNo: string;
  /** 협약사 여부 ("예"/"아니오"/빈 값). agreementNo 와는 다른 뜻이다 */
  isPartner: string;
  bidDate: string;
  bidType: string;
  bidTypeRaw: string;
  contractor: string;
  contractorPhone: string;
  contractorContactName: string;
  contractorMobile: string;
  contractorAddress: string;
  contractorBusinessNo: string;
  contractorNote: string;
  awardDate: string;
  awardAmount: number | "";
  agreementNo: string;
  quality: string;
  address: string;
  remark: string;
  noticePatentText: string;
  patentItems: PatentItem[];
  patentNumbers: string[];
  patentNames: string[];
  thirdPatentNumbers: string[];
  noticeMultiFlag: boolean;
  patentConfirmed: boolean;
  expectedAmount: number | "";
  isRebid: boolean;
  rebidRound: number | "";
  rebidReason: string;
  previousFailDate: string;
  originalProjectId: string;
  previousProjectId: string;
  createdAt: string;
  resultEnteredAt: string;
  updatedAt: string;
  history: HistoryEntry[];
}

export interface PatentRecord {
  number: string;
  name: string;
  category: string;
  categories: string[];
  company: string;
  prefix: string;
  remark: string;
  active: boolean;
  /** 개별 특허 한 건의 구분 ("POUR" / "타사" / "미분류"). 현장 전체 구분과는 다르다. */
  patentType?: string;
  /** 공법명. 특허명(name)과 따로 둔다. */
  methodName?: string;
  /** 이 번호를 현장에서 처음 본 날 */
  firstSeenAt?: string;
  /** 마지막으로 본 날 */
  lastSeenAt?: string;
}

/** 현장에 들어간 특허 한 건을 풀어 본 결과 (개별 구분을 그대로 지킨다) */
export interface PatentBreakdownItem {
  number: string;
  display: string;
  /** 현장에서 사람이 고른 값 ("POUR" | "THIRD_PARTY") */
  kind: string;
  /** 개별 특허의 구분 ("POUR" / "타사" / "미분류") */
  type: string;
  company: string;
  name: string;
  method: string;
}

/** getItem/setItem 만 있으면 어떤 저장소든 쓸 수 있다. */
export interface PourStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Column {
  key: string;
  title: string;
  type: string;
  width?: number;
  pin?: boolean;
}

export interface AwardResult {
  ok: boolean;
  record?: PourRecord;
  message?: string;
  needsConfirm?: boolean;
  fields?: Record<string, string>;
}

export interface PatentStats {
  pourCount: number;
  thirdCount: number;
  totalCount: number;
  isMulti: boolean;
  noticeMultiFlag: boolean;
  badge: "pour" | "mixed" | "third" | "unknown";
  badgeColor: string;
  label: string;
  detail: string;
  status: string;
  unverified: string[];
}

export interface AlertGroup {
  key: "missingPour" | "multiUnknown" | "kindCheck";
  label: string;
  count: number;
  records: PourRecord[];
}
