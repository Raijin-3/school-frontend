"use client";

import type { Session } from "@supabase/supabase-js";

export type BackendLoginCredentials = {
  email: string;
  password: string;
};

export type BackendLoginResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: {
    id: string;
    email: string;
    role: "admin" | "student";
  };
  supabase_session?: Session | null;
};

export async function loginWithBackend({
  email,
  password,
}: BackendLoginCredentials): Promise<BackendLoginResponse> {
  const response = await fetch("/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Sign-in failed");
  }

  return (await response.json()) as BackendLoginResponse;
}
