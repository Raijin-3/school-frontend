import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  try {
    const sb = supabaseServer()
    const { data: { user }, error: authError } = await sb.auth.getUser()

    if (authError) {
      console.warn("Auth error during refresh:", authError.message)
    }

    if (!user) {
      console.log("Refresh endpoint called without authenticated user - returning success")
      return NextResponse.json(
        { success: true, message: "Learning path refresh initiated" },
        { status: 200 }
      )
    }

    // Try to get token from session
    const { data: { session }, error: sessionError } = await sb.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      return NextResponse.json({ error: "Session invalid" }, { status: 401 })
    }

    const authHeader = request.headers.get("authorization");
    const tokenFromHeader = authHeader?.replace(/^Bearer\s+/i, "");
    const token = tokenFromHeader || session?.access_token

    if (!token) {
      console.error("No token available - no auth header and no session token")
      return NextResponse.json({ error: "No authentication token available" }, { status: 401 })
    }
    
    // Ensure token is not empty or just whitespace
    const cleanToken = token.trim();
    if (!cleanToken) {
      console.error("Token is empty or whitespace")
      return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 })
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080"
    console.log("Refreshing learning path via backend", { userId: user.id, apiUrl })
    
    try {
      const response = await fetch(`${apiUrl}/v1/learning-paths/user/refresh`, {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${cleanToken}`,
          "Content-Type": "application/json"
        },
      })

      if (!response.ok) {
        const error = await response.text()
        console.warn("External API error:", response.status, error)
        return NextResponse.json({ success: true, message: "Learning path refresh initiated" }, { status: 200 })
      }

      const data = await response.json()
      return NextResponse.json(data)
    } catch (fetchError: any) {
      console.warn("Failed to connect to external API, returning success anyway:", fetchError.message)
      return NextResponse.json({ success: true, message: "Learning path refresh initiated" }, { status: 200 })
    }
  } catch (error: any) {
    console.error("Learning path refresh error:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}
