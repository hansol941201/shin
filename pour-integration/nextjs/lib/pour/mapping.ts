/**
 * 기존 projects 행 ↔ 화면이 쓰는 record 형식 변환
 *
 * ⚠ 적용 전에 반드시 `drizzle/verify.sql` 의 1번 질의로 실제 열 이름을 확인하고
 *    아래 COLUMN_MAP 을 운영 스키마에 맞춰 고치세요.
 *    (여기 값은 db/schema.ts 에서 흔히 쓰는 이름을 기준으로 한 초기값입니다.)
 *
 * 원칙
 *  - 모르는 열은 건드리지 않는다. 변환에서 빠진 열은 그대로 둔다.
 *  - expected_amount 같이 화면에서 쓰지 않는 열도 읽어서 그대로 되돌려 준다.
 *  - 전화번호는 문자열로 유지한다 (앞자리 0 보존).
 */
import type { PourRecord, PatentItem } from "./core";

/** 화면 필드 → projects 열 이름 */
export const COLUMN_MAP = {
  id: "id",
  status: "status",
  client: "client",
  region: "region",
  city: "city",
  projectNames: "project_name",
  categories: "category",
  scopes: "scopes",
  phone: "phone",
  households: "households",
  year: "record_year",
  noticeDate: "notice_date",
  documentDueDate: "document_due_date",
  bidDate: "bid_date",
  bidType: "bid_type",
  bidTypeRaw: "bid_type_raw",
  contractor: "contractor",
  contractorPhone: "contractor_phone",
  contractorContactName: "contractor_contact_name",
  contractorMobile: "contractor_mobile",
  contractorAddress: "contractor_address",
  contractorBusinessNo: "contractor_business_no",
  contractorNote: "contractor_note",
  awardDate: "award_date",
  awardAmount: "award_amount",
  expectedAmount: "expected_amount",
  agreementNo: "agreement_no",
  quality: "quality",
  address: "address",
  remark: "remark",
  noticePatentText: "notice_patent_text",
  noticeMultiFlag: "notice_multi_flag",
  patentConfirmed: "patent_confirmed",
  isRebid: "is_rebid",
  rebidRound: "rebid_round",
  rebidReason: "rebid_reason",
  previousFailDate: "previous_fail_date",
  originalProjectId: "original_project_id",
  previousProjectId: "previous_project_id",
  createdAt: "created_at",
  resultEnteredAt: "result_entered_at",
  updatedAt: "updated_at",
  /** 옛 자료에 남아 있는 특허번호 열 (있으면 POUR 특허로 옮긴다) */
  legacyPatentNumbers: "patent_numbers",
  /** 특허를 새 표로 옮겼는지 표시. 1 이면 옛 열을 더 이상 보지 않는다 */
  patentsMigrated: "patents_migrated"
} as const;

export type ProjectRow = Record<string, unknown>;

