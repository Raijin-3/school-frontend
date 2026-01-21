import { NextResponse } from "next/server";
import { apiGet, apiPost } from "@/lib/api";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const data = await apiGet(`/v1/classes/${id}/members${role ? `?role=${encodeURIComponent(role)}` : ""}`);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch class members" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data = await apiPost(`/v1/classes/${id}/members`, body);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to add class members" }, { status: 500 });
  }
}
