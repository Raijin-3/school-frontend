import { redirect } from "next/navigation"







import { supabaseServer } from "@/lib/supabase-server"







import { apiGet } from "@/lib/api"







import ClassInsightShell from "./class-insight-shell"



import type {



  AiHighlight,



  AiUsageSegment,



  ClassGroup,



  ClassOption,



  FocusGroup,
  FocusItem,



  MasteryTile,



  ModuleInsight,



  ModuleStudentBreakdown,



  ModuleStudentSection,



  StrengthSummary,



  QuickStat,



  StudentAiUsage,

  StudentInsight,



  StrugglingActionType,



  SubjectOption,

  InProgressStudentSection,
  NotStartedStudentSection,
  StudentSectionStatus,

  FocusGroupTableRow,
} from "./types"











export const metadata = { title: "Class Insight | Jarvis" }















type ClassRow = {







  id: string







  name?: string | null







  year?: string | null







  last_accessed_at?: string | null







}









const getScoreTone = (score: number | null) => {
  if (score === null || score === undefined) {
    return "notStarted" as const
  }
  if (score >= 80) return "strong" as const
  if (score >= 50) return "average" as const
  return "weak" as const
}





type SectionInsight = {
  section_id: string
  section_title: string
  adaptive_quiz_percent: number | null
  exercise_percent: number | null
  overall_average: number | null
  student_count: number
  assigned: boolean
}
















type InsightsResponse = {



  class_id: string | null



  sections: SectionInsight[]



  modules: ModuleInsight[]



  top_performer: {



    student_id: string



    student_name: string



    adaptive_quiz_percent: number | null



    exercise_percent: number | null



    overall_average: number | null



  } | null



  needs_improvement: {



    student_id: string



    student_name: string



    adaptive_quiz_percent: number | null



    exercise_percent: number | null



    overall_average: number | null



  } | null



  trend: Array<{ topic: string; average: number | null }>



  low_confidence: AiHighlight[]



  students: StudentInsight[]



  summary: {
    total_hints_used: number
    total_students: number
    adaptive_sessions_completed: number
    section_exercises_completed: number
    average_score: number | null
    sections_tracked: number
    sections_assigned: number
  }







}















const emptyInsights: InsightsResponse = {



  class_id: null,



  sections: [],



  modules: [],



  top_performer: null,



  needs_improvement: null,



  trend: [],



  low_confidence: [],



  students: [],



  summary: {



    total_hints_used: 0,







    total_students: 0,







    adaptive_sessions_completed: 0,







    section_exercises_completed: 0,







    average_score: null,







    sections_tracked: 0,
    sections_assigned: 0,







  },







}















const fallbackClasses: ClassRow[] = [







  {







    id: "class-7a",







    name: "Year 7 · 7A",







    year: "Year 7",







    last_accessed_at: new Date().toISOString(),







  },







  {







    id: "class-7b",







    name: "Year 7 · 7B",







    year: "Year 7",







    last_accessed_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),







  },







  {







    id: "class-8a",







    name: "Year 8 · 8A",







    year: "Year 8",







    last_accessed_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),







  },







]















const fallbackSubjects: SubjectOption[] = [







  { id: "math", name: "Mathematics" },







  { id: "science", name: "Science" },







  { id: "english", name: "English" },







]















const fallbackTileSpecs = [







  { topic: "Fractions", mastery: 82, progress: 5, struggling: 3 },







  { topic: "Decimals", mastery: 76, progress: 4, struggling: 4 },







  { topic: "Geometry", mastery: 64, progress: 3, struggling: 6 },







  { topic: "Algebraic Reasoning", mastery: 58, progress: 2, struggling: 7 },







  { topic: "Word Problems", mastery: 91, progress: 6, struggling: 2 },







  { topic: "Measurement", mastery: 69, progress: 3, struggling: 5 },







]















function deriveYearLabel(name?: string | null) {







  if (!name) return "Year 7"







  const yearMatch = name.match(/Year\s*(\d+)/i)







  if (yearMatch) return `Year ${yearMatch[1]}`







  const gradeMatch = name.match(/(\d+)/)







  if (gradeMatch) return `Year ${gradeMatch[1]}`







  return "Year 7"







}















