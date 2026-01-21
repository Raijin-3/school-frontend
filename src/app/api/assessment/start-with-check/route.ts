import { NextResponse } from "next/server";
import { apiPost } from "@/lib/api";

export async function POST() {
  try {
    const data = await apiPost("/v1/assessments/start-with-check", {});
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Assessment start-with-check error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to start assessment with session check" },
      { status: 500 },
    );
  }
}
