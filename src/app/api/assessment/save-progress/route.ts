import { NextResponse } from "next/server";
import { apiPost } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = await apiPost("/v1/assessments/save-progress", body);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Assessment save-progress error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to save assessment progress" },
      { status: 500 },
    );
  }
}