function formatAccessTime(value?: string | null) {







  try {







    if (!value) return "Earlier today"







    const date = new Date(value)







    return date.toLocaleString("en-US", {







      weekday: "short",







      month: "short",







      day: "numeric",







      hour: "numeric",







      minute: "numeric",







    })







  } catch {







    return "Earlier today"







  }







}















const baseStrengthSummary: StrengthSummary = {
  strong: 0,
  average: 0,
  weak: 0,
  notStarted: 0,
}

function buildStrengthSummary(
  classStudentIds: string[],
  moduleStudents: ModuleStudentBreakdown[] = [],
): StrengthSummary {
  const summary = { ...baseStrengthSummary }
  const studentMap = new Map(
    moduleStudents
      .filter(
        (student): student is ModuleStudentBreakdown & { student_id: string } =>
          Boolean(student.student_id),
      )
      .map((student) => [student.student_id, student] as const),
  )

  for (const studentId of classStudentIds) {
    const moduleStudent = studentMap.get(studentId)
    if (!moduleStudent) {
      summary.notStarted += 1
      continue
    }

    const completion = moduleStudent.module_completion_percent ?? 0
    const score = moduleStudent.module_score
    const isNotStarted = completion === 0 && (score === null || score === undefined)
    if (isNotStarted) {
      summary.notStarted += 1
      continue
    }

    const normalizedScore = score ?? 0
    if (normalizedScore >= 80) {
      summary.strong += 1
    } else if (normalizedScore >= 50) {
      summary.average += 1
    } else {
      summary.weak += 1
    }
  }

  return summary
}


function buildMasteryTiles(modules: ModuleInsight[], classStudents: StudentInsight[]) {
  const classStudentIds = classStudents
    .map((student) => student.student_id)
    .filter((id): id is string => Boolean(id))



  if (!modules.length) {



    return fallbackTileSpecs.map((spec) => ({



      id: spec.topic.toLowerCase().replace(/\s+/g, "-"),



      topic: spec.topic,



      mastery: spec.mastery,



      progress: spec.progress,



      struggling: spec.struggling,



      color: spec.mastery >= 80 ? "green" : spec.mastery >= 50 ? "amber" : "rose",



      students: [],



      strengthSummary: buildStrengthSummary(classStudentIds),



    }))



  }







  return modules.map((module) => {



    const rawStudentRoster = module.students ?? []



    const studentRoster = [...rawStudentRoster].sort(



      (a, b) => (a.module_score ?? 0) - (b.module_score ?? 0),



    )



    const baseMastery =



      module.overall_average ??



      (studentRoster.length



        ? Math.round(



            studentRoster.reduce((sum, student) => sum + (student.module_score ?? 0), 0) /



              studentRoster.length,



          )



        : 0)



    const color = baseMastery >= 80 ? "green" : baseMastery >= 50 ? "amber" : "rose"



    const progressBase = Math.round(((module.overall_average ?? baseMastery) - 60) * 0.25 + 4)



    const progress = Math.max(2, Math.min(12, progressBase))



    const strugglingMetric =



      typeof module.struggling_count === "number"



        ? module.struggling_count



        : studentRoster.filter((student) => (student.module_score ?? 0) < 50).length







    const strengthSummary = buildStrengthSummary(classStudentIds, studentRoster)







    return {



      id: module.module_id,



      topic: module.module_title ?? "Module",



      mastery: baseMastery,



      progress,



      struggling: strugglingMetric,



      color,



      students: studentRoster,



      strengthSummary,



    }



  })



}











