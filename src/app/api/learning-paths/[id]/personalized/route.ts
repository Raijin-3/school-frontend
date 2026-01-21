import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const pathId = resolvedParams.id;

    const sb = supabaseServer();
    const { data: { user }, error: authError } = await sb.auth.getUser();

    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { session }, error: sessionError } = await sb.auth.getSession();
    if (sessionError) {
      console.error("Session error:", sessionError);
      return NextResponse.json({ error: "Session invalid" }, { status: 401 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "") || session?.access_token || null;
    if (!token) {
      console.error("No token available");
      return NextResponse.json({ error: "No authentication token" }, { status: 401 });
    }

    if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
      const message = "NEXT_PUBLIC_API_BASE_URL is not configured";
      console.error(message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/learning-paths/${pathId}/personalized`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("External API error:", response.status, error);
      return NextResponse.json({ error }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Personalized learning path error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
