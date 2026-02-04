import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseServer()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const payload = (await request.json()) as {
      items?: { studentId?: string; sectionId?: string | null }[]
      actionLabel?: string
      message?: string
      sectionTitle?: string
      classTiming?: string
    }

    if (!payload.items?.length) {
      return NextResponse.json({ error: "No students provided" }, { status: 400 })
    }

    const { actionLabel, message, sectionTitle, classTiming } = payload

    if (!actionLabel || !message) {
      return NextResponse.json({ error: "Missing action label or message" }, { status: 400 })
    }

    const rows = payload.items
      .filter((item): item is { studentId: string; sectionId?: string | null } => Boolean(item?.studentId))
      .map((item) => ({
        student_id: item.studentId,
        teacher_id: session.user.id,
        section_id: item.sectionId ?? null,
        action_label: actionLabel,
        message,
        metadata: (() => {
          const data: Record<string, string> = {}
          if (sectionTitle) {
            data.sectionTitle = sectionTitle
          }
          if (classTiming) {
            data.classTiming = classTiming
          }
          return Object.keys(data).length ? data : null
        })(),
      }))

    if (!rows.length) {
      return NextResponse.json({ error: "Missing student IDs" }, { status: 400 })
    }

    const { error: insertError } = await supabase.from("student_notification").insert(rows)
    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Student notification API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create notifications" },
      { status: 500 },
    )
  }
}
