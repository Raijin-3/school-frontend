import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"

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

export async function POST(request: NextRequest) {
  try {
    const headers = await getAuthHeaders()
    const body = await request.json()
    const response = await fetch(`${API_BASE_URL}/v1/lesson-assignments`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Teacher lesson assignments API error:", error)
    return NextResponse.json({ error: "Failed to create lesson" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const headers = await getAuthHeaders()
    const url = new URL(request.url)
    const params = url.searchParams.toString()
    const response = await fetch(
      `${API_BASE_URL}/v1/lesson-assignments${params ? `?${params}` : ""}`,
      {
        headers,
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Teacher lesson assignments list error:", error)
    return NextResponse.json({ error: "Failed to load lesson rollup" }, { status: 500 })
  }
}
