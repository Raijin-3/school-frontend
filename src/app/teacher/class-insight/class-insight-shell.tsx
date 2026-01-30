"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, TrendingUp, X } from "lucide-react"
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

const sectionToneLabels: Record<
  "strong" | "average" | "weak" | "notStarted",
  string
> = {
  strong: "Strong",
  average: "Average",
  weak: "Weak",
  notStarted: "Not started",
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
}

function buildSectionProgressSummaries(
  students: MasteryTile["students"] = [],
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
      const score = section.section_score
      if (score === null || score === undefined) {
        summary.notStarted += 1
      } else if (score >= 80) {
        summary.strong += 1
      } else if (score >= 50) {
        summary.average += 1
      } else {
        summary.weak += 1
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
  } = props

  const router = useRouter()
  const [viewMode, setViewMode] = useState<"simple" | "advanced">("simple")
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
  const totalAiUsage = aiUsage.reduce((sum, segment) => sum + segment.value, 0)

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
    () => buildSectionProgressSummaries(sectionStudentsWithCache),
    [sectionStudentsWithCache],
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

  const moduleSectionCompletionPercent = useMemo(() => {
    if (!sectionProgressModule || !sectionSummaries.length) return 0
    const recorded = sectionSummaries.reduce((sum, section) => sum + section.studentScores.length, 0)
    const potential = sectionSummaries.length * sectionProgressModule.students.length
    if (!potential) return 0
    return Math.round((recorded / potential) * 100)
  }, [sectionProgressModule, sectionSummaries])

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

    if (!focusGroups.some((group) => group.title === openFocusGroup)) {
      setOpenFocusGroup(focusGroups[0].title)
    }
  }, [focusGroups, openFocusGroup])

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


  const viewModeCopy: Record<"simple" | "advanced", { title: string; description: string }> = {
    simple: {
      title: "Simple teacher view",
      description:
        "Highlight mastery with a crisp table and focus pairings so you can triage the right students first.",
    },
    advanced: {
      title: "Advanced analytics view",
      description:
        "Dive into Jarvis usage, AI highlights, and curated actions for the students who need the most support.",
    },
  }

  const viewModes: Array<"simple" | "advanced"> = ["simple", "advanced"]

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
                <th className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-500">
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
                          <button
                            type="button"
                            onClick={() => handleSectionProgressOpen(tile)}
                            className="mt-3 inline-flex items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500 transition hover:border-sky-400 hover:text-sky-700"
                            aria-label={`Open section progress for ${tile.topic}`}
                          >
                            {isAccordionOpen ? "Close section details" : "Section progress"}
                          </button>
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
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setActiveTile(tile)}
                            className="inline-flex items-center justify-center rounded-full border border-transparent px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition shadow-lg hover:shadow-xl"
                            style={{ background: "linear-gradient(90deg, #ad46ff 0%, #615fff 100%)" }}
                            aria-label={`Open ${tile.topic} student insight`}
                          >
                            Students insight
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
                                    {sectionProgressModule?.students.length ?? 0} students tracked · {sectionSummaries.length} sections
                                  </p>
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
                                  <p className="text-xs text-slate-500">{sectionProgressModule?.students.length ?? 0} students</p>
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
                                  <p className="text-2xl font-semibold text-slate-900">{moduleSectionCompletionPercent}%</p>
                                  <p className="text-xs text-slate-500">Expected entries vs recorded</p>
                                </div>
                              </div> */}
                              <div>
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
                              </div>
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
                                      const completionPercent = sectionProgressModule?.students.length
                                        ? Math.round(
                                            (section.studentScores.length / sectionProgressModule.students.length) * 100,
                                          )
                                        : 0
                                      const isSectionOpen = openSectionId === section.section_id

                                      return (
                                        <Fragment key={section.section_id}>
                                          <tr className="transition hover:bg-slate-50">
                                            <td className="px-3 py-3 font-semibold text-slate-900">
                                              {section.section_title}
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-700">
                                              {section.averageScore !== null ? `${section.averageScore}%` : "--"}
                                            </td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.strong}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.average}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.weak}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{section.notStarted}</td>
                                            <td className="px-3 py-3 text-center text-slate-600">{completionPercent}%</td>
                                            <td className="px-3 py-3 text-center">
                                              <button
                                                type="button"
                                                onClick={() => toggleSectionAccordion(section.section_id)}
                                                className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-500 transition hover:text-sky-700"
                                                aria-expanded={isSectionOpen}
                                              >
                                                {isSectionOpen ? "Hide students" : "Show students"}
                                              </button>
                                            </td>
                                          </tr>
                                          {isSectionOpen && (
                                            <tr className="bg-slate-50">
                                              <td colSpan={8} className="px-3 py-3">
                                                <div className="space-y-2">
                                                  {section.studentScores.length ? (
                                                    <div className="overflow-x-auto">
                                                      <table className="min-w-full text-sm">
                                                        <thead>
                                                          <tr className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                                            <th className="px-3 py-2 text-left">Student</th>
                                                            <th className="px-3 py-2 text-right">Score</th>
                                                            <th className="px-3 py-2 text-right">Adaptive Quiz</th>
                                                            <th className="px-3 py-2 text-right">Practice Exercises</th>
                                                            <th className="px-3 py-2 text-right">Hints Used</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                          {section.studentScores.map((student) => {
                                                            const detail = student.section_detail
                                                            const tone = getScoreTone(detail.section_score)
                                                            const scoreLabel =
                                                              detail.section_score !== null && detail.section_score !== undefined
                                                                ? `${detail.section_score}%`
                                                                : "--"
                                                            return (
                                                              <tr key={`${section.section_id}-${student.student_id}`}>
                                                                <td className="px-3 py-3">
                                                                  <p className="font-semibold text-slate-900">{student.student_name}</p>
                                                                  {/* <p className="text-[11px] text-slate-500">
                                                                    {detail.completed ? "Completed" : "Not started"} · {detail.adaptive_status} · {detail.exercise_status}
                                                                  </p> */}
                                                                </td>
                                                                <td className="px-3 py-3 text-right">
                                                                  <span className={`font-semibold ${sectionScoreToneClasses[tone]}`}>{scoreLabel}</span>
                                                                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {sectionToneLabels[tone]}
                                                                  </div>
                                                                </td>
                                                                <td className="px-3 py-3 text-right">
                                                                  <p className={`font-semibold ${statusToneClasses[detail.adaptive_status]}`}>
                                                                    {detail.adaptive_percent ?? "--"}%
                                                                  </p>
                                                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {detail.adaptive_status}
                                                                  </p>
                                                                </td>
                                                                <td className="px-3 py-3 text-right">
                                                                  <p className={`font-semibold ${statusToneClasses[detail.exercise_status]}`}>
                                                                    {detail.exercise_percent ?? "--"}%
                                                                  </p>
                                                                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                                                    {detail.exercise_status}
                                                                  </p>
                                                                </td>
                                                                <td className="px-3 py-3 text-right">
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

      <div className="grid gap-4 md:grid-cols-2">
        {simpleFocusPreview.length ? (
          simpleFocusPreview.map((group) => (
            <div key={group.title} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Focus group</p>
                <span className="text-xs text-slate-500">{group.students.length} students highlighted</span>
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
      </div>
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
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">AI highlights</p>
              <Sparkles className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-xs text-slate-500">Signals from students requesting timely support.</p>
            <div className="mt-3 space-y-3">
              {aiHighlights.length ? (
                aiHighlights.map((highlight, index) => {
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
                  Jarvis highlights will light up when students flag trouble spots.
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

      <div className="grid gap-6 lg:grid-cols-2">
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
                        className="space-y-2 border-t border-slate-200/80 px-5 py-4 text-sm text-slate-500"
                      >
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

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
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
        </div>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickStats.map((metric) => (
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

        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">View mode</p>
              <h2 className="text-2xl font-semibold text-slate-900">{viewModeCopy[viewMode].title}</h2>
              <p className="mt-1 text-sm text-slate-500">{viewModeCopy[viewMode].description}</p>
            </div>
            <div className="flex gap-2">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-full border px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                    viewMode === mode
                      ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                  aria-pressed={viewMode === mode}
                >
                  {mode === "simple" ? "Teacher view" : "Analytics view"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8">{viewMode === "simple" ? simpleViewContent : advancedViewContent}</div>
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
                          <span>Completion {student.module_completion_percent}%</span>
                          {/* <span style={{ textAlign: "right" }}>Adaptive {student.adaptive_quiz_percent ?? "--"}%</span> */}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="mt-3 space-y-4 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
                          <div className="space-y-1">
                            <p><b>Module completion:</b> {student.module_completion_percent}% of sections</p>
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
                                      <div className="flex items-center justify-between text-[13px] font-semibold text-slate-900">
                                        <span>{section.section_title}</span>
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

