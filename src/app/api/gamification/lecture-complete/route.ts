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

    console.log(GAMIFICATION_API_URL);
    const payload = await req.json();
    const res = await fetch(
      `${GAMIFICATION_API_URL}/gamification/lecture-complete`,
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
        text || `Gamification lecture completion failed (${res.status})`,
      );
    }
    const data = text ? JSON.parse(text) : { ok: true };
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Gamification lecture completion proxy failed:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to record lecture completion" },
      { status: 500 },
    );
  }
}
