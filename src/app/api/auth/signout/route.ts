import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(request: NextRequest) {
  const cleared: string[] = [];
  const response = NextResponse.json({ ok: true, cleared });

  // Add cache control headers to prevent caching of the logout response
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('Surrogate-Control', 'no-store');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
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
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
  }

  // Proactively delete any remaining Supabase cookies (sb-*)
  try {
    const all = request.cookies.getAll();
    for (const c of all) {
      if (c.name.startsWith("sb-")) {
        response.cookies.delete(c.name);
        cleared.push(c.name);
      }
    }
    for (const name of ["sb-access-token", "sb-refresh-token"]) {
      if (request.cookies.get(name)) {
        response.cookies.delete(name);
        cleared.push(name);
      }
    }
  } catch {}

  return response;
}