function buildAiSegmentsFromStudents(students: StudentInsight[]): AiUsageSegment[] {

  const studentsWithHints = (students ?? []).filter((student) => (student.hints ?? 0) > 0)

  const segmentTotals = {
    light: 0,
    medium: 0,
    high: 0,
  }

  for (const student of studentsWithHints) {
    const hints = student.hints ?? 0
    if (hints <= 2) {
      segmentTotals.light += hints
    } else if (hints <= 5) {
      segmentTotals.medium += hints
    } else {
      segmentTotals.high += hints
    }
  }

  return [
    { label: "Light support", value: segmentTotals.light, range: "0-2 hints", tone: "green" },
    { label: "Medium support", value: segmentTotals.medium, range: "3-5 hints", tone: "amber" },
    { label: "High support", value: segmentTotals.high, range: "6+ hints", tone: "rose" },
  ]
}






function buildAiHighlights(subjectName: string): AiHighlight[] {







  return [







    {



      name: "Lina Patel",



      hints: 8,



      topic: `${subjectName} · Subtracting Fractions`,



      detail: "Mastery 42% · 7 hints",



    },







    {



      name: "Jordan Lee",



      hints: 6,



      topic: `${subjectName} · Decimal word problems`,



      detail: "Mastery 48% · 6 hints",



    },







    {



      name: "Cameron Park",



      hints: 5,



      topic: `${subjectName} · Geometry puzzles`,



      detail: "Mastery 58% · 5 hints",



    },







  ]







}












function buildFallbackFocusGroups(subjectName: string): FocusGroup[] {
  const subjectLabel = subjectName || "This subject"

  return [
    {
      title: "Stuck Students",
      description: "Low mastery + high Jarvis hints",
      items: [
        {
          name: "Lina Patel",
          detail: `Mastery 42% · 7 hints on ${subjectLabel} Fractions`,
          tag: "Last intervention: 4 days ago",
        },
        {
          name: "Jamal Reza",
          detail: `Mastery 48% · 6 hints on ${subjectLabel} Word Problems`,
          tag: "Last intervention: 5 days ago",
        },
      ],
      actions: ["Create review plan", "Pull for small group", "Send to AI tutor"],
    },
    {
      title: "Ready for Extension",
      description: "Strong growth, ready to deepen thinking",
      items: [
        {
          name: "Priya Singh",
          detail: `Mastery 88% · 2 hints · Ready for ${subjectLabel} challenge`,
          tag: "Last intervention: 2 days ago",
        },
        {
          name: "Marcus Ortiz",
          detail: `Mastery 84% · 1 hint · Seeking ${subjectLabel} stretch goals`,
          tag: "Last intervention: Today",
        },
      ],
      actions: ["Share challenge set", "Invite to showcase", "Pair with peer mentors"],
    },
    {
      title: "Incomplete Objectives",
      description: "Assignments waiting for finish",
      items: [
        {
          name: "Harper Lee",
          detail: `${subjectLabel} practice · 64% mastery · 3 open tasks`,
          tag: "Last intervention: Last week",
        },
        {
          name: "Asher Blake",
          detail: `${subjectLabel} journal · 59% mastery · 2 open tasks`,
          tag: "Last intervention: 6 days ago",
        },
      ],
      actions: ["Send reminder", "Assign targeted practice", "Offer micro-check-in"],
    },
  ]
}


function collectWeakSectionsByStudent(modules: ModuleInsight[]): Map<
  string,
  { section_id?: string; section_title?: string; section_score: number | null }[]
> {
  const weakMap = new Map<string, { section_title?: string; section_score: number | null }[]>()
  for (const module of modules) {
    const studentRoster = module.students ?? []
    for (const student of studentRoster) {
      if (!student.student_id) continue
      const sections = student.sections ?? []
      for (const section of sections) {
        const score = section.section_score
        if (score !== null && score !== undefined && score < 50) {
          const entries = weakMap.get(student.student_id) ?? []
          entries.push({
            section_id: section.section_id,
            section_title: section.section_title,
            section_score: score,
          })
          weakMap.set(student.student_id, entries)
        }
      }
    }
  }
  return weakMap
}

function collectStrongSectionsByStudent(modules: ModuleInsight[]): Map<
  string,
  { section_id?: string; section_title?: string; section_score: number | null }[]