export interface PatentRow {
  id: string;
  project_id: string;
  kind: string;
  number: string;
  display: string | null;
  name: string | null;
  method: string | null;
  company: string | null;
  category: string | null;
  remark: string | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface HistoryRow {
  id: string;
  project_id: string;
  changed_at: string;
  action: string | null;
  status_before: string | null;
  status_after: string | null;
  changes_json: string | null;
}

/* ------------------------------------------------------------------ 도우미 */

const text = (v: unknown): string => (v == null ? "" : String(v));

/** 여러 줄 값. 저장은 줄바꿈으로 잇고, 읽을 때 배열로 되돌린다. */
const toList = (v: unknown): string[] => {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
};

const fromList = (v: string[] | undefined): string => (v && v.length ? v.join("\n") : "");

const toNumber = (v: unknown): number | "" => {
  if (v == null || v === "") return "";
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : "";
};

const toBool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
const fromBool = (v: unknown): number => (v ? 1 : 0);

/* ------------------------------------------------- projects 행 → record */

/**
 * @param row       projects 한 행
 * @param patents   pour_project_patents 에서 이 행에 딸린 특허들 (sort_order 순)
 * @param history   pour_project_history 에서 이 행의 수정 이력 (오래된 순)
 */
export function projectRowToRecord(
  row: ProjectRow,
  patents: PatentRow[] = [],
  history: HistoryRow[] = []
): Partial<PourRecord> & { __extra: ProjectRow } {
  const get = (field: keyof typeof COLUMN_MAP) => row[COLUMN_MAP[field]];

  // 변환에서 다루지 않는 열은 그대로 들고 다닌다 (저장할 때 되돌려 준다)
  const known = new Set<string>(Object.values(COLUMN_MAP));
  const extra: ProjectRow = {};
  Object.keys(row).forEach((key) => {
    if (!known.has(key)) extra[key] = row[key];
  });

  const patentItems: PatentItem[] = patents.map((p) => ({
    id: p.id,
    recordId: p.project_id,
    kind: p.kind === "THIRD_PARTY" ? "THIRD_PARTY" : "POUR",
    number: text(p.number),
    display: text(p.display),
    name: text(p.name),
    method: text(p.method),
    company: text(p.company),
    category: text(p.category),
    remark: text(p.remark),
    createdAt: text(p.created_at),
    updatedAt: text(p.updated_at)
  }));

  // 특허 표에 아무것도 없고 옛 열에 번호가 남아 있으면 POUR 특허로 옮긴다.
  // 한 번 옮긴 뒤(patents_migrated = 1)에는 옛 열을 보지 않는다.
  // 그래야 화면에서 특허를 모두 지웠을 때 옛 번호가 되살아나지 않는다.
  // (옛 열의 값 자체는 지우지 않고 그대로 남겨 둔다.)
  const migrated = toBool(get("patentsMigrated"));
  const legacy = !migrated && toList(get("legacyPatentNumbers")).length
    ? String(get("legacyPatentNumbers")).split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    : [];

  const record: Partial<PourRecord> & { __extra: ProjectRow } = {
    id: text(get("id")),
    status: text(get("status")) as PourRecord["status"],
    client: text(get("client")),
    region: text(get("region")),
    city: text(get("city")),
    projectNames: toList(get("projectNames")),
    categories: toList(get("categories")),
    scopes: toList(get("scopes")),
    phone: text(get("phone")),
    households: toNumber(get("households")),
    year: text(get("year")),
    noticeDate: text(get("noticeDate")),
    documentDueDate: text(get("documentDueDate")),
    bidDate: text(get("bidDate")),
    bidType: text(get("bidType")),
    bidTypeRaw: text(get("bidTypeRaw")),
    contractor: text(get("contractor")),
    contractorPhone: text(get("contractorPhone")),
    contractorContactName: text(get("contractorContactName")),
    contractorMobile: text(get("contractorMobile")),
    contractorAddress: text(get("contractorAddress")),
    contractorBusinessNo: text(get("contractorBusinessNo")),
    contractorNote: text(get("contractorNote")),
    awardDate: text(get("awardDate")),
    awardAmount: toNumber(get("awardAmount")),
    expectedAmount: toNumber(get("expectedAmount")),
    agreementNo: text(get("agreementNo")),
    quality: text(get("quality")),
    address: text(get("address")),
    remark: text(get("remark")),
    noticePatentText: text(get("noticePatentText")),
    noticeMultiFlag: toBool(get("noticeMultiFlag")),
    patentConfirmed: toBool(get("patentConfirmed")),
    isRebid: toBool(get("isRebid")),
    rebidRound: toNumber(get("rebidRound")),
    rebidReason: text(get("rebidReason")),
    previousFailDate: text(get("previousFailDate")),
    originalProjectId: text(get("originalProjectId")),
    previousProjectId: text(get("previousProjectId")),
    createdAt: text(get("createdAt")),
    resultEnteredAt: text(get("resultEnteredAt")),
    updatedAt: text(get("updatedAt")),
    history: history.map((h) => ({
      at: text(h.changed_at),
      action: text(h.action),
      statusBefore: text(h.status_before),
      statusAfter: text(h.status_after),
      changes: h.changes_json ? JSON.parse(h.changes_json) : []
    })),
    __extra: extra
  };

  // patentItems 는 "있으면 그대로, 없으면 옛 번호에서" 규칙을 따른다.
  if (patentItems.length) {
    record.patentItems = patentItems;
  } else if (legacy.length) {
    record.patentNumbers = legacy;          // core 가 POUR 특허 항목으로 만들어 준다
  } else {
    record.patentItems = [];
  }

  return record;
}

/* ------------------------------------------------- record → projects 행 */

export function recordToProjectRow(record: PourRecord & { __extra?: ProjectRow }): ProjectRow {
  const row: ProjectRow = { ...(record.__extra || {}) };   // 모르는 열은 그대로 되돌린다
  const set = (field: keyof typeof COLUMN_MAP, value: unknown) => {
    row[COLUMN_MAP[field]] = value;
  };

  set("id", record.id);
  set("status", record.status);
  set("client", record.client);
  set("region", record.region);
  set("city", record.city);
  set("projectNames", fromList(record.projectNames));
  set("categories", fromList(record.categories));
  set("scopes", fromList(record.scopes));
  set("phone", record.phone);                       // 문자열 그대로
  set("households", record.households === "" ? null : record.households);
  set("year", record.year);
  set("noticeDate", record.noticeDate);
  set("documentDueDate", record.documentDueDate);
  set("bidDate", record.bidDate);
  set("bidType", record.bidType);
  set("bidTypeRaw", record.bidTypeRaw);
  set("contractor", record.contractor);
  set("contractorPhone", record.contractorPhone);   // 발주처 전화번호와 별도 열
  set("contractorContactName", record.contractorContactName);
  set("contractorMobile", record.contractorMobile);
  set("contractorAddress", record.contractorAddress);
  set("contractorBusinessNo", record.contractorBusinessNo);
  set("contractorNote", record.contractorNote);
  set("awardDate", record.awardDate);
  set("awardAmount", record.awardAmount === "" ? null : record.awardAmount);
  set("agreementNo", record.agreementNo);
  set("quality", record.quality);
  set("address", record.address);
  set("remark", record.remark);
  set("noticePatentText", record.noticePatentText);
  set("noticeMultiFlag", fromBool(record.noticeMultiFlag));
  set("patentConfirmed", fromBool(record.patentConfirmed));
  set("isRebid", fromBool(record.isRebid));
  set("rebidRound", record.rebidRound === "" ? null : record.rebidRound);
  set("rebidReason", record.rebidReason);
  set("previousFailDate", record.previousFailDate);
  set("originalProjectId", record.originalProjectId);
  set("previousProjectId", record.previousProjectId);
  set("resultEnteredAt", record.resultEnteredAt);
  set("updatedAt", record.updatedAt);
  // 특허를 새 표로 옮겼음을 표시한다 (옛 patent_numbers 열은 그대로 둔다)
  set("patentsMigrated", 1);

  // 최초 등록일은 새로 만들 때만 넣는다 (기존 값을 덮어쓰지 않는다)
  if (record.createdAt) set("createdAt", record.createdAt);

  // expected_amount 는 화면에서 쓰지 않는다. 기존 값이 있으면 그대로 둔다.
  if (record.expectedAmount !== undefined && record.expectedAmount !== "") {
    set("expectedAmount", record.expectedAmount);
  }

  return row;
}

/** record 의 특허 항목을 pour_project_patents 행으로 바꾼다. */
export function recordToPatentRows(record: PourRecord): PatentRow[] {
  return (record.patentItems || []).map((item, index) => ({
    id: item.id,
    project_id: record.id,
    kind: item.kind,
    number: item.number,
    display: item.display,
    name: item.name,
    method: item.method,
    company: item.company,
    category: item.category,
    remark: item.remark,
    sort_order: index,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  }));
}

export function recordToHistoryRows(record: PourRecord): HistoryRow[] {
  return (record.history || []).map((entry, index) => ({
    id: `${record.id}:${index}`,
    project_id: record.id,
    changed_at: entry.at,
    action: entry.action,
    status_before: entry.statusBefore,
    status_after: entry.statusAfter,
    changes_json: JSON.stringify(entry.changes || [])
  }));
}
