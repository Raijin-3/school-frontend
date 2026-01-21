import { NextResponse } from "next/server";
import { apiDelete, apiPut } from "@/lib/api";

export async function PUT(
  req: Request,
  { params }: { params: { exerciseId: string; questionId: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const data = await apiPut(
      `/v1/admin/section-exercises/${params.exerciseId}/questions/${params.questionId}/dataset`,
      body,
    );
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save question dataset" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { exerciseId: string; questionId: string } },
) {
  try {
    const data = await apiDelete(
      `/v1/admin/section-exercises/${params.exerciseId}/questions/${params.questionId}/dataset`,
    );
    return NextResponse.json(data ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete question dataset" },
      { status: 500 },
    );
  }
}
