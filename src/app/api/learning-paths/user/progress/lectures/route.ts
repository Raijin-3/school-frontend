import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const sb = supabaseServer();
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get("courseId");
    const subjectId = searchParams.get("subjectId");
    const moduleId = searchParams.get("moduleId");

    let query = sb
      .from("user_section_lecture_progress")
      .select("lecture_id, module_id, section_id, is_watched")
      .eq("user_id", user.id)
      .eq("is_watched", true);

    if (courseId) query = query.eq("course_id", courseId);
    if (subjectId) query = query.eq("subject_id", subjectId);
    if (moduleId) query = query.eq("module_id", moduleId);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch lecture progress:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch lecture progress" },
        { status: 500 },
      );
    }

    const watchedLectureIds = Array.from(
      new Set(
        (data || [])
          .map((row) => row?.lecture_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    return NextResponse.json({ watchedLectureIds }, { status: 200 });
  } catch (error: any) {
    console.error("Lecture progress fetch error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
