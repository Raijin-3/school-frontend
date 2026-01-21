import { NextResponse } from "next/server";
import { apiGet, apiPost } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = url.searchParams.toString();
    const data = await apiGet(`/v1/lesson-assignments${params ? `?${params}` : ""}`);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch lesson assignments" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await apiPost("/v1/lesson-assignments", body);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create lesson assignment" }, { status: 500 });
  }
}
