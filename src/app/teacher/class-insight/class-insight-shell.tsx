"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, TrendingUp, X } from "lucide-react"
import { toast } from "@/lib/toast"
import type {
  AiHighlight,
  AiUsageSegment,
  ClassGroup,
  FocusGroup,
  MasteryTile,
  ModuleInsight,
  ModuleStudentSection,
  QuickStat,
  StudentAiUsage,
  StrugglingActionType,
  SubjectOption,
  SuggestedAction,
} from "./types"

const statusToneClasses: Record<"Completed" | "In progress", string> = {
  Completed: "text-emerald-600",
  "In progress": "text-amber-500",
}

type Props = {
  classGroups: ClassGroup[]
  selectedClassId: string
  selectedClassName: string
  selectedClassYear: string
  subjects: SubjectOption[]
  selectedSubjectId: string
  selectedSubjectName: string
  breadcrumbs: string[]
  lastAccessedLabel: string
  quickStats: QuickStat[]
  masteryTiles: MasteryTile[]
  aiUsage: AiUsageSegment[]
  aiHighlights: AiHighlight[]
  totalHintsUsed: number
  studentAiUsage: StudentAiUsage[]
  focusGroups: FocusGroup[]
  suggestedActions: SuggestedAction[]
  jarvisLog: string
  studentsTracked: number
  subjectCompletionPercent?: number | null
  subjectAverageScore?: number | null
}

const tileToneClasses: Record<"Strong" | "Average" | "Weak" | "NA" | "Not started", string> = {
  Strong: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Average: "border-amber-200 bg-amber-50 text-amber-700",
  Weak: "border-rose-200 bg-rose-50 text-rose-700",
  NA: "border-slate-200 bg-slate-50 text-slate-500",
  "Not started": "border-slate-200 bg-slate-50 text-slate-500",
}

const toneColors: Record<AiUsageSegment["tone"], string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  rose: "#fb7185",
}

const sectionScoreToneClasses: Record<"strong" | "average" | "weak" | "notStarted", string> = {
  strong: "text-emerald-600",
  average: "text-amber-500",
  weak: "text-rose-500",
  notStarted: "text-slate-400",
}

const sectionStackColors: Record<
  "strong" | "average" | "weak" | "notStarted",
  string
> = {
  strong: "#4ade80",
  average: "#fbbf24",
  weak: "#fb7185",
  notStarted: "#cbd5f5",
}

const strugglingActionCopy: Record<StrugglingActionType, { label: string; description: string }> = {
  concept: {
    label: "Concept-clearing AI notes/chat",
    description: "Revisit the struggling topic with AI notes + chat coaching",
  },
  weakness: {
    label: "Weakness builder quiz",
    description: "Quick adaptive quiz targeted at the weak objectives",
  },
}

const strugglingActionTypes: StrugglingActionType[] = ["concept", "weakness"]

const sectionToneLabels: Record<
  "strong" | "average" | "weak" | "notStarted",
  string
> = {
  strong: "Strong",
  average: "Average",
  weak: "Weak",
  notStarted: "Not started",
}

const assignmentBadgeClasses = {
  assigned: "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.3 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-600",
  notAssigned:
    "rounded-full border border-slate-200 bg-slate-100 px-2 py-0.3 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400",
}

type SectionStudentScore = {
  student_id: string
  student_name: string
  section_score: number | null
  completed: boolean
  section_detail: ModuleStudentSection
}

type SectionProgressSummary = {
  section_id: string
  section_title: string
  studentScores: SectionStudentScore[]
  strong: number
  average: number
  weak: number
  notStarted: number
  averageScore: number | null
  assigned: boolean
  assignedStudents: number
  attemptedStudents: number
}

function buildSectionProgressSummaries(
  students: MasteryTile["students"] = [],
  trackedStudentsCount: number = 0,
): SectionProgressSummary[] {
  const sectionMap = new Map<string, SectionProgressSummary>()
  const order: string[] = []

  for (const student of students) {
    for (const section of student.sections ?? []) {
      const key = section.section_id
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          section_id: key,
          section_title: section.section_title,
          studentScores: [],
          strong: 0,
          average: 0,
          weak: 0,
          notStarted: 0,
          averageScore: null,
          assigned: section.assigned ?? false,
          assignedStudents: 0,
          attemptedStudents: 0,
        })
        order.push(key)
      }
      const summary = sectionMap.get(key)!
      summary.studentScores.push({
        student_id: student.student_id,
        student_name: student.student_name,
        section_score: section.section_score,
        completed: section.completed,
        section_detail: section,
      })
      const isAssigned = section.assigned ?? false
      if (isAssigned && trackedStudentsCount > 0) {
        summary.assignedStudents = trackedStudentsCount
      }
      const score = section.section_score
      if (score === null || score === undefined) {
        summary.notStarted += 1
      } else {
        if (score >= 80) {
          summary.strong += 1
        } else if (score >= 50) {
          summary.average += 1
        } else {
          summary.weak += 1
        }
        if (isAssigned) {
          summary.attemptedStudents += 1
        }
      }
    }
  }

  for (const summary of sectionMap.values()) {
    const reportedScores = summary.studentScores
      .map((entry) => entry.section_score)
      .filter((value): value is number => typeof value === "number")
    if (reportedScores.length) {
      summary.averageScore = Math.round(
        reportedScores.reduce((sum, value) => sum + value, 0) / reportedScores.length,
      )
    }
    summary.studentScores.sort((a, b) => {
      const aScore = a.section_score ?? -1
      const bScore = b.section_score ?? -1
      if (aScore === bScore) {
        return a.student_name.localeCompare(b.student_name)
      }
      return bScore - aScore
    })
    if (summary.assigned && summary.assignedStudents > 0) {
      summary.notStarted = Math.max(summary.assignedStudents - summary.attemptedStudents, summary.notStarted)
    }
  }

  return order.map((id) => sectionMap.get(id)!)
}

const getScoreTone = (score: number | null) => {
  if (score === null || score === undefined) {
    return "notStarted" as const
  }
  if (score >= 80) return "strong" as const
  if (score >= 50) return "average" as const
  return "weak" as const
}

