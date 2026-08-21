/**
 * GET  /api/records  → 공고·실적 전체
 * PUT  /api/records  → 공고·실적 저장 (id 기준 upsert, 요청에 없는 행은 그대로 둠)
 *
 * 기존 /api/projects 는 건드리지 않습니다. 새 주소를 따로 둡니다.
 */
import { NextResponse } from "next/server";
import { listRecords, upsertRecords, type D1Like } from "@/lib/pour/store";
import type { PourRecord } from "@/lib/pour/core";

export const runtime = "edge";

/** 프로젝트에서 D1 바인딩을 가져오는 방식에 맞춰 이 함수만 고치면 됩니다. */
function getDb(): D1Like {
  // 예: import { getRequestContext } from "@cloudflare/next-on-pages";
  //     return getRequestContext().env.DB as unknown as D1Like;
  const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
  const db = (env?.DB ?? (globalThis as Record<string, unknown>).DB) as D1Like | undefined;
  if (!db) throw new Error("D1 바인딩(DB)을 찾지 못했습니다. getDb() 를 프로젝트에 맞게 고쳐 주세요.");
  return db;
}

export async function GET() {
  try {
    const records = await listRecords(getDb());
    return NextResponse.json(records, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "배열이어야 합니다." }, { status: 400 });
    }
    // 안전장치: 빈 배열은 "전부 지우기"로 오해될 수 있으므로 아무것도 하지 않는다.
    if (!body.length) {
      return NextResponse.json({ inserted: 0, updated: 0, skipped: "빈 배열" });
    }
    const result = await upsertRecords(getDb(), body as PourRecord[]);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
