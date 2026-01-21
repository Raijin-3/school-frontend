import { NextResponse } from "next/server";
import { apiDelete } from "@/lib/api";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const { id, memberId } = await params;
    const data = await apiDelete(`/v1/classes/${id}/members/${memberId}`);
    return NextResponse.json(data ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to remove class member" }, { status: 500 });
  }
}
