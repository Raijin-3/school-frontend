import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Missing Supabase environment variables" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const payload =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const session = payload?.session ?? payload?.supabase_session ?? null;
  if (!session || typeof session !== "object") {
    return NextResponse.json(
      { error: "Missing Supabase session payload" },
      { status: 400 },
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.setSession(session as Record<string, unknown>);
  if (error) {
    console.error("Failed to set server-side Supabase session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to persist session" },
      { status: 500 },
    );
  }

  return response;
}
