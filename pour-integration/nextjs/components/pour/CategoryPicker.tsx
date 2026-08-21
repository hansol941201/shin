"use client";
/**
 * 공종 고르기 — 대분류를 먼저 고르고 그 안의 세부 공종을 여러 개 고른다.
 *
 * 규칙
 *   · 대분류를 고르면 그 대분류의 세부 공종만 보인다
 *   · 세부 공종은 여러 개 고를 수 있고, 다시 누르면 해제된다
 *   · 같은 이름이 여러 대분류에 있어도 고른 대분류 기준으로 저장한다
 *   · 기타를 고르면 직접 적는 칸이 나온다
 *   · 분류표에 없는 옛 자료는 기타로 보이되 이름은 그대로 남는다
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import PourCategories from "@/lib/pour/core/pour-categories.js";
import type { CategoryItem } from "@/lib/pour/core";

export interface CategoryPickerProps {
  value: CategoryItem[];
  onChange: (items: CategoryItem[]) => void;
}

export default function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const groups: string[] = useMemo(() => PourCategories.GROUP_KEYS, []);
  const other: string = PourCategories.OTHER;

  const [openGroup, setOpenGroup] = useState<string>(groups[0]);
  const [custom, setCustom] = useState("");

  const items: CategoryItem[] = useMemo(
    () => PourCategories.normalizeItems(value) as CategoryItem[], [value]);

  // 고른 것이 있으면 그 대분류를 먼저 펼쳐 준다
  useEffect(() => {
    if (items.length && !items.some((it) => it.group === openGroup)) setOpenGroup(items[0].group);
    // openGroup 은 일부러 뺀다. 사람이 고른 대분류를 다시 되돌리지 않기 위해서다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const has = useCallback(
    (group: string, name: string) => items.some((it) => it.group === group && it.name === name),
    [items]);

  const toggle = useCallback((group: string, name: string) => {
    const at = items.findIndex((it) => it.group === group && it.name === name);
    const next = at >= 0
      ? items.filter((_, i) => i !== at)
      : items.concat([{ group, name }]);
    onChange(PourCategories.normalizeItems(next) as CategoryItem[]);
  }, [items, onChange]);

  const addCustom = useCallback(() => {
    const name = custom.trim();
    if (!name) return;
    setCustom("");
    if (has(other, name)) return;
    onChange(PourCategories.normalizeItems(
      items.concat([{ group: other, name }])) as CategoryItem[]);
  }, [custom, has, items, onChange, other]);

  // 기타는 미리 정한 세부 공종이 없다. 이미 고른 것만 보여 준다.
  const shown: string[] = openGroup === other
    ? items.filter((it) => it.group === other).map((it) => it.name)
    : PourCategories.itemsOf(openGroup);

  return (
    <div className="cat-picker">
      <div className="cat-groups">
        {groups.map((group) => {
          const count = items.filter((it) => it.group === group).length;
          return (
            <button
              key={group}
              type="button"
              className={`cat-group${group === openGroup ? " is-open" : ""}`}
              onClick={() => setOpenGroup(group)}
            >
              {group}
              {count > 0 && <span className="cat-group-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="cat-items">
        {shown.length === 0 ? (
          <span className="cat-hint">
            {openGroup === other
              ? "아래 칸에 공종명을 직접 적어 추가하세요."
              : "이 대분류에는 세부 공종이 없습니다."}
          </span>
        ) : shown.map((name) => {
          const on = has(openGroup, name);
          return (
            <button
              key={name}
              type="button"
              data-group={openGroup}
              data-item={name}
              aria-pressed={on}
              className={`cat-item${on ? " is-on" : ""}`}
              onClick={() => toggle(openGroup, name)}
            >
              {name}
            </button>
          );
        })}
      </div>

      {openGroup === other && (
        <div className="cat-custom">
          <input
            type="text"
            className="cat-custom-input"
            placeholder="공종명을 직접 입력"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          />
          <button type="button" className="cat-custom-btn" onClick={addCustom}>＋ 추가</button>
        </div>
      )}

      <div className="cat-chips">
        {items.map((it) => (
          <span key={it.group + "|" + it.name} className="cat-chip">
            <span className="cat-chip-group">{it.group}</span>
            <span className="cat-chip-name">{it.name}</span>
            <button
              type="button"
              className="cat-chip-x"
              title={`${it.group} ${it.name} 빼기`}
              onClick={() => toggle(it.group, it.name)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {items.length === 0 && (
        <div className="cat-empty">고른 공종이 없습니다. 위에서 대분류를 먼저 고르세요.</div>
      )}
    </div>
  );
}
