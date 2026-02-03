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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string; sectionId: string }> },
) {
  try {
    const headers = await getAuthHeaders()
    const { sectionId } = await params
    const payload = await request.json()
    const response = await fetch(
      `${API_BASE_URL}/v1/teacher/sections/${sectionId}/key-concept`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Teacher section key concept update error:", error)
    return NextResponse.json(
      { error: "Failed to update key concepts" },
      { status: 500 },
    )
  }
}
