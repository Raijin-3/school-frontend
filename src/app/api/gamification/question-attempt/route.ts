import { NextRequest, NextResponse } from "next/server";
import {
  GAMIFICATION_API_URL,
  getAuthTokenFromRequest,
} from "../_utils";

export async function POST(req: NextRequest) {
  try {
    const token = await getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const res = await fetch(
      `${GAMIFICATION_API_URL}/gamification/question-attempt`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload ?? {}),
      },
    );

    const text = res.status === 204 ? null : await res.text();
    if (!res.ok) {
      throw new Error(
        text || `Gamification question attempt failed (${res.status})`,
      );
    }

    const data = text ? JSON.parse(text) : { ok: true };
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Gamification question attempt proxy failed:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to record question attempt" },
      { status: 500 },
    );
  }
}
