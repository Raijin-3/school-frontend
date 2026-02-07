import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseServer()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user?.id) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      )
    }

    const limitParam = request.nextUrl.searchParams.get("limit")
    const limit = Math.min(Math.max(Number(limitParam) || 0, 1), 25)

    const { data, error } = await supabase
      .from("student_notification")
      .select(
        "id, student_id, teacher_id, section_id, action_label, message, metadata, created_at, is_read",
      )
      .eq("student_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(limit || 10)

    if (error) {
      console.error("Failed to load student notifications", error)
      return NextResponse.json(
        { error: error.message ?? "Failed to load notifications" },
        { status: 500 },
      )
    }

    const notifications = (data ?? []) as Array<Record<string, any>>
    const sectionIds = Array.from(
      new Set(
        notifications
          .map((item) => item.section_id)
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const sectionLookup: Record<string, { module_id?: string }> = {}
    const moduleLookup: Record<string, { subject_id?: string }> = {}
    const subjectLookup: Record<
      string,
      { id: string; title?: string; course_id?: string }
    > = {}

    if (sectionIds.length) {
      const { data: sections } = await supabase
        .from("sections")
        .select("id, module_id")
        .in("id", sectionIds)

      sections?.forEach((section: any) => {
        sectionLookup[section.id] = { module_id: section.module_id }
      })

      const moduleIds = Array.from(
        new Set(
          sections
            ?.map((section: any) => section.module_id)
            .filter((value): value is string => Boolean(value)) ?? [],
        ),
      )

      if (moduleIds.length) {
        const { data: modulesResponse } = await supabase
          .from("modules")
          .select("id, subject_id")
          .in("id", moduleIds)

        const moduleRows = modulesResponse ?? []
        moduleRows.forEach((module: any) => {
          moduleLookup[module.id] = { subject_id: module.subject_id }
        })

        const subjectIds = Array.from(
          new Set(
            moduleRows
              .map((module: any) => module.subject_id)
              .filter((value): value is string => Boolean(value)),
          ),
        )
        if (subjectIds.length) {
          const { data: subjectsResponse } = await supabase
            .from("subjects")
            .select("id, title, course_id")
            .in("id", subjectIds)

          const subjects = subjectsResponse ?? []
          subjects.forEach((subject: any) => {
            subjectLookup[subject.id] = {
              id: subject.id,
              title: subject.title,
              course_id: subject.course_id,
            }
          })
        }
      }
    }

    const result = notifications.map((item) => {
      const sectionMeta = item.section_id ? sectionLookup[item.section_id] : null
      const moduleMeta = sectionMeta?.module_id
        ? moduleLookup[sectionMeta.module_id]
        : null
      const subjectMeta = moduleMeta?.subject_id
        ? subjectLookup[moduleMeta.subject_id]
        : null
      const courseId = subjectMeta?.course_id
      const subjectSlug = subjectMeta
        ? subjectMeta.title
          ? slugify(subjectMeta.title)
          : subjectMeta.id
        : undefined
      const moduleId = sectionMeta?.module_id

      const curriculumUrl =
        courseId && subjectSlug && moduleId
          ? `/curriculum/${courseId}/${subjectSlug}?module=${encodeURIComponent(
              moduleId,
            )}`
          : null

      return {
        ...item,
        curriculum_url: curriculumUrl,
      }
    })

    return NextResponse.json({ notifications: result })
  } catch (error) {
    console.error("Student notifications GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500 },
    )
  }
}

export async function PATCH() {
  try {
    const supabase = supabaseServer()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user?.id) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      )
    }

    const { error } = await supabase
      .from("student_notification")
      .update({ is_read: true })
      .eq("student_id", session.user.id)
      .eq("is_read", false)

    if (error) {
      console.error("Failed to mark notifications read", error)
      return NextResponse.json(
        { error: error.message ?? "Failed to mark notifications read" },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Student notifications PATCH error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark notifications read" },
      { status: 500 },
    )
  }
}
