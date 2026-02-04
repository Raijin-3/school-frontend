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
  request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  try {
    const headers = await getAuthHeaders()
    const { sectionId } = await params
    const classId = request.nextUrl.searchParams.get("class_id")
    if (!classId) {
      return NextResponse.json(
        { error: "class_id query parameter is required" },
        { status: 400 },
      )
    }

    console.log(
      "[Section actions proxy] sectionId:",
      sectionId,
      "class_id:",
      classId,
    )

    const url = new URL(
      `${API_BASE_URL}/v1/teacher/sections/${sectionId}/actions`,
    )
    url.searchParams.set("class_id", classId)

    const response = await fetch(url.toString(), { headers })
    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch section actions:", error)
    return NextResponse.json(
      { error: "Unable to load action history" },
      { status: 500 },
    )
  }
}
