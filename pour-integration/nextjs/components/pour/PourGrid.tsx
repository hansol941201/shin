"use client";
/** 엑셀형 표 — 정렬 · 열 필터 · 열 너비 조절 · 행 선택 · 머리글/식별 열 고정 */
import { useCallback, useMemo, useRef, useState } from "react";
import PourRecords from "@/lib/pour/core/pour-records.js";
import type { Column, PourRecord } from "@/lib/pour/core";

const WRAP_TYPES = new Set(["list", "patent", "thirdNumbers", "thirdNames", "thirdCompanies"]);

export interface PourGridProps {
  columns: Column[];
  records: PourRecord[];
  selectedId?: string | null;
  showFilters?: boolean;
  emptyText?: string;
  onSelect?: (record: PourRecord) => void;
  onOpen?: (record: PourRecord) => void;
  onVisibleChange?: (records: PourRecord[]) => void;
}

export default function PourGrid({
  columns, records, selectedId, showFilters = false, emptyText,
  onSelect, onOpen, onVisibleChange
}: PourGridProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [widths, setWidths] = useState<Record<string, number>>({});
  const reported = useRef<PourRecord[]>([]);

  const visible = useMemo(() => {
    let rows = records.filter((rec) =>
      columns.every((col) => {
        const q = (filters[col.key] || "").trim().toUpperCase();
        if (!q) return true;
        return PourRecords.displayValue(rec, col, 0).toUpperCase().includes(q);
      })
    );
    if (sortKey) {
      const column = columns.find((c) => c.key === sortKey);
      if (column) rows = PourRecords.sortRecords(rows, sortKey, sortDir);
    }
    return rows;
  }, [records, columns, filters, sortKey, sortDir]);

  if (onVisibleChange && reported.current !== visible) {
    reported.current = visible;
    queueMicrotask(() => onVisibleChange(visible));
  }

  const toggleSort = useCallback((key: string) => {
    setSortDir((prev) => (sortKey === key && prev === "asc" ? "desc" : "asc"));
    setSortKey(key);
  }, [sortKey]);

  const startResize = useCallback((event: React.PointerEvent, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    const th = (event.currentTarget as HTMLElement).parentElement;
    if (!th) return;
    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;
    const move = (e: PointerEvent) => {
      setWidths((prev) => ({ ...prev, [key]: Math.max(50, Math.round(startWidth + e.clientX - startX)) }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  return (
    <div className="pour-grid-wrap">
      <table className="pour-grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.pin ? "is-pinned" : undefined}
                style={widths[col.key] ? { width: widths[col.key] } : undefined}
              >
                <span
                  className="pour-th-label"
                  title={`${col.title} — 눌러서 정렬`}
                  onClick={() => col.type !== "seq" && toggleSort(col.key)}
                >
                  {col.title}
                </span>
                {sortKey === col.key && (
                  <span className="pour-sort">{sortDir === "desc" ? "▼" : "▲"}</span>
                )}
                {filters[col.key] && <span className="pour-filtered">▣</span>}
                {col.type !== "seq" && (
                  <span className="pour-resize" onPointerDown={(e) => startResize(e, col.key)} />
                )}
              </th>
            ))}
          </tr>
          {showFilters && (
            <tr className="pour-filter-row">
              {columns.map((col) => (
                <th key={col.key} className={col.pin ? "is-pinned" : undefined}>
                  {col.type !== "seq" && (
                    <input
                      type="search"
                      placeholder="필터"
                      data-filter={col.key}
                      value={filters[col.key] || ""}
                      onChange={(e) =>
                        setFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                      }
                    />
                  )}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {visible.map((rec, index) => {
            const stats = PourRecords.patentStats(rec, null);
            return (
              <tr
                key={rec.id}
                data-record-id={rec.id}
                className={rec.id === selectedId ? "is-selected" : undefined}
                onClick={() => onSelect?.(rec)}
                onDoubleClick={() => onOpen?.(rec)}
              >
                {columns.map((col) => {
                  const value = PourRecords.displayValue(rec, col, index);
                  const className = [
                    col.pin ? "is-pinned" : "",
                    WRAP_TYPES.has(col.type) ? "cell-wrap" : "",
                    col.type === "number" || col.type === "money" ? "cell-num" : "",
                    col.type === "seq" ? "cell-seq" : ""
                  ].filter(Boolean).join(" ");

                  if (col.key === "status") {
                    return (
                      <td key={col.key} className={className || undefined}>
                        <span className="pour-status-badge" data-status={value}>{value}</span>
                        {(stats.isMulti || stats.noticeMultiFlag) && (
                          <span className="pour-multi-badge" data-badge={stats.badge} title={stats.detail}>
                            {stats.label}
                          </span>
                        )}
                      </td>
                    );
                  }
                  if (WRAP_TYPES.has(col.type)) {
                    // 줄 수가 많으면 행이 지나치게 높아지므로 세 줄까지만 보여 준다
                    const clamped = value.split("\n").length > 3;
                    return (
                      <td key={col.key} className={className || undefined} title={value || undefined}>
                        <span className={`cell-lines${clamped ? " is-clamped" : ""}`}>{value}</span>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={className || undefined} title={value || undefined}>
                      {value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!visible.length && (
        <div className="pour-grid-empty">{emptyText || "표시할 자료가 없습니다."}</div>
      )}
    </div>
  );
}
