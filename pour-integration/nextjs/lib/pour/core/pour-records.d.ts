import type {
  PourRecord, PourStorage, Column, AwardResult, PatentStats, AlertGroup,
  PatentItem, PatentRecord, ProjectStatus
} from "./index";

declare const PourRecords: {
  STORAGE_KEY: string;
  STATUSES: ProjectStatus[];
  QUALITY_OPTIONS: string[];
  BID_TYPES: string[];
  BID_TYPE_UNKNOWN: string;
  COLUMNS: Column[];
  MAIN_COLUMNS: Column[];
  PATENT_TAB_COLUMNS: Column[];
  FIELD_LABELS: Record<string, string>;
  POUR: "POUR";
  THIRD_PARTY: "THIRD_PARTY";

  normalize(input: Partial<PourRecord> | Record<string, unknown>): PourRecord;
  normalizePatentItem(input: unknown, kind?: string): PatentItem | null;
  normalizeBidType(value: unknown): string;
  validateDates(record: { noticeDate?: string; documentDueDate?: string; bidDate?: string } | Record<string, unknown>): { ok: boolean; errors: { field: string; message: string }[] };
  createId(): string;
  displayValue(record: PourRecord, column: Column, index: number): string;
  exportValue(record: PourRecord, column: Column, index: number): string | number | null;
  usePatentStorage(storage: PourStorage | null): void;

  list(storage?: PourStorage): PourRecord[];
  save(input: Partial<PourRecord> | Record<string, unknown>, storage?: PourStorage): PourRecord;
  update(id: string, changes: Record<string, unknown>, storage?: PourStorage): {
    ok: boolean;
    record?: PourRecord;
    message?: string;
    /** 협약서 발행번호를 지웠을 때 상태를 되돌릴지 확인받아야 한다 */
    needsConfirm?: boolean;
    reason?: string;
  };

  /* --- 협약서 발행번호 (공고 → 낙찰의 핵심 처리 기준) --- */
  /** 번호가 들어오면 낙찰로 바꿀 수 있는 상태 */
  AGREEMENT_PROMOTES: string[];
  /** 낙찰 결과로 채워야 할 항목 */
  AWARD_REQUIRED: { key: string; label: string }[];
  /** 번호를 지웠을 때 되돌릴지 물어보는 문구 */
  AGREEMENT_CLEARED_MESSAGE: string;
  /** 엑셀 이전분을 나타내는 값 ("import") */
  IMPORT_SOURCE: string;
  /** 엑셀에서 옮겨 온 행인지 (협약서번호 미입력 알림에서 뺀다) */
  isImported(record: PourRecord | null | undefined): boolean;
  hasAgreement(record: PourRecord | null | undefined): boolean;
  /** 낙찰인데 아직 비어 있는 항목 이름 */
  missingAwardFields(record: PourRecord | null | undefined): string[];
  /** 확인 대기 · 추가 입력 필요 · 정리 완료 · 협약서번호 미입력 */
  agreementStage(record: PourRecord | null | undefined): string;
  award(id: string, payload: Record<string, unknown>, storage?: PourStorage): AwardResult;
  createRebid(originalId: string, changes: Record<string, unknown>, storage?: PourStorage): { ok: boolean; record?: PourRecord; round?: number; originalId?: string; message?: string };
  clear(storage?: PourStorage): void;

  patentTabs(patents: PatentRecord[], records: PourRecord[]): { number: string; label: string; name: string; category: string; active: boolean; linked: boolean }[];
  recordsForPatent(number: string, records: PourRecord[], options?: { status?: string }): PourRecord[];
  summarize(records: PourRecord[]): { total: number; awarded: number; failed: number; otherMethod: number; households: number; amount: number; regions: number };
  summaryText(label: string, summary: ReturnType<typeof PourRecords.summarize>): string;
  formatAmountShort(amount: number): string;
  formatPhone(value: unknown): string;
  applyFilters(records: PourRecord[], filters: Record<string, string>): PourRecord[];
  sortRecords(records: PourRecord[], key: string, dir?: "asc" | "desc"): PourRecord[];
  statusCounts(records: PourRecord[]): Record<string, number>;
  matchesStatusTab(record: PourRecord, tab: string): boolean;

  patentStats(record: Partial<PourRecord> | Record<string, unknown>, storage?: PourStorage | null): PatentStats;
  conflictingPatents(record: Partial<PourRecord> | Record<string, unknown>): string[];
  CONFLICT_MESSAGE: string;
  alerts(records: PourRecord[], storage?: PourStorage | null): AlertGroup[];
  isPatentResolved(record: PourRecord, storage?: PourStorage | null): boolean;
  missingPatentRecords(records: PourRecord[], storage?: PourStorage | null): PourRecord[];
  missingPatentMessage(count: number): string;
  buildHistory(before: PourRecord, after: PourRecord, action: string): unknown[];
  migratePatentItems(storage?: PourStorage, patentStorage?: PourStorage): unknown;
  rollbackMigration(storage?: PourStorage): { ok: boolean; restored?: number; message?: string };
};

export default PourRecords;
