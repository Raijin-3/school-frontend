import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseServer()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const childId = request.nextUrl.searchParams.get("child_id")?.trim()
    if (!childId) {
      return NextResponse.json(
        { error: "child_id is required" },
        { status: 400 },
      )
    }

    const { data: links, error: linksError } = await supabase
      .from("parent_child_links")
      .select("child_id")
      .eq("parent_id", session.user.id)
      .eq("child_id", childId)
      .limit(1)

    if (linksError) {
      console.error("Failed to verify parent-child link", linksError)
      return NextResponse.json(
        { error: "Failed to verify child" },
        { status: 500 },
      )
    }

    if (!links?.length) {
      return NextResponse.json(
        { error: "Child not linked to this parent" },
        { status: 403 },
      )
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit"))
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_LIMIT)
        : DEFAULT_LIMIT

    const { data, error } = await supabase
      .from("student_notification")
      .select(
        "id, student_id, teacher_id, section_id, action_label, message, metadata, created_at, is_read",
      )
      .eq("student_id", childId)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Failed to load parent notifications", error)
      return NextResponse.json(
        { error: error.message ?? "Failed to load notifications" },
        { status: 500 },
      )
    }

    return NextResponse.json({ notifications: data ?? [] })
  } catch (error) {
    console.error("Parent notifications GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500 },
    )
  }
}
