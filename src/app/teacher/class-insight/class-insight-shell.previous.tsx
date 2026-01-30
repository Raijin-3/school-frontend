"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { KeyboardEvent } from "react"
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

const tileToneClasses: Record<MasteryTile["color"], string> = {
  green: "border-emerald-200 bg-emerald-50",
  amber: "border-amber-200 bg-amber-50",
  rose: "border-rose-200 bg-rose-50",
}

const toneColors: Record<AiUsageSegment["tone"], string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  rose: "#fb7185",
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
  const [activeTile, setActiveTile] = useState<MasteryTile | null>(null)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
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

  useEffect(() => {
    setExpandedStudentId(null)
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
    async (studentId: string, moduleId: string) => {
      if (!selectedClassId || !studentId || !moduleId) return
      const cachedSections =
        studentSectionsCache[studentId]?.[moduleId]
      if (cachedSections) {
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
        const alreadyCached = Boolean(
          studentSectionsCache[studentId]?.[moduleId],
        )
        if (!alreadyCached) {
          void fetchStudentSectionsForModule(studentId, moduleId)
        }
      }
      return isOpening ? studentId : null
    })
  }

  return (
    <div className="relative overflow-hidden border border-slate-200/80 bg-white p-6 shadow-xl">
      <div className="pointer-events-none absolute inset-[-200px] bg-[radial-gradient(500px_400px_at_20%_20%,rgba(16,185,129,0.12),transparent),radial-gradient(400px_400px_at_80%_10%,rgba(59,130,246,0.12),transparent)]" />
      <div className="mx-auto max-w-9xl px-4 md:px-6">
        <header className="space-y-4">
          <p className="text-xs uppercase tracking-[0.1em] text-slate-400">Teacher Command Center</p>
          <h1 className="text-3xl font-semibold text-slate-900">
            What’s happening in my classroom — and what should I do about it?
          </h1>
          <p className="text-sm text-slate-500">
            {selectedClassName} · {selectedSubjectName} · {selectedClassYear}
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

        <section className="grid gap-6 mt-10 lg:grid-cols-1">
          <div className="rounded-1xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Mastery Map</p>
              <h3 className="text-lg font-semibold text-slate-900">Curriculum Visualizer</h3>
              <p className="text-xs text-slate-500">Where is the class strong? Where are the gaps?</p>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {masteryTiles.map((tile) => {
                const tone = tileToneClasses[tile.color]
                const progressLabel = tile.progress >= 0 ? `+${tile.progress}%` : `${tile.progress}%`
                const openTile = () => setActiveTile(tile)
                const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openTile()
                  }
                }

                return (
                  <div
                    key={tile.id}
                    role="button"
                    tabIndex={0}
                    onClick={openTile}
                    onKeyDown={handleKeyDown}
                    className={`group rounded-1xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${tone}`}
                    aria-label={`Open ${tile.topic} student breakdown`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{tile.topic}</p>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Tile                    
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4">
                      <div className="text-3xl font-semibold text-slate-900">{tile.mastery}%</div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openTile()
                        }}
                        className="rounded-full border border-slate-200 px-4 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                      >
                        View insight
                      </button>
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Class mastery</div>
                    <div className="mt-3 flex items-center gap-2 text-sm text-slate-900">
                      <TrendingUp className="h-4 w-4" />
                      <span className="font-semibold">{progressLabel}</span>
                      <span className="text-[11px] text-slate-500">since last week</span>
                    </div>
                    <div className="mt-2 text-sm text-slate-900">{tile.struggling} students struggling</div>
                    <div className="text-xs text-slate-500">{tile.students.length} students monitored</div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] font-semibold">
                      <span className="flex items-center gap-1 text-emerald-500">
                        <span aria-hidden="true">🟢</span>
                        <span>{tile.strengthSummary.strong} strong</span>
                      </span>
                      <span className="flex items-center gap-1 text-amber-500">
                        <span aria-hidden="true">🟡</span>
                        <span>{tile.strengthSummary.average} average</span>
                      </span>
                      <span className="flex items-center gap-1 text-rose-500">
                        <span aria-hidden="true">🔴</span>
                        <span>{tile.strengthSummary.weak} weak</span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <span aria-hidden="true">⚪</span>
                        <span>{tile.strengthSummary.notStarted} not started</span>
                      </span>
                    </div>

                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 mt-10 lg:grid-cols-2">
          <div className="rounded-1xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.1em] text-slate-500">AI Engagement Summary</p>
              <h3 className="text-lg font-semibold text-slate-900">How much support did Jarvis give, and to whom?</h3>
            </div>
            <div className="mt-6 flex items-start gap-5">
              <div className="relative h-32 w-32">
                <div
                  className="h-full w-full rounded-full border border-slate-200"
                  style={{ backgroundImage: chartGradient }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-xs font-semibold text-slate-500">
                  <span className="text-2xl text-slate-900">{totalHintsUsed}</span>
                  {/* <span>Hints today</span> */}
                </div>
              </div>
              <div className="flex-1 space-y-3">
                {aiUsage.map((segment) => (
                  <div key={segment.label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{segment.label}</p>
                      <p className="text-[11px] text-slate-500">{segment.range}</p>
                    </div>
                    <div className="text-lg font-semibold text-slate-900">{segment.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-1xl border border-dashed border-slate-200/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">
                    Low Confidence
                  </p>
                  <span className="text-xs text-slate-500">Top 3</span>
                </div>
                <div className="mt-3 space-y-3">
                  {aiHighlights.map((highlight, index) => {
                    const keyParts = [
                      highlight.student_id ?? highlight.name ?? "highlight",
                      highlight.topic ?? "topic",
                      index,
                    ]
                    return (
                      <div key={keyParts.join("-")} className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{highlight.name}</p>
                          <p className="text-xs text-slate-500">{highlight.topic}</p>
                          {highlight.detail && (
                            <p className="text-[11px] text-slate-400">{highlight.detail}</p>
                          )}
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">
                          {highlight.hints} hints
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-1xl border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Student AI usage
                  </p>
                  <span className="text-xs text-slate-500">Top students</span>
                </div>
                <div className="mt-3 space-y-3">
                  {studentAiUsage.length ? (
                    studentAiUsage.map((student) => (
                      <div
                        key={student.student_id}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{student.student_name}</p>
                          {student.detail && (
                            <p className="text-[11px] text-slate-500">{student.detail}</p>
                          )}
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-500">
                          {student.hints} hints
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Hint usage will populate once students request Jarvis help.</p>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">{jarvisLog}</p>
          </div>

          <div className="rounded-1xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Student Focus List</p>
              <h3 className="text-lg font-semibold text-slate-900">Who needs my attention this week?</h3>
              <p className="text-xs text-slate-500">Auto-generated, dynamic grouping</p>
            </div>
            <div className="mt-6 space-y-3">
              {focusGroups.map((group) => {
                const isOpen = openFocusGroup === group.title
                return (
                  <div
                    key={group.title}
                    className="overflow-hidden rounded-1xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
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
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                        {isOpen ? "Hide" : "Show"}
                      </span>
                    </button>
                    {isOpen && (
                      <div
                        id={`focus-${group.title}`}
                        className="border-t border-slate-100 px-5 pb-5 pt-0"
                      >
                        <div className="space-y-3 pt-4">
                          {group.items.map((item) => (
                            <div
                              key={item.name}
                              className="rounded-1xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-base font-semibold text-slate-900">{item.name}</p>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[11px] font-semibold tracking-[0.1em] text-slate-500">
                                  {item.tag}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {group.actions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white"
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="space-y-4 mt-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Suggested Actions</p>
              <h2 className="text-xl font-semibold text-slate-900">AI-generated, 1-click assignables</h2>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {suggestedActions.map((action) => (
              <div key={action.title} className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Jarvis suggestion
                </div>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{action.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{action.description}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{action.due}</span>
                  <button
                    type="button"
                    className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm"
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
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
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Student Breakdown</p>
                <h3 className="text-lg font-semibold text-slate-900">{activeTile.topic}</h3>
                <p className="text-sm text-slate-500">
                  Class mastery {activeTile.mastery}% · {activeTile.students.length} students tracked
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
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-500">
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
                            <p><b>Adaptive score:</b> {student.adaptive_quiz_percent ?? "--"}%</p>
                          </div>
                          {loadingStudentDetailsId === student.student_id && (
                            <p className="text-xs text-slate-500">
                              Updating section detail for {student.student_name}…
                            </p>
                          )}
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
                                                <b>Adaptive:</b> {section.adaptive_percent ?? "--"}%
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

