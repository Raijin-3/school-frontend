import { NextResponse } from "next/server";
import { apiGet } from "@/lib/api";

export async function GET() {
  try {
    const data = await apiGet("/v1/admin/section-topics");
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch section topics" }, { status: 500 });
  }
}
