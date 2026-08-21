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
  update(id: string, changes: Record<string, unknown>, storage?: PourStorage): { ok: boolean; record?: PourRecord; message?: string };
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
