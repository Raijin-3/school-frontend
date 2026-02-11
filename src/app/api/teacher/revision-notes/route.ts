import { NextRequest, NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { apiPost } from "@/lib/api"

const AI_BASE_URL = (process.env.JARVIS_AI_URL ?? "http://localhost:8000").replace(/\/$/, "")

type RevisionNotesRequestBody = {
  sectionId?: string
  sectionTitle?: string
  classId?: string
  className?: string
  classYear?: string
  subjectId?: string
  subjectName?: string
  studentIds?: string[]
  keyconcept?: string[] | string | null
}

type TeacherInputPayload = {
  grade: string
  curriculum_type: string
  subject: string
  topic: string
  allowed_subtopics: string[]
  do_not_cover: string[]
  depth_level: number
  example_style: string
  language_complexity: string
  teacher_notes?: string
  student_question?: string
}

type RevisionNotesAiRequest = {
  section_title: string
  section_description?: string | null
  section_key_concepts: string[]
  module_title?: string | null
  subject_name: string
  class_name: string
  class_year?: string | null
  class_grade?: string | null
  student_names: string[]
  student_count: number
  teacher_input: TeacherInputPayload
  section_keyconcept_raw?: string[] | string | null
  student_wrong_questions?: RevisionNotesWrongQuestion[]
}

type WeakSectionTodoQuestion = {
  original_question: string
  student_answer: string
  correct_answer: string
  difficulty_attempted?: string | null
}

type WeakSectionResult = {
  sectionId: string
  sectionTitle?: string | null
  wrongQuestions: {
    adaptive: WeakSectionTodoQuestion[]
    caseStudy: WeakSectionTodoQuestion[]
  }
}

type RevisionNotesWrongQuestion = {
  studentId: string
  sectionId: string
  sectionTitle?: string | null
  originalQuestion: string
  studentAnswer: string
  correctAnswer: string
  source: "adaptive" | "caseStudy"
}

const stripToArrayOfStrings = (raw?: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value): value is string => Boolean(value))
  }
  if (typeof raw === "string") {
    return raw
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }
  return []
}

const LOOKBACK_DAYS_FOR_REVISIONS = 60

const fetchWeakSectionsForStudent = async (
  studentId: string,
  sectionId?: string,
): Promise<WeakSectionResult[]> => {
  try {
    return await apiPost<WeakSectionResult[]>("/v1/classes/weak-sections", {
      studentId,
      sectionId,
      lookbackDays: LOOKBACK_DAYS_FOR_REVISIONS,
      minAttempts: 1,
      maxSections: 3,
      includeAllSections: true,
    })
  } catch (error) {
    console.error("Failed to load weak sections for revision notes", { studentId, error })
    return []
  }
}

