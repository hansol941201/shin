/**
 * GET  /api/patents  → POUR 특허 자료 전체
 * PUT  /api/patents  → 특허번호 기준 upsert (기존 특허를 지우지 않음)
 */
import { NextResponse } from "next/server";
import { listPatents, upsertPatents, type D1Like } from "@/lib/pour/store";
import type { PatentRecord } from "@/lib/pour/core";

export const runtime = "edge";

function getDb(): D1Like {
  const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
  const db = (env?.DB ?? (globalThis as Record<string, unknown>).DB) as D1Like | undefined;
  if (!db) throw new Error("D1 바인딩(DB)을 찾지 못했습니다. getDb() 를 프로젝트에 맞게 고쳐 주세요.");
  return db;
}

export async function GET() {
  try {
    const patents = await listPatents(getDb());
    return NextResponse.json(patents, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "배열이어야 합니다." }, { status: 400 });
    }
    if (!body.length) {
      return NextResponse.json({ inserted: 0, updated: 0, skipped: "빈 배열" });
    }
    const result = await upsertPatents(getDb(), body as PatentRecord[]);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