export default function ClassInsightShell(props: Props) {
  const {
    classGroups,
    selectedClassId,
    selectedClassName,
    selectedClassYear,
    subjects,
    selectedSubjectId,
    selectedSubjectName,
    breadcrumbs,
    lastAccessedLabel,
    quickStats,
    masteryTiles,
    aiUsage,
    aiHighlights,
    totalHintsUsed,
    studentAiUsage,
    focusGroups,
    suggestedActions,
    jarvisLog,
    studentsTracked,
    subjectCompletionPercent,
    subjectAverageScore,
  } = props

  const router = useRouter()
  const quickStatsToRender = useMemo(() => {
    if (!quickStats.length) return quickStats
    const cards: QuickStat[] = []
    quickStats.forEach((metric, index) => {
      cards.push(metric)
      if (index === 0) {
        const completionValue =
          subjectCompletionPercent !== null && subjectCompletionPercent !== undefined
            ? `${subjectCompletionPercent}%`
            : "--"
        const averageValue =
          subjectAverageScore !== null && subjectAverageScore !== undefined
            ? `${subjectAverageScore}%`
            : "--"
        cards.push(
          {
            label: "Subject completion",
            value: completionValue,
            sublabel: "Assigned sections",
          },
          {
            label: "Subject average",
            value: averageValue,
            sublabel: "Selected subject",
          },
        )
      }
    })
    return cards
  }, [quickStats, subjectCompletionPercent, subjectAverageScore])
  const [activeTile, setActiveTile] = useState<MasteryTile | null>(null)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [sectionProgressModule, setSectionProgressModule] = useState<MasteryTile | null>(null)
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)
  const [openFocusGroup, setOpenFocusGroup] = useState<string | null>(
    focusGroups[0]?.title ?? null,
  )
  const [studentSectionsCache, setStudentSectionsCache] = useState<
    Record<string, Record<string, ModuleStudentSection[]>>
  >({})
  const [loadingStudentDetailsId, setLoadingStudentDetailsId] = useState<string | null>(null)
  const [studentDetailErrors, setStudentDetailErrors] = useState<Record<string, string>>({})
  const [assignmentHistory, setAssignmentHistory] = useState<Record<string, string>>({})
  const [focusGroupActionHistory, setFocusGroupActionHistory] = useState<Record<string, string>>({})
  const [studentActionHistory, setStudentActionHistory] = useState<Record<string, string>>({})
  const totalAiUsage = aiUsage.reduce((sum, segment) => sum + segment.value, 0)

  const handleStrugglingAction = useCallback(
    (tile: MasteryTile, action: StrugglingActionType) => {
      const actionCopy = strugglingActionCopy[action]
      const message = `${actionCopy.label} assigned for ${tile.topic}`
      setAssignmentHistory((prev) => ({ ...prev, [tile.id]: message }))
      toast.success(message)
    },
    [],
  )

  const handleStudentAction = useCallback(
    (
      sectionId: string,
      studentId: string | undefined,
      studentName: string,
      action: StrugglingActionType,
    ) => {
      const actionCopy = strugglingActionCopy[action]
      const message = `${actionCopy.label} assigned for ${studentName}`
      const key = `${sectionId}-${studentId ?? studentName}`
      setStudentActionHistory((prev) => ({ ...prev, [key]: message }))
      toast.success(message)
    },
    [],
  )

  const handleFocusGroupAction = useCallback(
    (groupTitle: string, action: StrugglingActionType) => {
      const actionCopy = strugglingActionCopy[action]
      const message = `${actionCopy.label} assigned for ${groupTitle}`
      setFocusGroupActionHistory((prev) => ({ ...prev, [groupTitle]: message }))
      toast.success(message)
    },
    [],
  )

  const chartGradient = useMemo(() => {
    if (!totalAiUsage) return "conic-gradient(#e5e7eb, #cbd5f5)"
    let start = 0
    const stops = aiUsage.map((segment) => {
      const percent = (segment.value / totalAiUsage) * 100
      const end = start + percent
      const color = toneColors[segment.tone]
      const stop = `${color} ${start}% ${end}%`
      start = end
      return stop
    })
    return `conic-gradient(${stops.join(", ")})`
  }, [aiUsage, totalAiUsage])

  const lowConfidenceHighlights = useMemo(
    () =>
      [...aiHighlights]
        .sort((a, b) => (b.hints ?? 0) - (a.hints ?? 0))
        .slice(0, 3),
    [aiHighlights],
  )

  const breadcrumbsTrail = breadcrumbs.join(" > ")

  const sectionStudentsWithCache = useMemo(() => {
    if (!sectionProgressModule) return []
    return sectionProgressModule.students.map((student) => ({
      ...student,
      sections:
        studentSectionsCache[student.student_id]?.[sectionProgressModule.id] ??
        student.sections ??
        [],
    }))
  }, [sectionProgressModule, studentSectionsCache])

  const sectionSummaries = useMemo(
    () => buildSectionProgressSummaries(sectionStudentsWithCache, studentsTracked),
    [sectionStudentsWithCache, studentsTracked],
  )

  const aggregatedSectionStats = useMemo(() => {
    const totals = { strong: 0, average: 0, weak: 0, notStarted: 0 }
    let averageSum = 0
    let averageCount = 0
    for (const section of sectionSummaries) {
      totals.strong += section.strong
      totals.average += section.average
      totals.weak += section.weak
      totals.notStarted += section.notStarted
      if (section.averageScore !== null) {
        averageSum += section.averageScore
        averageCount += 1
      }
    }
    return {
      totals,
      averageOfAverages: averageCount ? Math.round(averageSum / averageCount) : null,
      totalSegments: totals.strong + totals.average + totals.weak + totals.notStarted,
    }
  }, [sectionSummaries])

  const assignedStudentStats = useMemo(() => {
    let assignedStudents = 0
    let attemptedStudents = 0
    for (const section of sectionSummaries) {
      if (section.assignedStudents > 0) {
        assignedStudents += section.assignedStudents
        attemptedStudents += section.attemptedStudents
      }
    }
    return {
      assignedStudents,
      attemptedStudents,
      notStartedStudents: Math.max(assignedStudents - attemptedStudents, 0),
    }
  }, [sectionSummaries])

  const moduleSectionCompletionPercent = useMemo(() => {
    if (!sectionSummaries.length) return null
    const totalAssigned = sectionSummaries.reduce((sum, section) => sum + section.assignedStudents, 0)
    if (!totalAssigned) return null
    const totalAttempted = sectionSummaries.reduce((sum, section) => sum + section.attemptedStudents, 0)
    return Math.round((totalAttempted / totalAssigned) * 100)
  }, [sectionSummaries])

  const activeTileIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeTile?.id !== activeTileIdRef.current) {
      setExpandedStudentId(null)
    }
    activeTileIdRef.current = activeTile?.id ?? null
  }, [activeTile])

  useEffect(() => {
    if (!focusGroups.length) {
      setOpenFocusGroup(null)
      return
    }

    setOpenFocusGroup((prev) => {
      if (prev && focusGroups.some((group) => group.title === prev)) {
        return prev
      }
      return focusGroups[0].title
    })
  }, [focusGroups])

  useEffect(() => {
    if (!sectionProgressModule) {
      setOpenSectionId(null)
    }
  }, [sectionProgressModule])

  const handleClassChange = (classId: string) => {
    if (classId === selectedClassId) return
    router.push(`/teacher/class-insight?classId=${classId}`)
  }

  const handleSubjectChange = (subjectId: string) => {
    if (subjectId === selectedSubjectId) return
    const params = new URLSearchParams()
    params.set("classId", selectedClassId)
    params.set("subjectId", subjectId)
    router.push(`/teacher/class-insight?${params.toString()}`)
  }

  const fetchStudentSectionsForModule = useCallback(
    async (studentId: string, moduleId: string, options?: { force?: boolean }) => {
      if (!selectedClassId || !studentId || !moduleId) return
      const cachedSections =
        studentSectionsCache[studentId]?.[moduleId]
      if (cachedSections && !options?.force) {
        return
      }
      const params = new URLSearchParams({ class_id: selectedClassId })
      if (selectedSubjectId) {
        params.set("subject_id", selectedSubjectId)
      }
      params.set("student_id", studentId)
      setLoadingStudentDetailsId(studentId)
      try {
        const response = await fetch(`/api/teacher/insights?${params.toString()}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || "Failed to load student section details.")
        }
        const payload = (await response.json()) as { modules?: ModuleInsight[] }
        const module = payload.modules?.find((item) => item.module_id === moduleId)
        const studentData = module?.students?.find(
          (item) => item.student_id === studentId,
        )
        const sections = studentData?.sections ?? []
        setStudentSectionsCache((prev) => {
          const studentCache = prev[studentId] ?? {}
          return {
            ...prev,
            [studentId]: {
              ...studentCache,
              [moduleId]: sections,
            },
          }
        })
        setStudentDetailErrors((prev) => {
          const { [studentId]: _, ...rest } = prev
          return rest
        })
        setActiveTile((prev) => {
          if (!prev || prev.id !== moduleId) {
            return prev
          }
          return {
            ...prev,
            students: prev.students.map((student) =>
              student.student_id === studentId ? { ...student, sections } : student,
            ),
          }
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load student section details."
        setStudentDetailErrors((prev) => ({ ...prev, [studentId]: message }))
      } finally {
        setLoadingStudentDetailsId(null)
      }
    },
    [selectedClassId, selectedSubjectId, studentSectionsCache],
  )

  const toggleStudentAccordion = (studentId: string) => {
    setExpandedStudentId((prev) => {
      const isOpening = prev !== studentId
      if (isOpening && activeTile) {
        const moduleId = activeTile.id
        void fetchStudentSectionsForModule(studentId, moduleId, { force: true })
      }
      return isOpening ? studentId : null
    })
  }

  const toggleSectionAccordion = (sectionId: string) => {
    setOpenSectionId((prev) => (prev === sectionId ? null : sectionId))
  }

  const handleSectionProgressOpen = (tile: MasteryTile) => {
    setActiveTile(null)
    const isAlreadyOpen = sectionProgressModule?.id === tile.id
    setSectionProgressModule(isAlreadyOpen ? null : tile)
    if (!tile.students.length) return
    if (isAlreadyOpen) {
      return
    }
    void Promise.all(
      tile.students.map((student) => {
        if (!student.student_id) return Promise.resolve()
        return fetchStudentSectionsForModule(student.student_id, tile.id).catch(() => undefined)
      }),
    )
  }

  const simpleFocusPreview = useMemo(
    () =>
      focusGroups.slice(0, 2).map((group) => ({
        title: group.title,
        description: group.description,
        students: group.items.slice(0, 2),
        totalStudents: group.items.length,
      })),
    [focusGroups],
  )

  const masteryTableRows = useMemo(
    () =>
      masteryTiles.map((tile) => {
        const changeLabel =
          tile.students.length === 0
            ? "0 students monitored"
            : tile.progress >= 0
            ? `+${tile.progress}% vs last sync`
            : `${tile.progress}% change`
        return { tile, changeLabel }
      }),
    [masteryTiles],
  )


  const simpleViewContent = (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Mastery map</p>
            <h3 className="text-lg font-semibold text-slate-900">Clean mastery summary</h3>
            <p className="text-xs text-slate-500">
              Mastery percentages show the latest sync and are color coded by urgency so you can act instantly.
            </p>
          </div>
          <span className="text-xs text-slate-500">Updated every sync</span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <table className="min-w-full divide-y border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <b>Topic</b>
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <b>Topic Avg. Score</b>
                </th>
                <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <b>Struggling</b>
                </th>
                <th className="px-4 py-3 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <b>Action</b>
                </th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-100">
                {masteryTableRows.map(({ tile, changeLabel }) => {
                  const toneKey =
                    tile.students.length === 0
                      ? "Not started"
                      : tile.color === "green"
                      ? "Strong"
                      : tile.color === "amber"
                      ? "Average"
                      : tile.color === "rose"
                      ? "Weak"
                      : "NA"
                  const toneLabel = toneKey
                  const isAccordionOpen = sectionProgressModule?.id === tile.id
                  return (
                    <Fragment key={tile.id}>
                      <tr>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tileToneClasses[toneKey]}`}
                            >
                              {toneLabel}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">{tile.topic}</span>
                          </div>
                          {/* <p className="text-[12px] text-slate-500 mt-2">{tile.students.length} students monitored</p> */}
                          <p className="text-[12px] text-slate-500 mt-2">
                            {tile.strengthSummary.strong} Strong · {tile.strengthSummary.average} Average · {tile.strengthSummary.weak} weak · {tile.strengthSummary.notStarted} Not started
                          </p>
                          {/* <button
                            type="button"
                            onClick={() => handleSectionProgressOpen(tile)}
                            className="mt-3 inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500 transition hover:border-sky-400 hover:text-sky-700"
                            aria-label={`Open section progress for ${tile.topic}`}
                          >
                            {isAccordionOpen ? "Close section details" : "Section progress"}
                          </button> */}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-2xl font-semibold text-slate-900">{tile.mastery}%</div>
                          {/* <p className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                            <TrendingUp className="h-3 w-3" aria-hidden="true" />
                            {changeLabel}
                          </p> */}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">{tile.struggling}</div>
                          <p className="text-[11px] text-slate-500">Students struggling</p>
                        </td>
                        <td className="px-4  text-center py-3">
                          {/* <button
                            type="button"
                            onClick={() => setActiveTile(tile)}
                            className="inline-flex items-center justify-center rounded-full border border-transparent px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition shadow-lg hover:shadow-xl"
                            style={{ background: "linear-gradient(90deg, #ad46ff 0%, #615fff 100%)" }}
                            aria-label={`Open ${tile.topic} student insight`}
                          >
                            Students insight
                          </button> */}
                          <button
                            type="button"
                            onClick={() => handleSectionProgressOpen(tile)}
                            style={{ background: "linear-gradient(90deg, #ad46ff 0%, #615fff 100%)" }}
                            className="mt-3 inline-flex items-center justify-center text-white rounded-full border border-slate-200 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500 transition hover:border-sky-400 hover:text-sky-700"
                            aria-label={`Open section progress for ${tile.topic}`}
                          >
                            {isAccordionOpen ? "Close section details" : "Section progress"}
                          </button>
                        </td>
                      </tr>
                      {isAccordionOpen && (
                        <tr className="bg-slate-50">
                          <td colSpan={4} className="px-0 py-1">
                            <div className="space-y-4 rounded-0xl border-slate-200/80 bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Section progress</p>
                                  <h3 className="text-lg font-semibold text-slate-900">{sectionProgressModule?.topic}</h3>
                                  <p className="text-xs text-slate-500">
                                    {assignedStudentStats.attemptedStudents} students tracked · {sectionSummaries.length} sections
                                  </p>
                                  {/* {assignedStudentStats.assignedStudents > 0 && (
                                    <p className="text-xs text-slate-500">
                                      Assigned broken down · Attempted: {assignedStudentStats.attemptedStudents} · Not started:{" "}
                                      {assignedStudentStats.notStartedStudents}
                                    </p>
                                  )} */}
                                </div>
                                {/* <button
                                  type="button"
                                  onClick={() => handleSectionProgressOpen(tile)}
                                  className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:border-slate-300"
                                >
                                  Close
                                </button> */}
                              </div>
                              {/* <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Sections tracked</p>
                                  <p className="text-2xl font-semibold text-slate-900">{sectionSummaries.length}</p>
                                  <p className="text-xs text-slate-500">{studentsTracked} students</p>
                                  {assignedStudentStats.assignedStudents > 0 && (
                                    <p className="text-xs text-slate-500">
                                      Assigned broken down · Attempted: {assignedStudentStats.attemptedStudents} · Not started:{" "}
                                      {assignedStudentStats.notStartedStudents}
                                    </p>
                                  )}
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Average score</p>
                                  <p className="text-2xl font-semibold text-slate-900">
                                    {aggregatedSectionStats.averageOfAverages !== null
                                      ? `${aggregatedSectionStats.averageOfAverages}%`
                                      : "--"}
                                  </p>
                                  <p className="text-xs text-slate-500">Across sections</p>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Module completion</p>
                                  <p className="text-2xl font-semibold text-slate-900">
                                    {moduleSectionCompletionPercent !== null ? `${moduleSectionCompletionPercent}%` : "--"}
                                  </p>
                                  <p className="text-xs text-slate-500">Expected entries vs recorded</p>
                                </div>
                              </div> */}
                              {/* <div>
                                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
                                  {aggregatedSectionStats.totalSegments > 0 ? (
                                    (["strong", "average", "weak", "notStarted"] as const).map((key) => {
                                      const value = aggregatedSectionStats.totals[key]
                                      if (!value) return null
                                      const width = Math.max(
                                        1,
                                        Math.round((value / aggregatedSectionStats.totalSegments) * 100),
                                      )
                                      return (
                                        <div
                                          key={key}
                                          className="h-full"
                                          style={{ width: `${width}%`, backgroundColor: sectionStackColors[key] }}
                                          aria-label={`${sectionToneLabels[key]} ${value}`}
                                        />
                                      )
                                    })
                                  ) : (
                                    <div className="h-full bg-slate-200" />
                                  )}
                                </div>
                                {aggregatedSectionStats.totalSegments ? (
                                  <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500">
                                    Section update:
                                    {(["strong", "average", "weak", "notStarted"] as const).map((key) => (
                                      <div key={key} className="flex items-center gap-1">
                                        <span
                                          className="h-2 w-2 rounded-full"
                                          style={{ backgroundColor: sectionStackColors[key] }}
                                          aria-hidden="true"
                                        />
                                        <span className="font-semibold text-slate-900">{aggregatedSectionStats.totals[key]}</span>
                                        <span>{sectionToneLabels[key]}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Section distributions populate once students attempt the curriculum.
                                  </p>
                                )}
                              </div> */}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr>
                                      <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Section
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Average Score
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Strong
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Average
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Weak
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Not started
                                      </th>
                                      <th className="px-3 py-2 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                        Completion
                                      </th>
                                      <th className="px-3 py-2" />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sectionSummaries.map((section) => {
                                      const sectionTotal = Math.max(
                                        1,
                                        section.strong + section.average + section.weak + section.notStarted,
                                      )
                                      const completionPercent =
                                        section.assignedStudents > 0
                                          ? Math.round(
                                              (section.attemptedStudents / section.assignedStudents) * 100,
                                            )
                                          : null
                                      const isSectionOpen = openSectionId === section.section_id

                                      return (
                                        <Fragment key={section.section_id}>
                                          <tr className="transition hover:bg-slate-50">
                                            <td className="px-3 py-3 font-semibold text-slate-900">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                  className={
                                                    section.assigned
                                                      ? assignmentBadgeClasses.assigned
                                                      : assignmentBadgeClasses.notAssigned
                                                  }
                                                >
                                                  {section.assigned ? "Assigned" : "Not assigned"}
                                                </span>
                                                <span>{section.section_title}</span>
                                              </div>
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-700">
                                              {section.averageScore !== null ? `${section.averageScore}%` : "--"}
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.strong}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.average}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.weak}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{Math.max(section.assignedStudents - section.attemptedStudents, 0)}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">
                                              {completionPercent !== null ? `${completionPercent}%` : "--"}
                                              {/* {section.assignedStudents > 0 && (
                                                <div className="text-[11px] text-slate-400">
                                                  Attempted {section.attemptedStudents} · Not started{" "}
                                                  {Math.max(section.assignedStudents - section.attemptedStudents, 0)}
                                                </div>
                                              )} */}
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                              <button
                                                type="button"
                                                onClick={() => toggleSectionAccordion(section.section_id)}
                                                style={{ background: "linear-gradient(90deg, #201e20 0%, #053a2f 100%)" }}
                                                className="text-[11px] font-semibold text-white px-2 py-1 tracking-[0.1em] text-sky-500 transition hover:text-sky-700"
                                                aria-expanded={isSectionOpen}
                                              >
                                                {isSectionOpen ? "Hide students" : "Show students"}
                                              </button>
                                            </td>
                                          </tr>
                                          {isSectionOpen && (
                                            <tr className="bg-slate-50">
                                              <td colSpan={9} className="px-3 py-3">
                                                <div className="space-y-2">
                                                  {section.studentScores.length ? (
                                                    <div className="overflow-x-auto">
                                                      <table className="min-w-full text-sm">
                                                        <thead  style={{ backgroundColor: "black" }}>
                                                          <tr className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                                            <th className="px-3 py-2 text-white text-left">S. no</th>
                                                            <th className="px-3 py-2 text-white text-left">Student</th>
                                                            <th className="px-3 py-2 text-white text-center">Score</th>
                                                            <th className="px-3 py-2 text-white text-center">Adaptive Quiz</th>
                                                            <th className="px-3 py-2 text-white text-center">Practice Exercises</th>
                                                            <th className="px-3 py-2 text-white text-center">Hints Used</th>
                                                            <th className="px-3 py-2 text-white text-center">Action</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                          {section.studentScores.map((student, index) => {
                                                            const detail = student.section_detail
                                                            const scoreTone = getScoreTone(detail.section_score)
                                                            const studentKey = `${section.section_id}-${student.student_id ?? student.student_name}`
                                                            const showStudentActions = scoreTone === "weak"
                                                            const lastStudentAction = studentActionHistory[studentKey]
                                                            const tone = scoreTone
                                                            const scoreLabel =
                                                              detail.section_score !== null && detail.section_score !== undefined
                                                                ? `${detail.section_score}%`
                                                                : "--"
                                                            return (
                                                              <tr key={`${section.section_id}-${student.student_id}`}>
                                                                <td className="px-3 py-3 text-left">
                                                                  <p>
                                                                    {index + 1}
                                                                  </p>
                                                                </td>
                                                                <td className="px-3 py-3">
                                                                  <p className="font-semibold text-slate-900">{student.student_name}</p>
                                                                  {/* <p className="text-[11px] text-slate-500">
                                                                    {detail.completed ? "Completed" : "Not started"} · {detail.adaptive_status} · {detail.exercise_status}
                                                                  </p> */}
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                  <span className={`font-semibold ${sectionScoreToneClasses[tone]}`}>{scoreLabel}</span>
                                                                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {sectionToneLabels[tone]}
                                                                  </div>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                  <p className={`font-semibold ${statusToneClasses[detail.adaptive_status]}`}>
                                                                    {detail.adaptive_percent ?? "--"}%
                                                                  </p>
                                                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {detail.adaptive_status}
                                                                  </p>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                  <p className={`font-semibold ${statusToneClasses[detail.exercise_status]}`}>
                                                                    {detail.exercise_percent ?? "--"}%
                                                                  </p>
                                                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {detail.exercise_status}
                                                                  </p>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                  {detail.exercise_hint_count ? (
                                                                    <div className="space-y-1 text-[13px] text-slate-500">
                                                                      <p className="font-semibold text-slate-900">
                                                                        {detail.exercise_hint_count} hint
                                                                        {detail.exercise_hint_count === 1 ? "" : "s"}
                                                                      </p>
                                                                      {/* {detail.exercise_hints?.map((hint) => (
                                                                        <div key={hint.exercise_id} className="flex items-center justify-between text-[11px]">
                                                                          <span className="text-slate-500">{hint.title ?? "Practice exercise"}</span>
                                                                          <span className="font-semibold text-slate-900">
                                                                            {hint.hints} hint{hint.hints === 1 ? "" : "s"}
                                                                          </span>
                                                                        </div>
                                                                      ))} */}
                                                                    </div>
                                                                  ) : (
                                                                    <span className="text-[11px] text-slate-400">No hints</span>
                                                                  )}
                                                                </td>
                                                                <td className="px-3 py-3 text-center align-top">
                                                                  {showStudentActions ? (
                                                                    <div className="space-y-2">
                                                                      <p className="text-[12px] font-semibold text-rose-600">
                                                                        Need help
                                                                      </p>
                                                                      <div className="grid gap-2 text-[10px] sm:grid-cols-2">
                                                                        {(strugglingActionTypes).map((actionType) => (
                                                                          <button
                                                                            key={actionType}
                                                                            type="button"
                                                                            onClick={() =>
                                                                              handleStudentAction(
                                                                                section.section_id,
                                                                                student.student_id,
                                                                                student.student_name,
                                                                                actionType,
                                                                              )
                                                                            }
                                                                            className="text-left rounded-2xl border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-900 transition hover:border-slate-300"
                                                                          >
                                                                            <span className="block text-[11px]">
                                                                              {strugglingActionCopy[actionType].label}
                                                                            </span>
                                                                            <span className="text-[9px] font-normal text-slate-500">
                                                                              {strugglingActionCopy[actionType].description}
                                                                            </span>
                                                                          </button>
                                                                        ))}
                                                                      </div>
                                                                      {lastStudentAction && (
                                                                        <p className="text-[10px] text-slate-800">
                                                                          Last action: {lastStudentAction}
                                                                        </p>
                                                                      )}
                                                                    </div>
                                                                  ) : (
                                                                    <p className="text-[12px] font-semibold text-emerald-600">
                                                                      On Track
                                                                    </p>
                                                                  )}
                                                                </td>
                                                              </tr>
                                                            )
                                                          })}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  ) : (
                                                    <p className="text-xs text-slate-500">Scores will populate once sections sync.</p>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Mastery columns prioritize the most urgent modules; select a row to open the student breakdown on the side.
        </p>
      </div>

      {/* <div className="grid gap-4 md:grid-cols-2">
        {simpleFocusPreview.length ? (
          simpleFocusPreview.map((group) => (
            <div key={group.title} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Focus group</p>
                <span className="text-xs text-slate-500">{group.totalStudents} students highlighted</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{group.title}</h3>
              <p className="text-sm text-slate-500">{group.description}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                {group.students.map((student) => (
                  <div key={`${group.title}-${student.name}`} className="flex items-center justify-between">
                    <span>{student.name}</span>
                    <span className="text-[11px] text-slate-400">{student.detail}</span>
                  </div>
                ))}
              </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                {group.students.map((student, index) => (
                  <span
                    key={`${group.title}-${student.tag}-${index}`}
                    className="rounded-full border border-slate-200 px-2 py-0.5"
                  >
                    {student.tag}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 p-6 text-xs text-slate-500">
            Focus group signals appear once students have activity in the current module.
          </div>
        )}
      </div> */}
    </div>
  )

  const advancedViewContent = (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Jarvis usage</p>
              <h3 className="text-lg font-semibold text-slate-900">AI hints by tone</h3>
              <p className="text-xs text-slate-500">Total hints this sync: {totalHintsUsed}</p>
            </div>
            <span className="text-xs text-slate-500">Live</span>
          </div>
          <div className="mt-6 flex flex-col items-center gap-6 lg:flex-row">
            <div
              className="relative h-40 w-40 rounded-full border border-slate-100"
              style={{ background: chartGradient }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-semibold text-slate-900">{totalAiUsage}</span>
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">hints</span>
              </div>
            </div>
            <div className="flex-1 space-y-3 text-sm text-slate-600">
              {aiUsage.length ? (
                aiUsage.map((segment) => (
                  <div
                    key={`${segment.label}-${segment.range}`}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: toneColors[segment.tone] }}
                      />
                      <div>
                        <p className="font-semibold text-slate-900">{segment.label}</p>
                        <p className="text-[11px] text-slate-400">{segment.range}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{segment.value} hints</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  Jarvis histograms will populate once hints are shared with students.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-rose-500">Low Confidence</p>
                <h3 className="text-lg font-semibold text-slate-900">
                  Top 3 students with the most AI support
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <span aria-hidden="true">🚨</span>
                  Auto flagged with “Low Confidence”
                </p>
              </div>
              <Sparkles className="h-5 w-5 text-rose-500" />
            </div>
            <p className="text-xs text-slate-500">
              Jarvis calls these out when low-confidence hints stack up on the same students.
            </p>
            <div className="mt-3 space-y-3">
              {lowConfidenceHighlights.length ? (
                lowConfidenceHighlights.map((highlight, index) => {
                  const keyParts = [
                    highlight.student_id ?? "student",
                    highlight.topic ?? "topic",
                    index,
                  ]
                  return (
                    <div
                      key={keyParts.join("-")}
                      className="rounded-xl bg-slate-50/80 p-3 text-sm text-slate-600"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{highlight.name}</p>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-500">
                          {highlight.hints} hints
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{highlight.topic}</p>
                      {highlight.detail && (
                        <p className="text-[11px] text-slate-400">{highlight.detail}</p>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-slate-500">
                  Low-confidence signals appear once Jarvis starts surfacing uncertain hints.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Student AI usage</p>
              <span className="text-xs text-slate-500">Top students</span>
            </div>
            <div className="mt-3 space-y-3">
              {studentAiUsage.length ? (
                studentAiUsage.map((student) => (
                  <div key={student.student_id} className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{student.student_name}</p>
                      {student.detail && (
                        <p className="text-[11px] text-slate-500">{student.detail}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-500">
                      {student.hints} hints
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">
                  Hint usage will populate once students start interacting with Jarvis.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Focus groups</p>
              <h3 className="text-lg font-semibold text-slate-900">Who needs my attention?</h3>
            </div>
            <span className="text-xs text-slate-500">Prioritized for action</span>
          </div>
          <div className="mt-4 space-y-3">
            {focusGroups.length ? (
              focusGroups.map((group) => {
                const isOpen = openFocusGroup === group.title
                const containerClass = isOpen
                  ? "border-slate-300 bg-slate-50"
                  : "border-slate-200 bg-white"
                return (
                  <div
                    key={group.title}
                    className={`overflow-hidden rounded-1xl border ${containerClass} shadow-sm transition`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenFocusGroup((prev) => (prev === group.title ? null : group.title))
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                      aria-expanded={isOpen}
                      aria-controls={`focus-${group.title}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{group.title}</p>
                        <p className="text-[11px] text-slate-500">{group.description}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                        {isOpen ? "Open" : "Details"}
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        id={`focus-${group.title}`}
                        className="space-y-4 border-t border-slate-200/80 px-5 py-4 text-sm text-slate-500"
                      >
                        {group.title === "Stuck Students" ? (
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Stuck students</p>
                                  <p className="text-sm font-semibold text-slate-900">Weak sections needing attention</p>
                                  <p className="text-xs text-slate-500">
                                    Students whose mastery is below 50% appear below; each row shows the section score that dipped under the threshold.
                                  </p>
                                </div>
                                <div className="text-right text-xs text-slate-500">
                                  {Array.from(new Set((group.tableRows ?? []).map((row) => row.student_id))).length} students · {(group.tableRows ?? []).length} weak entries
                                </div>
                              </div>
                            </div>
                            {(group.tableRows ?? []).length ? (
                              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
                                <table className="min-w-full text-[11px]">
                                  <thead>
                                    <tr className="text-[12px] uppercase tracking-[0.2em] text-slate-500">
                                      <th className="px-2 py-2 text-left">Student</th>
                                      <th className="px-2 py-2 text-left">Section</th>
                                      <th className="px-2 py-2 text-center">Score</th>
                                      <th className="px-2 py-2 text-center">Hints</th>
                                      <th className="px-2 py-2 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {group.tableRows.map((row, index) => {
                                      const sectionTitle = row.section_title ?? "Overall"
                                      const scoreLabel =
                                        row.section_score !== null && row.section_score !== undefined
                                          ? `${Math.round(row.section_score)}%`
                                          : "--"
                                      const sectionActionId = row.section_id ?? sectionTitle
                                      const actionHistoryKey = `${sectionActionId}-${row.student_id}`
                                      const lastAction = studentActionHistory[actionHistoryKey]
                                      return (
                                        <tr className="text-[12px]" key={`${row.student_id}-${index}-${sectionTitle}`}>
                                          <td className="px-2 py-2">
                                            <p className="font-semibold text-slate-900">{row.student_name}</p>
                                          </td>
                                          <td className="px-2 py-2">{sectionTitle}</td>
                                          <td className="px-2 py-2 text-center font-semibold text-rose-600">{scoreLabel}</td>
                                          <td className="px-2 py-2 text-center">{row.hints ?? "--"}</td>
                                          <td className="px-2 py-2 text-center align-top">
                                            <div className="space-y-2">
                                              <div className="flex-wrap gap-3">
                                                {strugglingActionTypes.map((actionType) => (
                                                  <button
                                                    key={actionType}
                                                    type="button"
                                                    onClick={() =>
                                                      handleStudentAction(
                                                        sectionActionId,
                                                        row.student_id,
                                                        row.student_name,
                                                        actionType,
                                                      )
                                                    }
                                                    className="text-left rounded-2xl border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-900 transition hover:border-slate-300"
                                                  >
                                                    <span className="block text-[11px]">{strugglingActionCopy[actionType].label}</span>
                                                    <span className="text-[9px] font-normal text-slate-500">
                                                      {strugglingActionCopy[actionType].description}
                                                    </span>
                                                  </button>
                                                ))}
                                              </div>
                                              {lastAction && (
                                                <p className="text-[10px] text-slate-500">Last action: {lastAction}</p>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No weak students were flagged yet.</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-1">
                              {group.items.map((item) => (
                                <div
                                  key={`${group.title}-${item.name}`}
                                  className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                                >
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                    <p>{item.detail}</p>
                                  </div>
                                  <span className="text-[11px] text-slate-400">{item.tag}</span>
                                </div>
                              ))}
                            </div>
                            {group.title === "Ready for Extension" && group.tableRows && (
                              <div className="space-y-3">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Ready students</p>
                                      <p className="text-sm font-semibold text-slate-900">Sections where students scored ≥ 80%</p>
                                      <p className="text-xs text-slate-500">
                                        Only students already flagged in the “Ready for Extension” bucket are shown; each entry represents a section where they exceeded 80%.
                                      </p>
                                    </div>
                                    <div className="text-right text-xs text-slate-500">
                                      {Array.from(new Set(group.tableRows.map((row) => row.student_id))).length} students ·{" "}
                                      {group.tableRows.length} strong entries
                                    </div>
                                  </div>
                                </div>
                                {group.tableRows.length ? (
                                  <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
                                    <table className="min-w-full text-[11px]">
                                      <thead>
                                        <tr className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                          <th className="px-2 py-2 text-left">Student</th>
                                          <th className="px-2 py-2 text-left">Section</th>
                                          <th className="px-2 py-2 text-center">Score</th>
                                          <th className="px-2 py-2 text-center">Hints</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {group.tableRows.map((row, index) => {
                                          const sectionTitle = row.section_title ?? "Overall"
                                          const scoreLabel =
                                            row.section_score !== null && row.section_score !== undefined
                                              ? `${Math.round(row.section_score)}%`
                                              : "--"
                                          return (
                                            <tr key={`${row.student_id}-${index}-${sectionTitle}`}>
                                              <td className="px-2 py-2">
                                                <p className="font-semibold text-slate-900">{row.student_name}</p>
                                              </td>
                                              <td className="px-2 py-2">{sectionTitle}</td>
                                              <td className="px-2 py-2 text-center font-semibold text-emerald-600">
                                                {scoreLabel}
                                              </td>
                                              <td className="px-2 py-2 text-center">{row.hints ?? "--"}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500">No sections surpassing the readiness threshold yet.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                          {group.actions.map((action) => (
                            <span
                              key={`${group.title}-${action}`}
                              className="rounded-full border border-slate-200 px-3 py-1"
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                        {group.title !== "Stuck Students" && group.strugglingActions && (
                          <div className="mt-2 space-y-1 text-left text-sm">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Weak focus actions
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Only students flagged as weak are shown above. Pick an action to re-engage them.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {group.strugglingActions.map((actionType) => (
                                <button
                                  key={`${group.title}-${actionType}`}
                                  type="button"
                                  onClick={() => handleFocusGroupAction(group.title, actionType)}
                                  className="flex max-w-[220px] flex-col items-start gap-0.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-900 transition hover:border-slate-300"
                                >
                                  <span>{strugglingActionCopy[actionType].label}</span>
                                  <span className="text-[10px] font-normal text-slate-500">
                                    {strugglingActionCopy[actionType].description}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {focusGroupActionHistory[group.title] && (
                              <p className="text-[10px] text-slate-500">
                                Last action: {focusGroupActionHistory[group.title]}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-slate-500">
                Focus groups are built automatically after the first student activity sync.
              </p>
            )}
          </div>
          {jarvisLog && (
            <p className="mt-4 text-xs text-slate-500">{jarvisLog}</p>
          )}
        </div>

        {/* <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Suggested actions</p>
              <h3 className="text-lg font-semibold text-slate-900">AI-generated next steps</h3>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-4 space-y-3">
            {suggestedActions.length ? (
              suggestedActions.map((action) => (
                <div
                  key={action.title}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{action.title}</p>
                    <span className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                      {action.due}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{action.description}</p>
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white shadow-sm"
                  >
                    Assign
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">
                AI recommendations will populate once Jarvis identifies what to assign.
              </p>
            )}
          </div>
        </div> */}
      </div>
    </div>
  )

  return (
    <div className="relative overflow-hidden border border-slate-200/80 bg-white p-6 shadow-xl">
      <div className="pointer-events-none absolute inset-[-200px] bg-[radial-gradient(500px_400px_at_20%_20%,rgba(16,185,129,0.12),transparent),radial-gradient(400px_400px_at_80%_10%,rgba(59,130,246,0.12),transparent)]" />
      <div className="mx-auto max-w-9xl px-4 md:px-6">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Teacher Command Center</p>
          <h1 className="text-3xl font-semibold text-slate-900">
            What's happening in my classroom - and what should I do about it?
          </h1>
          <p className="text-sm text-slate-500">
            {selectedClassName} | {selectedSubjectName} | {selectedClassYear}
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Class
              </span>
              <div className="relative">
                <select
                  value={selectedClassId}
                  onChange={(event) => handleClassChange(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                >
                  {classGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  ?
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Subject
              </span>
              <div className="relative">
                <select
                  value={selectedSubjectId}
                  onChange={(event) => handleSubjectChange(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  ?
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-500">Last accessed: {lastAccessedLabel}</div>
          </div>
          <div className="text-xs text-slate-500">{breadcrumbsTrail}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {quickStatsToRender.map((metric) => (
              <div key={metric.label} className="rounded-1xl border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{metric.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{metric.value}</div>
                {metric.sublabel && (
                  <div className="text-xs text-slate-500">{metric.sublabel}</div>
                )}
              </div>
            ))}
          </div>
        </header>

        <div className="mt-10 space-y-10">
          {simpleViewContent}
          {advancedViewContent}
        </div>
      </div>

      {activeTile && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setActiveTile(null)} />
          <aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-4 rounded-l-1xl border border-slate-200/80 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-label="Student breakdown"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Student Breakdown</p>
                <h3 className="text-lg font-semibold text-slate-900">{activeTile.topic}</h3>
                <p className="text-sm text-slate-500">
                  Class mastery: {activeTile.mastery}% | {activeTile.students.length} students tracked
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTile(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.1em] text-slate-500">
              <span>{activeTile.students.length} students attempted</span>
              <span>{activeTile.struggling} struggling</span>
            </div>
            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {activeTile.students.length ? (
                activeTile.students.map((student) => {
                  const isExpanded = expandedStudentId === student.student_id
                  const studentSections = student.sections ?? []
                  const assignedSectionDetails = studentSections.filter((section) => section.assigned)
                  const assignedCount = assignedSectionDetails.length
                  const completedAssignedSections = assignedSectionDetails.filter((section) => section.completed).length
                  const computedCompletionPercent =
                    assignedCount > 0
                      ? Math.round((completedAssignedSections / assignedCount) * 100)
                      : null
                  const fallbackCompletionPercent =
                    student.module_completion_percent !== null && student.module_completion_percent !== undefined
                      ? student.module_completion_percent
                      : null
                  const completionLabel =
                    computedCompletionPercent !== null
                      ? `${computedCompletionPercent}%`
                      : fallbackCompletionPercent !== null
                      ? `${fallbackCompletionPercent}%`
                      : "--"
                  const completionDetailText =
                    computedCompletionPercent !== null
                      ? `${computedCompletionPercent}% of assigned sections`
                      : fallbackCompletionPercent !== null
                      ? `${fallbackCompletionPercent}% of sections`
                      : "No completion data"
                  return (
                    <div
                      key={student.student_id}
                      className="rounded-1xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => toggleStudentAccordion(student.student_id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{student.student_name}</p>
                            <p className="text-xs text-slate-500">{student.hints} Jarvis hints</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-slate-900">
                              {student.module_score !== null ? `${student.module_score}%` : "--"}
                            </p>
                            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
                              Module score
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                          <span>Completion {completionLabel}</span>
                          {/* <span style={{ textAlign: "right" }}>Adaptive {student.adaptive_quiz_percent ?? "--"}%</span> */}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="mt-3 space-y-4 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
                          <div className="space-y-1">
                            <p><b>Module completion:</b> {completionDetailText}</p>
                            <p>
                              <b>Module score (sections average):</b>{" "}
                              {student.module_score !== null ? `${student.module_score}%` : "--"}
                            </p>
                            <p><b>Exercise score:</b> {student.exercise_percent ?? "--"}%</p>
                            <p><b>Quiz score:</b> {student.adaptive_quiz_percent ?? "--"}%</p>
                          </div>
                          {/* {loadingStudentDetailsId === student.student_id && (
                            <p className="text-xs text-slate-500">
                              Updating section detail for {student.student_name}...
                            </p>
                          )} */}
                          {studentDetailErrors[student.student_id] && (
                            <p className="text-xs text-rose-500">
                              {studentDetailErrors[student.student_id]}
                            </p>
                          )}
                          <div className="space-y-3">
                            <p className="text-[12px] uppercase tracking-[0.1em] text-slate-400">
                              <b style={{ color: "#000" }}>Section detail</b>
                            </p>
                            {student.sections.length ? (
                              <div className="space-y-2">
                                    {student.sections.map((section) => {
                                      const scoreLabel =
                                        section.section_score !== null
                                          ? `${section.section_score}%`
                                          : "--"
                                      return (
                                        <div
                                          key={section.section_id}
                                          className="rounded-1xl border border-slate-200 bg-white/80 px-3 py-2"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-slate-900">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={
                                                  section.assigned
                                                    ? assignmentBadgeClasses.assigned
                                                    : assignmentBadgeClasses.notAssigned
                                                }
                                              >
                                                {section.assigned ? "Assigned" : "Not assigned"}
                                              </span>
                                              <span>{section.section_title}</span>
                                            </div>
                                            <span>{scoreLabel}</span>
                                          </div>
                                      {section.completed ? (
                                        <>
                                          <div className="mt-1 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2">
                                            <div>
                                              <p className="text-[11px] text-slate-500">
                                                <b>Quiz:</b> {section.adaptive_percent ?? "--"}%
                                              </p>
                                              <p
                                                className={`text-[11px] font-semibold ${statusToneClasses[section.adaptive_status]}`}
                                              >
                                                {section.adaptive_status}
                                              </p>
                                            </div>
                                            <div className="text-right sm:text-right" >
                                              <p className="text-[11px] text-slate-500">
                                                <b>Exercises</b> {section.exercise_percent ?? "--"}%
                                              </p>
                                              <p
                                                className={`text-[11px] font-semibold ${statusToneClasses[section.exercise_status]}`}
                                              >
                                                {section.exercise_status}
                                              </p>
                                            </div>
                                          </div>
                                          {/* <p className={`mt-1 text-[10px] ${
                                              section.completed ? "text-emerald-600" : "text-yellow-500"
                                            }`}
                                          >
                                            {section.completed ? "Attempted" : "Not started"}
                                          </p> */}
                                          {/* <p className="mt-1 text-[10px] text-emerald-600">Attempted</p> */}
                                          {section.exercise_hint_count && section.exercise_hint_count > 0 ? (
                                            <div className="mt-2 space-y-1 text-[12px] text-slate-500">
                                              <div className="flex items-center justify-between">
                                                <span className="font-semibold text-slate-900">
                                                  {section.exercise_hint_count} Jarvis hint
                                                  {section.exercise_hint_count === 1 ? "" : "s"}
                                                </span>
                                                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                                  by exercise
                                                </span>
                                              </div>
                                              {section.exercise_hints?.map((hint) => (
                                                <div
                                                  key={hint.exercise_id}
                                                  className="flex items-center justify-between text-[11px]"
                                                >
                                                  <span className="text-slate-500">
                                                    {hint.title ?? "Practice exercise"}
                                                  </span>
                                                  <span className="font-semibold text-slate-900">
                                                    {hint.hints} hint{hint.hints === 1 ? "" : "s"}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                        </>
                                      ) : (
                                        <p className="mt-1 text-[10px] text-yellow-500">Not started</p>
                                      )}
                                    </div>
                                    )
                                  })}
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  Section progress will appear once attempts sync.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  )
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 p-6 text-sm text-slate-600">
                  No student activity yet for this module. Assign a lesson to populate the list.
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
