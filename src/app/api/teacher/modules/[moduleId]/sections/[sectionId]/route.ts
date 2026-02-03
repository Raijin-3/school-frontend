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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ moduleId: string; sectionId: string }> },
) {
  try {
    const headers = await getAuthHeaders()
    const { sectionId } = await params
    const response = await fetch(
      `${API_BASE_URL}/v1/teacher/sections/${sectionId}`,
      {
        method: "DELETE",
        headers,
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Teacher section delete API error:", error)
    return NextResponse.json(
      { error: "Failed to delete section" },
      { status: 500 },
    )
  }
}
