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
      `${GAMIFICATION_API_URL}/gamification/identified-question`,
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
        text || `Gamification identified question reward failed (${res.status})`,
      );
    }

    const data = text ? JSON.parse(text) : { xpAwarded: 0 };
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Gamification identified question proxy failed:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to award identified question XP" },
      { status: 500 },
    );
  }
}
