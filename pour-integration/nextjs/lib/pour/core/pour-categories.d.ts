/** 공종 분류표 — 대분류 → 세부 공종 */
import type { CategoryItem } from "./index";

export interface CategoryGroup {
  key: string;
  items: string[];
}

declare const PourCategories: {
  /** 분류표에 없거나 대분류를 하나로 정할 수 없을 때 쓰는 이름 */
  OTHER: string;
  /** 대분류와 세부 공종을 잇는 표기 */
  SEP: string;
  GROUPS: CategoryGroup[];
  GROUP_KEYS: string[];
  /** 대분류의 세부 공종 목록 */
  itemsOf(group: string): string[];
  /** 이 이름이 들어 있는 대분류 전부 */
  groupsOf(name: string): string[];
  has(group: string, name: string): boolean;
  /** 확실할 때만 분류한다. 여러 곳에 있거나 표에 없으면 기타로 둔다 */
  classify(name: string): CategoryItem | null;
  normalizeItem(input: CategoryItem | string | null | undefined): CategoryItem | null;
  normalizeItems(list: unknown): CategoryItem[];
  /** 옛 자료(이름만 있는 목록)를 항목 목록으로 옮긴다 */
  itemsFromNames(names: unknown): CategoryItem[];
  /** 항목 목록에서 세부 공종 이름만 (기존 공종 열에 쓰는 값) */
  namesOf(items: unknown): string[];
  /** 항목 목록에 쓰인 대분류를 표 순서대로 */
  groupNamesOf(items: unknown): string[];
  label(item: CategoryItem | string): string;
  labelsOf(items: unknown): string[];
};

export default PourCategories;
