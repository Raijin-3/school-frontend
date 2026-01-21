import { NextRequest, NextResponse } from "next/server";
import { apiPost } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, badgeCode, reason, referenceId, referenceType, metadata, allowRepeat } = body ?? {};

    if (!userId || !badgeCode) {
      return NextResponse.json(
        { error: "userId and badgeCode are required" },
        { status: 400 },
      );
    }

    const payload = await apiPost(`/v1/gamification/badges/${userId}`, {
      badgeCode,
      reason,
      referenceId,
      referenceType,
      metadata,
      allowRepeat,
    });

    return NextResponse.json(payload ?? { success: true });
  } catch (error: any) {
    console.error("Failed to award badge:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to award badge" },
      { status: 500 },
    );
  }
}
