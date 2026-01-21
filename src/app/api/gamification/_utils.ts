import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const configuredBase =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8080";

const normalizedBase = configuredBase
  .replace(/\/$/, "")
  .replace(/\/api$/, "");

export const GAMIFICATION_API_URL = `${normalizedBase}/api`;

async function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase configuration");
  }

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // no-op
        }
      },
    },
  });
}

const SUPABASE_COOKIE_BASE64_PREFIX = "base64-";

function decodeBase64Value(value: string): string | null {
  if (!value.startsWith(SUPABASE_COOKIE_BASE64_PREFIX)) {
    return value;
  }

  const base64Payload = value.slice(SUPABASE_COOKIE_BASE64_PREFIX.length);
  if (!base64Payload) {
    return null;
  }

  const nodeBuffer = (globalThis as any).Buffer as
    | { from(input: string, encoding: string): { toString(enc: string): string } }
    | undefined;

  if (nodeBuffer) {
    try {
      return nodeBuffer.from(base64Payload, "base64").toString("utf8");
    } catch {
      // fall through to atob
    }
  }

  if (typeof atob === "function") {
    try {
      return atob(base64Payload);
    } catch {
      return null;
    }
  }

  return null;
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;
  const lower = authHeader.toLowerCase();
  if (lower.startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    return token.length ? token : null;
  }
  return null;
}

export async function getAuthTokenFromRequest(
  req: NextRequest,
): Promise<string | null> {
  const direct = extractBearerToken(req);
  if (direct) return direct;

  const parseSupabaseCookie = (raw?: string | null) => {
    if (!raw) return null;
    let value = raw.trim();
    if (!value) return null;

    const decoded = decodeBase64Value(value);
    if (decoded === null) {
      return null;
    }
    value = decoded.trim();
    if (!value) return null;

    if (value.startsWith("{")) {
      try {
        const json = JSON.parse(value);
        return (
          json?.access_token ||
          json?.accessToken ||
          json?.currentSession?.access_token ||
          json?.currentSession?.accessToken ||
          json?.session?.access_token ||
          json?.session?.accessToken ||
          json?.data?.session?.access_token ||
          json?.data?.session?.accessToken ||
          null
        );
      } catch {
        return null;
      }
    }
    return value;
  };

  const cookieTokenCandidates = [
    parseSupabaseCookie(req.cookies.get("sb-access-token")?.value),
    parseSupabaseCookie(req.cookies.get("sb-access-token-v2")?.value),
    ...req.cookies
      .getAll()
      .filter((cookie) => /^sb-[^/]+-auth-token$/i.test(cookie.name))
      .map((cookie) => parseSupabaseCookie(cookie.value)),
    ...req.cookies
      .getAll()
      .filter((cookie) => /^sb-[^/]+-auth-token-v2$/i.test(cookie.name))
      .map((cookie) => parseSupabaseCookie(cookie.value)),
  ];

  const cookieToken = cookieTokenCandidates.find((value) => Boolean(value));
  if (cookieToken) return cookieToken as string;

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}
