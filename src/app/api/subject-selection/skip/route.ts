import { NextRequest, NextResponse } from "next/server";
import { apiPost } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, any> = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      // Ignore parse errors when no body is sent
      body = {};
    }
    const data = await apiPost("/v1/subject-selection/skip", body);
    return NextResponse.json(data ?? { success: true, skipped: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to skip subject selection" },
      { status: 500 },
    );
  }
}
