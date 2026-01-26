import { NextResponse } from "next/server";
import { getBearerTokenFromRequest } from "@/lib/server/supabase-session";

// Prefer server-only API_URL, then public override; default to localhost:8080 to avoid nulls in dev
const API_URL = process.env.API_URL;

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // console.log(body);
    
    // Prefer Authorization header token, fallback to Supabase session via cookies
    const token = await getBearerTokenFromRequest(req);
    
    if (!token) {
      return NextResponse.json({ error: "No auth token" }, { status: 401 });
    }

    console.log(`${API_URL}/v1/profile`);

    const res = await fetch(`${API_URL}/v1/profile`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API /v1/profile failed: ${res.status} ${text}`);
    }
    
    const data = res.status === 204 ? null : await res.json();
    return NextResponse.json(data ?? { ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    // Prefer Authorization header token, fallback to Supabase session via cookies
    const token = await getBearerTokenFromRequest(req);
    
    if (!token) {
      return NextResponse.json({ error: "No auth token" }, { status: 401 });
    }

    const res = await fetch(`${API_URL}/v1/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API /v1/profile failed: ${res.status} ${text}`);
    }
    
    const data = res.status === 204 ? null : await res.json();
    return NextResponse.json(data ?? {});
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load" }, { status: 500 });
  }
}
