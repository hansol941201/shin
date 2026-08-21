"use client";
/** POUR 특허 / 타사 특허 2탭 입력기 — 자동완성 드롭다운 포함 */
import { useCallback, useEffect, useMemo, useState } from "react";
import PourPatents from "@/lib/pour/core/pour-patents.js";
import PourRecords from "@/lib/pour/core/pour-records.js";
import type { PatentItem, PourStorage } from "@/lib/pour/core";

const POUR = "POUR";
const THIRD = "THIRD_PARTY";

export interface PatentEditorValue {
  patentItems: PatentItem[];
  noticeMultiFlag: boolean;
}

export interface PatentEditorProps {
  storage: PourStorage;
  value: PatentEditorValue;
  onChange: (value: PatentEditorValue) => void;
  /** 공종 칸에 자동 입력할 때 부른다 */
  onCategories?: (categories: string[]) => void;
}

export default function PatentEditor({ storage, value, onChange, onCategories }: PatentEditorProps) {
  const [tab, setTab] = useState<typeof POUR | typeof THIRD>(POUR);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [warning, setWarning] = useState("");
  const [third, setThird] = useState({ number: "", name: "", company: "", category: "", remark: "" });

  const pourItems = useMemo(
    () => value.patentItems.filter((i) => i.kind === POUR), [value.patentItems]);
  const thirdItems = useMemo(
    () => value.patentItems.filter((i) => i.kind === THIRD), [value.patentItems]);

  // 고른 POUR 특허에서 공종을 다시 계산한다 (중복 제거)
  useEffect(() => {
    if (!onCategories) return;
    onCategories(PourPatents.categoriesFor(pourItems.map((i) => i.number), storage));
  }, [pourItems, storage, onCategories]);

  // POUR 와 타사에 같은 번호가 들어갔는지 확인
  useEffect(() => {
    const clash = PourRecords.conflictingPatents({ patentItems: value.patentItems });
    setWarning(clash.length ? PourRecords.CONFLICT_MESSAGE : "");
  }, [value.patentItems]);

  const suggestions = useMemo(() => {
    const q = query.trim();
    return q ? PourPatents.search(q, 10, storage) : PourPatents.browse(10, storage);
  }, [query, storage]);

  const emit = useCallback((items: PatentItem[]) => {
    onChange({ patentItems: items, noticeMultiFlag: value.noticeMultiFlag });
  }, [onChange, value.noticeMultiFlag]);

  const addPour = useCallback((number: string, name: string, category: string) => {
    if (value.patentItems.some((i) => i.kind === POUR && i.number === number)) {
      setWarning(`이미 추가된 특허입니다: ${PourPatents.formatNumber(number)}`);
      return;
    }
    const item = PourRecords.normalizePatentItem({ number, name, category }, POUR);
    if (item) emit([...value.patentItems, item]);
    setQuery("");
    setOpen(false);
  }, [emit, value.patentItems]);

  const addThird = useCallback(() => {
    const item = PourRecords.normalizePatentItem(third, THIRD);
    if (!item) { setWarning("타사 특허번호를 입력해 주세요."); return; }
    if (value.patentItems.some((i) => i.kind === THIRD && i.number === item.number)) {
      setWarning(`이미 추가된 타사 특허입니다: ${item.display}`);
      return;
    }
    emit([...value.patentItems, item]);
    setThird({ number: "", name: "", company: "", category: "", remark: "" });
  }, [emit, third, value.patentItems]);

  const removeAt = useCallback((item: PatentItem) => {
    emit(value.patentItems.filter((i) => i.id !== item.id));
  }, [emit, value.patentItems]);

  const move = useCallback((item: PatentItem, step: number) => {
    const items = [...value.patentItems];
    const at = items.findIndex((i) => i.id === item.id);
    const to = at + step;
    if (at < 0 || to < 0 || to >= items.length) return;
    [items[at], items[to]] = [items[to], items[at]];
    emit(items);
  }, [emit, value.patentItems]);

  const stats = PourRecords.patentStats(
    { patentItems: value.patentItems, noticeMultiFlag: value.noticeMultiFlag }, storage);
  const items = tab === POUR ? pourItems : thirdItems;

  return (
    <div className="pour-patent-editor">
      <div className="pour-kind-tabs">
        <button type="button" className={`pour-kind-tab${tab === POUR ? " is-active" : ""}`}
                onClick={() => setTab(POUR)}>
          POUR 특허(우리 특허) ({pourItems.length})
        </button>
        <button type="button" className={`pour-kind-tab${tab === THIRD ? " is-active" : ""}`}
                onClick={() => setTab(THIRD)}>
          타사 특허 ({thirdItems.length})
        </button>
      </div>

      {tab === POUR ? (
        <div className="pour-field">
          <input
            type="text"
            className="pour-kind-search"
            autoComplete="off"
            placeholder="특허번호·특허명·공법명·공종으로 검색 (예: 193, POUR, 재도장)"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (!open || !suggestions.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
              else if (e.key === "Enter") {
                e.preventDefault();
                const hit = suggestions[active];
                if (hit) addPour(hit.number, hit.name, hit.category);
              } else if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && (
            <div className="pour-suggest is-open">
              {suggestions.length ? suggestions.map((hit, i) => (
                <div
                  key={hit.number}
                  className={`pour-suggest-item${i === active ? " is-active" : ""}`}
                  onPointerDown={(e) => { e.preventDefault(); addPour(hit.number, hit.name, hit.category); }}
                >
                  <span>{PourPatents.formatNumber(hit.number)}</span>{" "}
                  <span className="pour-sub">{[hit.name, hit.category].filter(Boolean).join(" · ")}</span>
                </div>
              )) : (
                <div className="pour-suggest-empty">{PourPatents.emptyMessage(storage)}</div>
              )}
            </div>
          )}
          <button type="button" className="pour-add-btn" onClick={() => setOpen(true)}>＋ 특허 추가</button>
        </div>
      ) : (
        <div>
          <div className="pour-third-form">
            {([
              ["number", "타사 특허번호", "10-2091977"],
              ["name", "특허명·공법명", "균열보수 공법"],
              ["company", "보유 회사명", "타사명"],
              ["category", "관련 공종", "재도장"],
              ["remark", "비고", "공고문 기재 특허"]
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <label>{label}</label>
                <input
                  type="text"
                  className={`pour-third-${key}`}
                  placeholder={placeholder}
                  value={third[key]}
                  onChange={(e) => setThird((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button type="button" className="pour-add-btn" onClick={addThird}>＋ 특허 추가</button>
        </div>
      )}

      <div className="pour-item-list">
        {items.length ? items.map((item, index) => (
          <div className="pour-item-row" key={item.id} data-number={item.number}>
            <span className="pour-item-no">{index + 1}</span>
            <span className="pour-item-text">
              {[item.display, item.name || item.method, item.company, item.category]
                .filter(Boolean).join(" · ")}
            </span>
            <button type="button" className="pour-item-btn" title="위로"
                    disabled={index === 0} onClick={() => move(item, -1)}>▲</button>
            <button type="button" className="pour-item-btn" title="아래로"
                    disabled={index === items.length - 1} onClick={() => move(item, 1)}>▼</button>
            <button type="button" className="pour-item-btn pour-item-del" title="삭제"
                    onClick={() => removeAt(item)}>✕</button>
          </div>
        )) : (
          <div className="pour-item-empty">
            {tab === POUR ? "선택된 POUR 특허가 없습니다." : "입력된 타사 특허가 없습니다."}
          </div>
        )}
      </div>

      {warning && <div className="pour-notice">{warning}</div>}

      <label className="pour-multi-check">
        <input
          type="checkbox"
          checked={value.noticeMultiFlag}
          onChange={(e) => onChange({ patentItems: value.patentItems, noticeMultiFlag: e.target.checked })}
        />{" "}
        공고문에 다특허로 기재됨
      </label>

      {(stats.totalCount > 0 || value.noticeMultiFlag) && (
        <div className="pour-multi-badge" data-badge={stats.badge}>
          {stats.label ? `${stats.label} · ${stats.detail}` : stats.detail}
        </div>
      )}
    </div>
  );
}
