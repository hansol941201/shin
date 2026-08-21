import type { PatentRecord, PourStorage } from "./index";

declare const PourPatents: {
  STORAGE_KEY: string;
  NOT_FOUND_MESSAGE: string;
  NO_RESULT_MESSAGE: string;
  NEED_UPLOAD_MESSAGE: string;

  normalizeNumber(raw: unknown): string;
  formatNumber(number: unknown): string;
  tabLabel(record: { number: string; prefix?: string } | string): string;
  emptyMessage(storage?: PourStorage): string;

  detectColumns(headerRow: unknown[]): Record<string, number>;
  parseRows(rows: unknown[][]): { ok: boolean; message?: string; records?: PatentRecord[]; errors: { row: number; reason: string }[]; duplicated?: number };
  load(rows: unknown[][], storage?: PourStorage): { ok: boolean; message?: string; inserted?: number; updated?: number; duplicated?: number; errors: { row: number; reason: string }[]; total?: number };

  search(query: string, limit?: number, storage?: PourStorage): { number: string; name: string; category: string; label: string }[];
  browse(limit?: number, storage?: PourStorage): { number: string; name: string; category: string; label: string }[];
  find(number: string, storage?: PourStorage): PatentRecord | null;
  categoriesFor(numbers: string[], storage?: PourStorage): string[];
  list(storage?: PourStorage): PatentRecord[];
  clear(storage?: PourStorage): void;
};

export default PourPatents;
