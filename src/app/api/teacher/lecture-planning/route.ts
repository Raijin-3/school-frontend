import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

async function getAuthHeaders() {
  const supabase = supabaseServer()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error("Not authenticated")
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  }
}

export async function GET(request: NextRequest) {
  try {
    const headers = await getAuthHeaders()
    const url = new URL(`${API_BASE_URL}/v1/teacher/lecture-planning`)
    for (const [key, value] of request.nextUrl.searchParams) {
      if (value) {
        url.searchParams.append(key, value)
      }
    }

    const response = await fetch(url, { headers })
    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load lecture plans"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const headers = await getAuthHeaders()
    const payload = await request.json()
    const response = await fetch(`${API_BASE_URL}/v1/teacher/lecture-planning`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to plan lecture"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