> {
  const strongMap = new Map<string, { section_title?: string; section_score: number | null }[]>()
  for (const module of modules) {
    const studentRoster = module.students ?? []
    for (const student of studentRoster) {
      if (!student.student_id) continue
      const sections = student.sections ?? []
      for (const section of sections) {
        const score = section.section_score
        if (score !== null && score !== undefined && score >= 80) {
          const entries = strongMap.get(student.student_id) ?? []
          entries.push({
            section_id: section.section_id,
            section_title: section.section_title,
            section_score: score,
          })
          strongMap.set(student.student_id, entries)
        }
      }
    }
  }
  return strongMap
}

function collectSectionsByStudent(modules: ModuleInsight[]): Map<string, ModuleStudentSection[]> {
  const sectionMap = new Map<string, ModuleStudentSection[]>()
  for (const module of modules) {
    const studentRoster = module.students ?? []
    for (const student of studentRoster) {
      if (!student.student_id) continue
      for (const section of student.sections ?? []) {
        const entries = sectionMap.get(student.student_id) ?? []
        entries.push(section)
        sectionMap.set(student.student_id, entries)
      }
    }
  }
  return sectionMap
}

function formatWeakSections(weakSections: { section_title?: string; section_score: number | null }[]) {
  return weakSections
    .slice(0, 3)
    .map((section) => {
      const title = section.section_title ?? "Section"
      const score =
        section.section_score !== null && section.section_score !== undefined
          ? `${section.section_score}%`
          : "--"
      return `${title} ${score}`
    })
    .join(" · ")
}

