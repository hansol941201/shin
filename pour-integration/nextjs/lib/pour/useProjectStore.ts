"use client";
/**
 * 화면용 자료 저장소 훅
 *
 * 검증이 끝난 core 모듈은 `getItem/setItem` 만 요구하므로,
 * API 에서 받아온 자료를 메모리에 들고 그 인터페이스를 흉내 낸다.
 * 읽기는 동기, 저장은 API 로 보낸다. localStorage 는 쓰지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PourRecords from "./core/pour-records.js";
import PourPatents from "./core/pour-patents.js";
import type { PourRecord, PatentRecord, PourStorage } from "./core";

const RECORDS_KEY = "pour.records.v1";
const PATENTS_KEY = "pour.patents.v1";

interface MemoryStore extends PourStorage {
  dirty: Set<string>;
}

function createMemoryStore(): MemoryStore {
  const cache: Record<string, string> = {};
  const dirty = new Set<string>();
  return {
    dirty,
    getItem: (key) => (key in cache ? cache[key] : null),
    setItem: (key, value) => {
      cache[key] = String(value);
      dirty.add(key);
    }
  };
}

export interface PourStoreState {
  storage: PourStorage;
  records: PourRecord[];
  patents: PatentRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** core 모듈로 자료를 바꾼 뒤 부른다. 화면을 다시 그리고 서버에 저장한다. */
  commit: () => void;
  reload: () => Promise<void>;
}

export function useProjectStore(baseUrl = "/api"): PourStoreState {
  const store = useMemo(createMemoryStore, []);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [records, patents] = await Promise.all([
        fetch(`${baseUrl}/records`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error(`GET /records ${r.status}`);
          return r.json();
        }),
        fetch(`${baseUrl}/patents`, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error(`GET /patents ${r.status}`);
          return r.json();
        })
      ]);
      store.setItem(RECORDS_KEY, JSON.stringify(records));
      store.setItem(PATENTS_KEY, JSON.stringify(patents));
      store.dirty.clear();                       // 방금 읽어온 값은 저장 대상이 아니다
      PourRecords.usePatentStorage(store);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, store]);

  useEffect(() => { void reload(); }, [reload]);

  const flush = useCallback(async () => {
    const keys = Array.from(store.dirty);
    if (!keys.length) return;
    store.dirty.clear();
    setSaving(true);
    setError(null);
    try {
      for (const key of keys) {
        const path = key === RECORDS_KEY ? "records" : key === PATENTS_KEY ? "patents" : null;
        if (!path) continue;
        const body = store.getItem(key) || "[]";
        const res = await fetch(`${baseUrl}/${path}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body
        });
        if (!res.ok) throw new Error(`PUT /${path} ${res.status}`);
      }
    } catch (e) {
      keys.forEach((k) => store.dirty.add(k));   // 실패하면 다음에 다시 보낸다
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [baseUrl, store]);

  const commit = useCallback(() => {
    setVersion((v) => v + 1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, 150);
  }, [flush]);

  const records = useMemo(() => PourRecords.list(store), [store, version]);
  const patents = useMemo(() => PourPatents.list(store), [store, version]);

  return { storage: store, records, patents, loading, saving, error, commit, reload };
}
