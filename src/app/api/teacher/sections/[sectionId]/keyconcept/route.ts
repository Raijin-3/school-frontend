import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"

async function getAuthHeaders() {
  const supabase = supabaseServer()
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error("Not authenticated")
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const headers = await getAuthHeaders()
    const { sectionId } = await params
    if (!sectionId) {
      return NextResponse.json({ error: "Section ID is required" }, { status: 400 })
    }
    const response = await fetch(
      `${API_BASE_URL}/v1/teacher/sections/${sectionId}/key-concept`,
      { headers },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Teacher section key concept fetch error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch key concepts" },
      { status: 500 },
    )
  }
}