function buildFocusGroupsFromStudents(
  students: StudentInsight[],
  modules: ModuleInsight[],
  subjectName: string,
): FocusGroup[] {
  if (!students.length) {
    return buildFallbackFocusGroups(subjectName)
  }

  const safeSubject = subjectName || "This subject"
  const averageValue = (student: StudentInsight) => student.overall_average ?? -1
  const hintCount = (student: StudentInsight) => student.hints ?? 0

  const buildBucket = (
    predicate: (student: StudentInsight) => boolean,
    comparator: (a: StudentInsight, b: StudentInsight) => number,
  ) =>
    [...students]
      .filter(predicate)
      .sort((a, b) => {
        const delta = comparator(a, b)
        if (delta !== 0) return delta
        return hintCount(b) - hintCount(a)
      })
      .slice(0, 3)

  const weakSectionsByStudent = collectWeakSectionsByStudent(modules)
  const strongSectionsByStudent = collectStrongSectionsByStudent(modules)
  const sectionsByStudent = collectSectionsByStudent(modules)
  const stuck = buildBucket(
    (student) => getScoreTone(student.overall_average ?? null) === "weak",
    (a, b) => averageValue(a) - averageValue(b),
  )

  const ready = buildBucket(
    (student) => {
      const studentId = student.student_id
      if (!studentId) return false
      const studentSections = sectionsByStudent.get(studentId) ?? []
      if (!studentSections.length) return false
      return studentSections.every(
        (section) =>
          section.section_score !== null &&
          section.section_score !== undefined &&
          section.section_score >= 80,
      )
    },
    (a, b) => averageValue(b) - averageValue(a),
  )

  const incomplete = buildBucket(
    (student) => {
      const average = student.overall_average ?? -1
      return average >= 60 && average < 85
    },
    (a, b) => averageValue(b) - averageValue(a),
  )

  const formatPercentage = (label: string, value: number | null | undefined) =>
    typeof value === "number" ? `${label} ${Math.round(value)}%` : undefined

  const buildFocusItemFromStudent = (student: StudentInsight): FocusItem => {
    const metrics = [
      formatPercentage("Mastery", student.overall_average),
      formatPercentage("Adaptive", student.adaptive_quiz_percent),
      formatPercentage("Exercises", student.exercise_percent),
    ].filter(Boolean) as string[]

    const detailParts = [safeSubject, ...metrics]
    const detail =
      detailParts.length > 0 ? detailParts.join(" · ") : `${student.student_name} performance is still warming up`

    const tag =
      student.hints && student.hints > 0
        ? `${student.hints} Jarvis hint${student.hints === 1 ? "" : "s"}`
        : "Jarvis hints pending"

    return {
      name: student.student_name,
      detail,
      tag,
    }
  }

  const buildItems = (list: StudentInsight[], fallbackLabel: string): FocusItem[] =>
    list.length
      ? list.map((student) => buildFocusItemFromStudent(student))
      : [
          {
            name: fallbackLabel,
            detail: `${safeSubject} has no students in this bucket yet.`,
            tag: "Awaiting data",
          },
        ]

  const buildStuckItems = (): FocusItem[] =>
    stuck.length
      ? stuck.map((student) => {
          const weakSections = weakSectionsByStudent.get(student.student_id) ?? []
          const masteryScore =
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--"
          const detailParts = [`Mastery map ${masteryScore}%`]
          if (weakSections.length) {
            detailParts.push(`Weak sections: ${formatWeakSections(weakSections)}`)
          }
          const detail = detailParts.filter(Boolean).join(" · ")
          const tag = weakSections.length
            ? `${weakSections.length} weak section${weakSections.length === 1 ? "" : "s"}`
            : "Jarvis hints pending"
          return {
            name: student.student_name,
            detail,
            tag,
          }
        })
      : [
          {
            name: "No students currently stuck",
            detail: `${safeSubject} has no students in this bucket yet.`,
            tag: "Awaiting data",
          },
        ]

  const buildTableRows = (): FocusGroupTableRow[] =>
    stuck.flatMap((student) => {
      const weakSections = weakSectionsByStudent.get(student.student_id) ?? []
      if (weakSections.length) {
        return weakSections.map((section) => ({
          student_id: student.student_id,
          student_name: student.student_name,
          section_title: section.section_title,
          section_score: section.section_score,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: section.section_id,
        }))
      }
      return [
        {
          student_id: student.student_id,
          student_name: student.student_name,
          section_score: student.overall_average ?? null,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: "overall",
        },
      ]
    })

  const buildReadyTableRows = (): FocusGroupTableRow[] =>
    ready.flatMap((student) => {
      const strongSections = strongSectionsByStudent.get(student.student_id) ?? []
      if (strongSections.length) {
        return strongSections.map((section) => ({
          student_id: student.student_id,
          student_name: student.student_name,
          section_title: section.section_title,
          section_score: section.section_score,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: section.section_id,
        }))
      }
      return []
    })

  return [
    {
      title: "Stuck Students",
      description: "Low mastery + high Jarvis hints",
      items: buildStuckItems(),
      actions: ["Create review plan", "Pull for small group", "Send to AI tutor"],
      strugglingActions: ["concept", "weakness"] as StrugglingActionType[],
      tableRows: buildTableRows(),
    },
    {
      title: "Ready for Extension",
      description: "Strong growth, ready to deepen thinking",
      items: buildItems(ready, "No students ready for extension"),
      actions: ["Share challenge set", "Invite to showcase", "Pair with peer mentors"],
      tableRows: buildReadyTableRows(),
    },
    {
      title: "Incomplete Objectives",
      description: "Assignments waiting for finish",
      items: buildItems(incomplete, "No incomplete objectives"),
      actions: ["Send reminder", "Assign targeted practice", "Offer micro-check-in"],
    },
  ]
}


function buildSuggestedActions(subjectName: string, className: string): SuggestedAction[] {







  return [







    {







      title: `Re-teach ${subjectName} Fractions jump-off`,







      description: `Jarvis will generate 12 guided prompts for ${className} to re-engage the Fractions concept.`,







      due: "Due Jan 31",







    },







    {







      title: "Launch targeted review playlist",







      description: `Package Exercises + AI hints for ${subjectName} decimals alongside a quick teacher note.`,







      due: "Due Feb 2",







    },







    {







      title: "Assign Mini Lab with Jarvis tutor",







      description: `Direct Jarvis to coach students flagged in the focus list with hands-on ${subjectName} problems.`,







      due: "Due Feb 5",







    },







  ]







}















