import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sectionId?: string }> },
) {
  const resolvedParams = await params
  const sectionId = resolvedParams?.sectionId
  if (!sectionId) {
    return NextResponse.json(
      { error: "Section ID is required" },
      { status: 400 },
    )
  }

  try {
    const supabase = supabaseServer()
    const { data, error } = await supabase
      .from("section_topics")
      .select("topic_hierarchy, topic_name")
      .eq("section_id", sectionId)
      .order("order_index", { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    const hierarchy = (data ?? [])
      .map((row) => row.topic_hierarchy?.trim())
      .filter(Boolean)
      .join(" | ")
    const keyConceptsList = (data ?? [])
      .map((row) => row.topic_name?.trim())
      .filter(Boolean)
    const keyConcepts = keyConceptsList.join(", ")

    if (hierarchy) {
      return NextResponse.json({ hierarchy, key_concepts: keyConcepts })
    }

    const fallback = keyConceptsList.join(" | ")

    return NextResponse.json({
      hierarchy: fallback || null,
      key_concepts: keyConcepts,
    })
  } catch (error) {
    console.error("Failed to load section topic hierarchy", error)
    const message =
      error instanceof Error ? error.message : "Unable to load topic hierarchy"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
