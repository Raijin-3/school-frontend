import { NextResponse } from "next/server";
import { apiDelete } from "@/lib/api";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; subjectId: string }> }) {
  try {
    const { id, subjectId } = await params;
    const data = await apiDelete(`/v1/classes/${id}/subjects/${subjectId}`);
    return NextResponse.json(data ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to remove class subject" }, { status: 500 });
  }
}