function buildClassGroups(options: ClassOption[]): ClassGroup[] {







  const map = new Map<string, ClassOption[]>()







  options.forEach((option) => {







    const bucket = map.get(option.year) ?? []







    bucket.push(option)







    map.set(option.year, bucket)







  })







  return Array.from(map.entries()).map(([label, items]) => ({







    label,







    items,







  }))







}















export default async function ClassInsightPage({







  searchParams,







}: {







  searchParams?: Promise<{ classId?: string; subjectId?: string }>







}) {







  const resolvedSearchParams = searchParams ? await searchParams : undefined







  const sb = supabaseServer()







  const {







    data: { user },







  } = await sb.auth.getUser()







  if (!user) redirect("/login")















  const profile = await apiGet<any>('/v1/profile').catch(() => null)







  const role = String(profile?.role ?? "").toLowerCase()







  if (role !== "teacher" && role !== "admin") redirect("/dashboard")















  const classResponse = await apiGet<ClassRow[]>("/v1/classes").catch(() => [])







  const classList = classResponse.length ? classResponse : fallbackClasses







  const selectedClassId =







    typeof resolvedSearchParams?.classId === "string" && resolvedSearchParams.classId







      ? resolvedSearchParams.classId







      : classList[0]?.id ?? ""







  const selectedClass = classList.find((item) => item.id === selectedClassId) ?? classList[0]!







  const classOptions = classList.map((item, index) => ({







    id: item.id,







    name: item.name ?? `Class ${index + 1}`,







    year: item.year ?? deriveYearLabel(item.name),







    lastAccessedLabel: item.last_accessed_at ? formatAccessTime(item.last_accessed_at) : undefined,







  }))







  const classGroups = buildClassGroups(classOptions)







  const selectedClassYear = selectedClass.year ?? deriveYearLabel(selectedClass.name)















  const subjectsRaw =







    selectedClassId && selectedClassId !== ""







      ? await apiGet<Record<string, unknown>[]>(`/v1/classes/${selectedClassId}/subjects/details`).catch(







          () => [],







        )







      : []







  const subjectOptions =







    subjectsRaw.length > 0







      ? subjectsRaw.map((subject, index) => ({







          id: (subject["subject_id"] ?? subject["id"] ?? `subject-${index}`).toString(),







          name:







            (subject["subject_name"] ??







              subject["title"] ??







              subject["display_name"] ??







              subject["name"] ??







              `Subject ${index + 1}`) as string,







          grade: selectedClassYear,







        }))







      : fallbackSubjects







  const requestedSubjectId =







    typeof resolvedSearchParams?.subjectId === "string" ? resolvedSearchParams.subjectId : undefined







  const selectedSubject =







    subjectOptions.find((item) => item.id === requestedSubjectId) ?? subjectOptions[0]







  const selectedSubjectId = selectedSubject?.id ?? ""







  const selectedSubjectName = selectedSubject?.name ?? "Math"















  const insightParams = new URLSearchParams({ class_id: selectedClassId })



  if (selectedSubjectId) {



    insightParams.set("subject_id", selectedSubjectId)



  }







  const insights = selectedClassId



    ? await apiGet<InsightsResponse>(`/v1/teacher/insights?${insightParams.toString()}`).catch(() => ({



        ...emptyInsights,



        class_id: selectedClassId,



      }))



    : emptyInsights







  const moduleInsights = insights.modules ?? []



  const studentInsights = insights.students ?? []



  const masteryTiles = buildMasteryTiles(moduleInsights, studentInsights)

  const studentsWithHints = studentInsights.filter((student) => (student.hints ?? 0) > 0)

  const aiUsage = buildAiSegmentsFromStudents(studentInsights)



  const totalHintsUsed = insights.summary.total_hints_used ?? 0
  const studentsTracked = insights.summary.total_students ?? 0
  const assignedSectionsCount = insights.summary.sections_assigned ?? insights.summary.sections_tracked ?? 0
  const totalExpectedSectionCompletions =
    assignedSectionsCount > 0 && studentsTracked > 0
      ? assignedSectionsCount * studentsTracked
      : 0
  const moduleAverageValues = moduleInsights
    .map((module) => module.overall_average)
    .filter((value): value is number => value !== null)
  const moduleAverageScore =
    moduleAverageValues.length > 0
      ? Math.round(
          moduleAverageValues.reduce((sum, value) => sum + value, 0) / moduleAverageValues.length,
        )
      : null
  const subjectAverageScore =
    moduleAverageScore ?? (insights.summary.average_score !== null ? Math.round(insights.summary.average_score) : null)

  const studentExerciseCompletions = moduleInsights.flatMap((module) =>
    (module.students ?? []).map((student) => ({
      student_name: student.student_name,
      module_id: module.module_id,
      module_title: module.module_title,
      completedSections: (student.sections ?? [])
        .filter((section) => section.exercise_status === "Completed" || section.completed)
        .map((section) => ({
          section_title: section.section_title,
          section_id: section.section_id,
        })),
    })),
  )
  const totalCompletedSections = studentExerciseCompletions.reduce(
    (sum, student) => sum + student.completedSections.length,
    0,
  )
  const subjectCompletionPercent =
    totalExpectedSectionCompletions > 0
      ? Math.min(100, Math.round((totalCompletedSections / totalExpectedSectionCompletions) * 100))
      : null

  console.log("Subject completion inputs", {
    studentsTracked,
    assignedSectionsCount,
    sectionExercisesCompleted: totalCompletedSections,
    totalExpectedSectionCompletions,
    subjectCompletionPercent,
    subjectAverageScore,
    moduleAverageScore,
  })
  console.log(
    "Per-student section exercise completions",
    JSON.stringify(studentExerciseCompletions, null, 2),
  )







  const studentLookup = new Map(



    studentInsights.map((student) => [student.student_id, student]),



  )



  const hasInProgressStatus = (status?: string | null) =>
    typeof status === "string" && status.trim().toLowerCase() === "in progress"
  const isCompletedStatus = (status?: string | null) =>
    typeof status === "string" && status.trim().toLowerCase() === "completed"

  const buildAssignedSectionRow = (
    module: ModuleInsight,
    student: ModuleStudentBreakdown,
    section: ModuleStudentSection,
  ): StudentSectionStatus => ({
    student_id: student.student_id,
    student_name: student.student_name,
    module_id: module.module_id,
    module_title: module.module_title,
    section_id: section.section_id,
    section_title: section.section_title,
    adaptive_status: section.adaptive_status ?? null,
    exercise_status: section.exercise_status ?? null,
    section_score: section.section_score,
    hints: student.hints ?? 0,
    adaptive_last_attempted_at: section.adaptive_last_attempted_at ?? null,
    exercise_last_attempted_at: section.exercise_last_attempted_at ?? null,
    exercise_attempted_questions: section.exercise_attempted_questions ?? null,
    completed: section.completed,
  })

  const assignedSectionRows = moduleInsights.flatMap((module) =>
    (module.students ?? []).flatMap((student) =>
      (student.sections ?? [])
        .filter((section) => section.assigned)
        .map((section) => buildAssignedSectionRow(module, student, section)),
    ),
  )

  const inProgressStudentSections: InProgressStudentSection[] = assignedSectionRows.filter(
    (row) =>
      hasInProgressStatus(row.adaptive_status) || hasInProgressStatus(row.exercise_status),
  )

  const hasSectionAttempt = (row: StudentSectionStatus) =>
    Boolean(
      row.adaptive_last_attempted_at ||
        row.exercise_last_attempted_at ||
        (typeof row.exercise_attempted_questions === "number" && row.exercise_attempted_questions > 0),
    )

  const notStartedStudentSections: NotStartedStudentSection[] = assignedSectionRows.filter((row) => {
    const hasStarted =
      hasInProgressStatus(row.adaptive_status) ||
      hasInProgressStatus(row.exercise_status) ||
      isCompletedStatus(row.adaptive_status) ||
      isCompletedStatus(row.exercise_status) ||
      Boolean(row.completed)
    return !hasStarted && !hasSectionAttempt(row)
  })



  const buildStudentDetail = (student?: StudentInsight) => {

    if (!student) return undefined

    const detailParts: string[] = []

    if (student.overall_average !== null && student.overall_average !== undefined) {

      detailParts.push(`Overall ${student.overall_average}%`)

    }

    if (

      student.adaptive_quiz_percent !== null &&

      student.adaptive_quiz_percent !== undefined

    ) {

      detailParts.push(`Adaptive ${student.adaptive_quiz_percent}%`)

    }

    if (

      student.exercise_percent !== null &&

      student.exercise_percent !== undefined

    ) {

      detailParts.push(`Exercises ${student.exercise_percent}%`)

    }

    return detailParts.length ? detailParts.join(" · ") : undefined

  }



  const rawHighlights =

    insights.low_confidence && insights.low_confidence.length

      ? insights.low_confidence

      : buildAiHighlights(selectedSubjectName)

  const aiHighlights = rawHighlights.map((highlight) => {

    const student = highlight.student_id

      ? studentLookup.get(highlight.student_id)

      : undefined

    return {

      ...highlight,

      detail: highlight.detail ?? buildStudentDetail(student),

    }

  })



  const studentAiUsage: StudentAiUsage[] = [...studentsWithHints]

    .sort((a, b) => (b.hints ?? 0) - (a.hints ?? 0))

    .slice(0, 4)

    .map((student) => ({

      student_id: student.student_id,

      student_name: student.student_name,

      hints: student.hints ?? 0,

      detail: buildStudentDetail(student),

    }))



  const focusGroups = buildFocusGroupsFromStudents(studentInsights, moduleInsights, selectedSubjectName)



  const suggestedActions = buildSuggestedActions(selectedSubjectName, selectedClass.name ?? "the class")







  const quickStats: QuickStat[] = [

    {

      label: "Hints used",

      value: `${insights.summary.total_hints_used}`,

      sublabel: "Jarvis tips",

    },

    {

      label: "Students tracked",

      value: `${insights.summary.total_students}`,

      sublabel: "Active this week",

    },

    {

      label: "Sections active",

      value: `${insights.summary.sections_tracked}`,

      sublabel: "Curriculum tiles",

    },

  ]


  quickStats.push({
    label: "Sections assigned",
    value: `${insights.summary.sections_assigned ?? 0}`,
    sublabel: "Assigned sections",
  })


  const jarvisCount = studentsWithHints.length


  const jarvisLog = `Jarvis delivered ${totalHintsUsed} hints to ${jarvisCount} students in ${selectedSubjectName}.`


  const breadcrumbs = [


    "Your Classes",







    selectedClassYear,







    selectedClass.name ?? "Class",







    selectedSubjectName,







  ]







  const lastAccessedLabel =







    classOptions.find((option) => option.id === selectedClassId)?.lastAccessedLabel ?? "Earlier today"















  return (







    <ClassInsightShell







      classGroups={classGroups}







      selectedClassId={selectedClassId}







      selectedClassName={selectedClass.name ?? "Class"}







      selectedClassYear={selectedClassYear}







      subjects={subjectOptions}







      selectedSubjectId={selectedSubjectId}







      selectedSubjectName={selectedSubjectName}







      breadcrumbs={breadcrumbs}







      lastAccessedLabel={lastAccessedLabel}







      quickStats={quickStats}







      masteryTiles={masteryTiles}







      aiUsage={aiUsage}







      aiHighlights={aiHighlights}







      totalHintsUsed={totalHintsUsed}






      studentAiUsage={studentAiUsage}
      studentsTracked={studentsTracked}
      subjectCompletionPercent={subjectCompletionPercent}
      subjectAverageScore={subjectAverageScore}








      focusGroups={focusGroups}
      assignedSectionRows={assignedSectionRows}







      suggestedActions={suggestedActions}







      inProgressStudentSections={inProgressStudentSections}
      notStartedStudentSections={notStartedStudentSections}







      jarvisLog={jarvisLog}







    />







  )







}






