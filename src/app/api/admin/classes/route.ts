import { NextResponse } from "next/server";
import { apiGet, apiPost } from "@/lib/api";

export async function GET() {
  try {
    const data = await apiGet("/v1/classes");
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch classes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await apiPost("/v1/classes", body);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create class" }, { status: 500 });
  }
}