const loadWrongQuestionSamples = async (
  studentIds: string[],
  sectionId?: string,
): Promise<RevisionNotesWrongQuestion[]> => {
  const promises = studentIds.map(async (studentId) => ({
    studentId,
    sections: await fetchWeakSectionsForStudent(studentId, sectionId),
  }))
  const results = await Promise.all(promises)
  const entries: RevisionNotesWrongQuestion[] = []
  for (const result of results) {
    for (const section of result.sections ?? []) {
      if (sectionId && section.sectionId !== sectionId) {
        continue
      }
      const adaptive = section.wrongQuestions?.adaptive ?? []
      const caseStudy = section.wrongQuestions?.caseStudy ?? []
      const normalized = [
        ...adaptive.map((question) => ({
          studentId: result.studentId,
          sectionId: section.sectionId,
          sectionTitle: section.sectionTitle,
          originalQuestion: question.original_question,
          studentAnswer: question.student_answer,
          correctAnswer: question.correct_answer,
          source: "adaptive" as const,
        })),
        ...caseStudy.map((question) => ({
          studentId: result.studentId,
          sectionId: section.sectionId,
          sectionTitle: section.sectionTitle,
          originalQuestion: question.original_question,
          studentAnswer: question.student_answer,
          correctAnswer: question.correct_answer,
          source: "caseStudy" as const,
        })),
      ]
      entries.push(
        ...normalized.filter((entry) => entry.originalQuestion || entry.correctAnswer),
      )
    }
  }
  return entries
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseServer()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = (await request.json()) as RevisionNotesRequestBody
    const studentIds = (body.studentIds ?? []).filter(Boolean)
    if (!studentIds.length) {
      return NextResponse.json({ error: "No students provided" }, { status: 400 })
    }

    const resolvedSectionTitle = body.sectionTitle?.trim() || ""
    if (!body.sectionId && !resolvedSectionTitle) {
      return NextResponse.json(
        { error: "Section information is required" },
        { status: 400 },
      )
    }

    let keyconceptFromDb: string[] | string | null = null
    let sectionData: {
      id: string
      title?: string | null
      module_id?: string | null
      keyconcept?: string[] | string | null
      description?: string | null
    } | null = null

    if (body.sectionId) {
      const { data: keyconceptOnly, error: keyconceptError } = await supabase
        .from("section_topics")
        .select("topic_name")
        .eq("id", body.sectionId)
        .maybeSingle()
      if (keyconceptError) {
        console.error("Failed to load keyconcept for section:", keyconceptError)
      } else if (keyconceptOnly) {
        keyconceptFromDb = keyconceptOnly.topic_name ?? null
      }
      
      const { data, error } = await supabase
        .from("sections")
        .select("id, title, module_id, keyconcept, description")
        .eq("id", body.sectionId)
        .maybeSingle()

      if (error) {
        console.error("Failed to load section details:", error)
      } else if (data) {
        sectionData = data
      }
    }

    const moduleId = sectionData?.module_id ?? null
    let moduleData:
      | {
          id: string
          title?: string | null
          subject_id?: string | null
        }
      | null = null

    if (moduleId) {
      const { data, error } = await supabase
        .from("modules")
        .select("id, title, subject_id")
        .eq("id", moduleId)
        .maybeSingle()
      if (error) {
        console.error("Failed to load module:", error)
      } else if (data) {
        moduleData = data
      }
    }

    let subjectTitleFromDb: string | null = null
    if (moduleData?.subject_id) {
      const { data, error } = await supabase
        .from("subjects")
        .select("title")
        .eq("id", moduleData.subject_id)
        .maybeSingle()
      if (error) {
        console.error("Failed to load subject:", error)
      } else if (data?.title) {
        subjectTitleFromDb = data.title
      }
    }

    const { data: studentRows, error: studentError } = await supabase
      .from("profiles")
      .select("id, full_name, class_details")
      .in("id", studentIds)

    if (studentError) {
      console.error("Failed to load student profiles:", studentError)
    }

    const studentSummaries =
      (studentRows ?? [])
        .map((row) => {
          const name = row.full_name?.trim() || row.id
          const details =
            typeof row.class_details === "object" && row.class_details !== null
              ? (row.class_details as { grade_level?: string | null; class_name?: string | null })
              : null
          const descriptor = [details?.grade_level, details?.class_name]
            .filter((value): value is string => Boolean(value))
            .join(", ")
          return descriptor ? `${name} (${descriptor})` : name
        })
        .filter(Boolean) ?? []

    const limitedStudentSummaries = studentSummaries.slice(0, 5)
    const providedKeyconcept = body.keyconcept
    const keyconceptSource = providedKeyconcept ?? sectionData?.keyconcept ?? keyconceptFromDb
    const allowedKeyConcepts = stripToArrayOfStrings(keyconceptSource)
    const rawKeyConcepts = keyconceptSource ?? null
    const finalKeyConcepts =
      allowedKeyConcepts.length > 0
        ? allowedKeyConcepts
        : sectionData?.title
        ? [sectionData.title]
        : resolvedSectionTitle
        ? [resolvedSectionTitle]
        : ["This section"]

    const finalSectionTitle =
      sectionData?.title?.trim() || resolvedSectionTitle || "This section"

        // console.log("loadWrongQuestionSamples", loadWrongQuestionSamples);

    const wrongQuestionEntries = await loadWrongQuestionSamples(studentIds, body.sectionId)

    const formattedWrongQuestionNotes = wrongQuestionEntries.map(
      (entry, index) =>
        `${index + 1}. ${entry.originalQuestion} (answered "${entry.studentAnswer}" vs correct "${entry.correctAnswer}")`,
    )

    const teacherInput: TeacherInputPayload = {
      grade: body.className?.trim() || body.classYear?.trim() || "This class",
      curriculum_type: "General",
      subject: body.subjectName?.trim() || subjectTitleFromDb || "this subject",
      topic: finalSectionTitle,
      allowed_subtopics: finalKeyConcepts,
      do_not_cover: ["Future topics", "Advanced methods", "Exam techniques"],
      depth_level: 2,
      example_style: "Classroom",
      language_complexity: "Simple",
          teacher_notes: [
            `Focus on the key ideas listed above and align with the class plan.`,
            formattedWrongQuestionNotes.length
              ? `Recent weak-question attempts:\n${formattedWrongQuestionNotes.join("\n")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          student_question: `Can you give a short revision note for ${finalSectionTitle}?`,
        }

    const aiPayload: RevisionNotesAiRequest = {
      section_title: finalSectionTitle,
      section_description: sectionData?.description ?? null,
      section_key_concepts: finalKeyConcepts,
      section_keyconcept_raw: rawKeyConcepts,
      module_title: moduleData?.title ?? null,
      subject_name: teacherInput.subject,
      class_name: body.className?.trim() || "Your class",
      class_year: body.classYear?.trim() || null,
      class_grade: body.classYear?.trim() || null,
      student_names: limitedStudentSummaries,
      student_count: studentIds.length,
      teacher_input: teacherInput,
      student_wrong_questions: wrongQuestionEntries,
    }

    console.log("Revision notes wrong questions:", wrongQuestionEntries)

    const aiResponse = await fetch(`${AI_BASE_URL}/revision-notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiPayload),
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      throw new Error(errorText || "Failed to create revision notes")
    }

    const aiData = (await aiResponse.json()) as { notes?: string; raw_response?: string }

    if (!aiData?.notes) {
      throw new Error("AI did not return revision notes")
    }

    return NextResponse.json({
      notes: aiData.notes,
      raw_response: aiData.raw_response ?? aiData.notes,
      keyconcept: rawKeyConcepts ?? finalKeyConcepts,
    })
  } catch (error) {
    console.error("Revision notes API error:", error)
    const message =
      error instanceof Error ? error.message : "Failed to generate revision notes"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
