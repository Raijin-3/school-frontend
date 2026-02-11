"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  ChartLine,
  MessageCircle,
  Bell,
  Users,
  CircleCheck,
  Award,
  Target,
  Trophy,
  Flame,
  ChevronLeft,
  ChevronRight,
  Snowflake,
  Clock3,
} from "lucide-react"
import { useParentDashboardContext, type ChildAttendance } from "@/components/parent/parent-dashboard-context"
import { getFreezeAllowanceForTier } from "@/components/gamification/tier-benefits"
import {
  AdaptiveSessionSummary,
  deriveSectionScoreSummary,
  getPracticeExerciseScorePercent,
  ModuleSectionAttempt,
  PracticeExerciseSummary,
} from "@/lib/module-section"

type ParentMenuSection = {
  title: string
  icon: (typeof Users)
  accent: string
  items: string[]
  href?: string
}

type ChildSummary = {
  name: string
  xp: number
  level: number
  levelProgressPercent: number
  tier: string
  role: string
  rank: number | null
  assignedCourseCount: number
  currentStreak: number
  longestStreak: number
}

const parentMenuSections: ParentMenuSection[] = [
  // {
  //   title: "My Child",
  //   icon: Users,
  //   accent: "from-indigo-500 to-purple-500",
  //   items: ["Basic details", "Class & section", "Class teacher info", "Recent attendance log"],
  //   href: "/parent-dashboard/my-child",
  // },
  {
    title: "Academic Progress",
    icon: ChartLine,
    accent: "from-emerald-500 to-teal-500",
    items: ["Subject-wise report", "Topic completion", "Test scores", "Assignment status"],
    href: "/parent-dashboard/academic-progress",
  },
  {
    title: "Performance Insights",
    icon: Award,
    accent: "from-amber-500 to-orange-500",
    items: ["Strengths", "Weak areas", "Teacher remarks"],
    href: "/parent-dashboard/performance-insights",
  },
  // {
  //   title: "Attendance",
  //   icon: CalendarDays,
  //   accent: "from-sky-500 to-blue-600",
  //   items: ["Daily attendance", "Monthly summary"],
  //   href: "/parent-dashboard/attendance",
  // },
  // {
  //   title: "Teacher Communication",
  //   icon: MessageCircle,
  //   accent: "from-fuchsia-500 to-pink-500",
  //   items: ["Subject teacher list", "Messages & announcements"],
  //   href: "/parent-dashboard/teacher-communication",
  // },
  {
    title: "Notifications",
    icon: Bell,
    accent: "from-rose-500 to-red-500",
    items: ["Exam updates", "Homework alerts", "Teacher Alert"],
    href: "/parent-dashboard/notifications",
  },
]

const parentActions = [
  {
    label: "My Child profile",
    description: "Full child details & teacher updates",
    href: "/parent-dashboard/my-child",
    icon: Users,
    gradientFrom: "from-indigo-500",
    gradientTo: "to-purple-500",
  },
]

type SectionAttemptStatus = {
  sectionId: string
  adaptiveCompleted: boolean
  adaptiveScorePercent: number | null
  exerciseSatisfied: boolean
  wrongExerciseQuestions: number
}

const MONTH_WINDOW = 6
const MIN_MONTH_OFFSET = -MONTH_WINDOW
const MAX_MONTH_OFFSET = MONTH_WINDOW
const MS_IN_DAY = 86_400_000
const DATE_LOCALE = "en-US"
const DATE_TIMEZONE = "UTC"

type AttendanceStatusOverride = "Present" | "Absent" | "Holiday" | "Weekend"

type StreakCalendarEntry = {
  date: string
  present?: boolean | null
  isFuture?: boolean
  lastActivityAt?: string | null
}

type ParentStreakPayload = {
  streakCalendar?: StreakCalendarEntry[]
  stats?: {
    xp?: number
    tier?: string
    streakDays?: number
  }
}

type VisibleDay = {
  iso: string
  weekday: string
  monthLabel: string
  dayNumber: number
  isPresent: boolean
  isFuture: boolean
  isToday: boolean
  isCurrentMonth: boolean
  isFrozen?: boolean
}

export default function ParentDashboardPage() {
  const { childData, parentProfile, selectedChildId, hasLinkedChildren } = useParentDashboardContext()
  const { profile, todaySubjects, alerts, classDetails, focusAreas, subjectDetails, strengths, weakAreas, teacherRemarks, teacherList, communications, notifications, attendance } = childData
  const subjectProgress = subjectDetails.map((subject) => ({
    subject: subject.subject,
    value: subject.completion,
    focus: subject.focus,
  }))
  const strengthLabels = strengths.map((item) => item.label)
  const improvementLabels = weakAreas.map((item) => item.label)
  const teacherRemarkTexts = teacherRemarks.map((item) => item.remark)
  const notificationList = [
    ...notifications.examUpdates.map((item) => ({ title: item.title, detail: item.detail, category: "Exam updates" })),
    ...notifications.homeworkAlerts.map((item) => ({ title: item.title, detail: item.detail, category: "Homework alerts" })),
    ...notifications.announcements.map((item) => ({ title: item.title, detail: item.detail, category: "School announcements" })),
  ]

  const [moduleSections, setModuleSections] = useState<ModuleSectionAttempt[]>([])
  const [moduleSectionsLoading, setModuleSectionsLoading] = useState(false)
  const [moduleSectionsError, setModuleSectionsError] = useState<string | null>(null)

  const [selectedModuleReference, setSelectedModuleReference] = useState<{ subject: string; moduleId: string } | null>(null)

  const [openSubjectIndex, setOpenSubjectIndex] = useState(0)

  const [childSummary, setChildSummary] = useState<ChildSummary | null>(null)
  const [isSummaryLoading, setIsSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedChildId) return
    let active = true
    const controller = new AbortController()
    setIsSummaryLoading(true)
    setSummaryError(null)
    setChildSummary(null)

    const fetchSummary = async () => {
      try {
        const response = await fetch(`/api/parent/summary?child_id=${encodeURIComponent(selectedChildId)}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!active) return
        if (!response.ok) {
          const message = await response.text().catch(() => response.statusText)
          throw new Error(message || "Failed to load summary")
        }
        const payload = (await response.json()) as ChildSummary
        if (!active) return
        setChildSummary(payload)
      } catch (error) {
        if (!active) return
        if ((error as any)?.name === "AbortError") {
          return
        }
        console.error("Failed to load child summary", error)
        setSummaryError("Summary unavailable right now.")
      } finally {
        if (active) {
          setIsSummaryLoading(false)
        }
      }
    }

    void fetchSummary()

    return () => {
      active = false
      controller.abort()
    }
  }, [selectedChildId])

  useEffect(() => {
    setSelectedModuleReference(null)
  }, [selectedChildId])

  const activeSubject = useMemo(() => {
    if (!subjectDetails.length) {
      return null
    }
    if (!selectedModuleReference) {
      return subjectDetails[0]
    }
    const matchedSubject = subjectDetails.find((subject) => subject.subject === selectedModuleReference.subject)
    if (
      matchedSubject &&
      matchedSubject.modules?.some((module) => module.id === selectedModuleReference.moduleId)
    ) {
      return matchedSubject
    }
    return subjectDetails[0]
  }, [subjectDetails, selectedModuleReference])

  const activeModule = useMemo(() => {
    if (!activeSubject?.modules?.length) return null
    if (!selectedModuleReference) {
      return activeSubject.modules[0]
    }
    const matchedModule = activeSubject.modules.find(
      (module) => module.id === selectedModuleReference.moduleId,
    )
    return matchedModule ?? activeSubject.modules[0]
  }, [activeSubject, selectedModuleReference])

  useEffect(() => {
    if (!activeModule?.id) {
      setModuleSections([])
      setModuleSectionsError(null)
      setModuleSectionsLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true
    setModuleSectionsLoading(true)
    setModuleSectionsError(null)
    setModuleSections([])

    const params = new URLSearchParams({ module_id: activeModule.id })
    if (selectedChildId) {
      params.set("child_id", selectedChildId)
    }

    const fetchModuleSections = async () => {
      try {
        const response = await fetch(`/api/parent/module-sections?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) {
          const message = await response.text().catch(() => response.statusText)
          throw new Error(message || "Failed to load sections")
        }
        const payload = (await response.json()) as ModuleSectionAttempt[]
        if (!active) return
        setModuleSections(payload)
      } catch (error) {
        if (!active) return
        if ((error as any)?.name === "AbortError") {
          return
        }
        console.error("Failed to load module sections", error)
        setModuleSectionsError(
          (error as Error)?.message ?? "Unable to load sections",
        )
      } finally {
        if (active) {
          setModuleSectionsLoading(false)
        }
      }
    }

    void fetchModuleSections()

    return () => {
      active = false
      controller.abort()
    }
  }, [activeModule?.id, selectedChildId])

  const topicCompletion = activeSubject?.topics ?? []
  const testScores = activeSubject?.tests ?? []
  const assignmentStatus = activeSubject?.assignments ?? []
  const activeModuleProgressPercent = Math.max(
    0,
    Math.min(
      100,
      activeModule?.progress ?? activeModule?.completion ?? 0,
    ),
  )

  const handleViewModuleDetails = (subjectName: string, moduleId: string) => {
    setSelectedModuleReference({ subject: subjectName, moduleId })
  }

  const activeModuleLabel = activeModule?.title ?? activeModule?.id ?? "Select a module"
  const activeSubjectLabel = activeSubject?.subject ?? "Subject progress"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-4 lg:py-5">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-2xl shadow-slate-200/60 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            
            
              {parentProfile?.full_name && (
                <p className="text-base font-medium text-slate-700">
                  Welcome back, {parentProfile.full_name}!
                </p>
              )}
            
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600/90">
                Parent Panel • Read-only + communication
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
                Track {profile.name}’s learning at a glance
              </h1>
              <p className="mt-1 text-sm text-slate-500 md:text-base">
                Visibility, trust, and timely involvement — everything you need to stay aligned with the classroom and their journey.
              </p>
            </div>
          {/* <div className="flex flex-col items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-inner">
              <span>Daily check-in</span>
              <span className="text-lg font-bold text-slate-900">Completed</span>
              <span className="text-xs text-slate-500">Latest sync: {profile.lastLogin}</span>
            </div> */}
          </div>
        </header>

        <section aria-label="student summary">
          <ParentChildSummaryCard
            summary={childSummary}
            loading={isSummaryLoading}
            error={summaryError}
            fallbackName={profile.name}
            fallbackAssignedCourseCount={childData.subjectDetails.length}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-600">Child overview</p>
                <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-semibold text-indigo-700">{profile.avatar}</div>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <DetailRow
                label="Class"
                value={classDetails.className ?? profile.grade}
              />
              <DetailRow
                label="Section"
                value={
                  classDetails.sectionLabel ??
                  parseSectionLabel(profile.grade) ??
                  "Section pending"
                }
              />
              <DetailRow
                label="Roll"
                value={profile.roll}
              />
              <DetailRow
                label="Class Teacher"
                value={classDetails.advisor ?? profile.teacher}
              />
              <DetailRow
                label="Status"
                value={profile.overall}
                valueClass="text-emerald-600"
              />
            </dl>
            {classDetails.subjects?.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class subjects</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {classDetails.subjects.map((subject) => (
                    <span
                      key={subject.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm"
                    >
                      {subject.title}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-4 text-sm text-slate-500">{profile.focus}</p>
          </article>

          <article className="rounded-3xl border border-white/60 bg-indigo-950/80 p-5 text-white shadow-lg shadow-slate-900/30 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Today’s subjects</h2>
              <span className="text-xs uppercase tracking-wide text-indigo-200">Live</span>
            </div>
            <div className="mt-4 space-y-4">
              {todaySubjects.map((subject) => (
                <div key={subject.name} className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{subject.name}</h3>
                    <span className="text-xs font-semibold text-indigo-200">{subject.status}</span>
                  </div>
                  <p className="text-sm text-indigo-100">{subject.teacher}</p>
                  <p className="text-xs text-indigo-300">{subject.mood}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Alerts & messages</p>
                <h2 className="text-lg font-bold text-slate-900">Need attention</h2>
              </div>
              {/* <span className="text-xs uppercase tracking-wide text-slate-500">Sync every 4h</span> */}
            </div>
            <div className="mt-4 space-y-3">
              {alerts.map((alert, index) => (
                <div
                  key={`${alert.title ?? "alert"}-${alert.time ?? "time"}-${index}`}
                  className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                  <p className="text-xs text-slate-500">{alert.detail}</p>
                  <p className="mt-1 text-xs font-semibold text-indigo-600">{alert.time}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parent menu</p>
              <h2 className="text-2xl font-bold text-slate-900">Everything is organized by intent</h2>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">Read-only • Trusted</span>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {parentMenuSections.map((section) => (
              <ParentMenuCard key={section.title} section={section} />
            ))}
            {/* <div className="flex items-center justify-end rounded-3xl border border-dashed border-slate-300 bg-white/80 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-xl">
              <a href="/parent-dashboard/my-child" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow">
                View My Child details
                <span aria-hidden="true">→</span>
              </a>
            </div> */}
          </div>
        </section>

        <section className="grid gap-0 md:grid-cols-[40%_60%]">
          <article className="rounded-xl border border-white/70 bg-white/80 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Subject-wise progress</h3>
              <span className="text-xs uppercase tracking-wider text-slate-500">Updated today</span>
            </div>
            <div className="mt-5 space-y-3">
              {subjectDetails.map((subject, index) => {
                const completion = Math.max(0, Math.min(100, subject.completion))
                return (
                  <details
                    key={subject.subject}
                    className="group rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm"
                    open={openSubjectIndex === index}
                    onToggle={(event) => {
                      if (event.currentTarget.open) {
                        setOpenSubjectIndex(index)
                      } else if (openSubjectIndex === index) {
                        setOpenSubjectIndex(-1)
                      }
                    }}
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-slate-700">
                      <span>{subject.subject}</span>
                      <span className="text-xs font-normal uppercase tracking-wide text-slate-500">{completion}% complete</span>
                    </summary>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-teal-500 transition-all duration-300"
                          style={{ width: `${completion}%` }}
                        />
                      </div>
                      {/* <p className="text-xs uppercase tracking-wide text-slate-500">Focus</p>
                      <p className="text-sm text-slate-700">{subject.focus}</p> */}
                      {subject.modules?.length ? (
                        <div className="space-y-3 text-xs text-slate-500">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Modules</p>
                          <div className="space-y-2">
                          {subject.modules.map((module) => {
                            const moduleProgressValue = Math.max(
                              0,
                              Math.min(100, module.progress ?? module.completion ?? 0),
                            )
                            const isActiveModule =
                              selectedModuleReference?.subject === subject.subject &&
                              selectedModuleReference?.moduleId === module.id
                            const moduleLabel = module.title ?? module.id
                            return (
                              <div key={module.id} className="space-y-2">
                                <div
                                  className={`flex items-center justify-between rounded-2xl border p-3 ${
                                    isActiveModule
                                      ? "border-indigo-300 bg-indigo-50/80"
                                      : "border-slate-100 bg-slate-50/80"
                                  }`}
                                >
                                  <div>
                                    <p className="font-semibold text-slate-900">{moduleLabel}</p>
                                    <button
                                      type="button"
                                      onClick={() => handleViewModuleDetails(subject.subject, module.id)}
                                      className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 transition hover:text-indigo-500"
                                      aria-pressed={isActiveModule}
                                    >
                                      {isActiveModule
                                        ? "Viewing on topic grid"
                                        : "View in Topic completion grid"}
                                    </button>
                                  </div>
                                  <div className="text-right text-xs font-semibold text-slate-900">
                                    <p>{moduleProgressValue}%</p>
                                    {module.status ? (
                                      <p className="text-[10px] uppercase tracking-wide text-indigo-600">
                                        {module.status}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="h-1.5 rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-200"
                                    style={{ width: `${moduleProgressValue}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                          {subject.topics.slice(0, 2).map((topic) => (
                            <div key={topic.topic} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                              <p className="font-semibold text-slate-800">{topic.topic}</p>
                              <p>
                                {topic.completed}/{topic.total} modules <span className="font-semibold text-emerald-600">{topic.confidence}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          </article>

          <article className="rounded-0xl border border-white/70 bg-white/80 p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-slate-900">Topic completion & assessments</h3>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Module focus</p>
                    <p className="text-lg font-semibold text-slate-900">{activeModuleLabel}</p>
                    <p className="text-xs text-slate-500">{activeSubjectLabel}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">{activeModuleProgressPercent}%</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500 transition-all"
                    style={{ width: `${activeModuleProgressPercent}%` }}
                  />
                </div>
                {activeModule?.status ? (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {activeModule.status}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    {activeModule
                      ? "Progress is being monitored for this module."
                      : "Select a module from the subject to highlight its completion and assessments."}
                  </p>
                )}
            {selectedModuleReference ? (
              <button
                type="button"
                onClick={() => setSelectedModuleReference(null)}
                className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 transition hover:text-indigo-500"
              >
                Reset to default subject view
              </button>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500">Sections</p>
              {moduleSectionsLoading && (
                <span className="text-[10px] text-slate-500">Loading…</span>
              )}
            </div>
            {moduleSectionsLoading ? (
              <p className="mt-3 text-xs text-slate-500">
                Loading latest section detail…
              </p>
            ) : moduleSectionsError ? (
              <p className="mt-3 text-xs text-rose-500">{moduleSectionsError}</p>
            ) : moduleSections.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white/80 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-slate-600">
                    <thead>
                      <tr>
                        <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold tracking-wide text-[10px] uppercase text-slate-500">
                          Section
                        </th>
                        <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold tracking-wide text-[10px] uppercase text-slate-500">
                          Status
                        </th>
                        <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold tracking-wide text-[10px] uppercase text-slate-500">
                          Score
                        </th>
                        <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold tracking-wide text-[10px] uppercase text-slate-500">
                          Attempts
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {moduleSections.map((section) => {
                        const status = section.sectionStatus
                        const sectionLabel =
                          typeof section.order_index === "number"
                            ? section.order_index + 1
                            : "?"
                        const summary = deriveSectionScoreSummary(section)
                        const practiceExercises = section.practiceExercises ?? []
                        const totalPracticeQuestions = practiceExercises.reduce(
                          (sum, exercise) => sum + (exercise.questionCount ?? 0),
                          0,
                        )
                        const totalPracticeCorrect = practiceExercises.reduce(
                          (sum, exercise) => sum + (exercise.correctQuestionCount ?? 0),
                          0,
                        )
                        const totalPracticeScorePercent =
                          totalPracticeQuestions > 0
                            ? Math.round(
                                (totalPracticeCorrect / totalPracticeQuestions) * 100,
                              )
                            : null
                        const practicePassed =
                          typeof totalPracticeScorePercent === "number"
                            ? totalPracticeScorePercent >= 80
                            : false
                        const adaptiveAttempted = (section.adaptiveSessions ?? []).reduce(
                          (sum, session) => sum + (session.answeredQuestions ?? 0),
                          0,
                        )
                        const practiceAttempts = practiceExercises.reduce(
                          (sum, exercise) => sum + (exercise.attemptedQuestions ?? 0),
                          0,
                        )
                        return (
                          <tr key={section.id} className="border-b border-slate-100">
                            <td className="px-3 py-3 align-top">
                              <p className="text-sm font-semibold text-slate-900">
                                {section.title ?? "Untitled section"}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                Section {sectionLabel}
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="flex items-center gap-1">
                                Quiz: 
                                <SectionStatusIcon
                                  label="Adaptive quiz status"
                                  completed={status?.adaptiveCompleted}
                                />
                                Exercise:
                                <SectionStatusIcon
                                  label="Exercise completion status"
                                  completed={status?.exerciseSatisfied}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              {summary.scorePercent !== null ? (
                                <p className="text-2xl font-semibold text-slate-900">
                                  {summary.scorePercent}%
                                </p>
                              ) : (
                                <p className="text-xs text-slate-500">No score yet</p>
                              )}
                              <p className={`mt-1 text-[10px] font-semibold ${summary.strengthTone}`}>
                                {summary.strength}
                              </p>
                            </td>
                            <td className="px-3 py-3 align-top text-[12px] text-slate-700">
                              {summary.totalAttempted > 0 ? (
                                <>
                                  <p className="font-semibold text-slate-900">
                                    {summary.totalCorrect}/{summary.totalAttempted} correct
                                  </p>
                                  <p>
                                    Quiz: {adaptiveAttempted} | Exercise: {practiceAttempts}
                                  </p>
                                  {/* {totalPracticeQuestions > 0 && (
                                    <p className="text-[10px] text-slate-500">
                                      Practice score: {totalPracticeScorePercent ?? 0}% -
                                      {practicePassed ? " Passed" : " Needs practice"}
                                    </p>
                                  )} */}
                                </>
                              ) : (
                                <p className="text-slate-500">No attempts recorded yet</p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                {activeModule?.id
                  ? "Section progress will appear once attempts sync for this module."
                  : "Module sections will appear once data syncs for the selected subject."}
              </p>
            )}
          </div>
            {/* {topicCompletion.length > 0 ? (
              <div className="space-y-4">
                  {topicCompletion.map((topic) => {
                    const topicPercent = topic.total
                      ? Math.max(0, Math.min(100, (topic.completed / topic.total) * 100))
                      : 0
                    return (
                      <div key={topic.topic} className="rounded-2xl border border-slate-100 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{topic.topic}</p>
                            <p className="text-xs text-slate-500">
                              {topic.completed}/{topic.total} modules complete
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-slate-500">{topic.confidence}</span>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                            style={{ width: `${topicPercent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
                  Topic progress for this subject will appear here once modules are unlocked.
                </p>
              )} */}
            </div>
            {/* <div className="mt-6 grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Test scores</p>
                <div className="mt-2 space-y-2">
                  {testScores.length > 0 ? (
                    testScores.map((test) => (
                      <div key={test.name} className="flex items-center justify-between">
                        <p className="font-semibold text-slate-800">{test.name}</p>
                        <div className="text-xs text-slate-500">
                          {test.score} <span className="text-emerald-600">{test.trend}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No test scores recorded yet.</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Assignment status</p>
                <div className="mt-2 space-y-2">
                  {assignmentStatus.length > 0 ? (
                    assignmentStatus.map((assignment) => (
                      <div key={assignment.title} className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{assignment.title}</p>
                          <p className="text-xs text-slate-500">{assignment.detail}</p>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600">{assignment.status}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Assignment progress will appear once available.</p>
                  )}
                </div>
              </div>
            </div> */}
          </article>
        </section>

        <section className="grid gap-6">
          <ParentDailyStreakCalendar
            attendance={attendance}
            childId={hasLinkedChildren ? selectedChildId : undefined}
          />
        </section>

        {/* <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Performance insights</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <InsightCard title="Strengths" items={strengthLabels} accent="from-emerald-400 to-teal-500" />
                <InsightCard title="Focus areas" items={improvementLabels} accent="from-amber-400 to-orange-500" />
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-wide text-slate-500">Teacher remarks</p>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {teacherRemarkTexts.map((remark) => (
                    <li key={remark}>{remark}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-slate-200/80 bg-slate-900/80 p-5 text-white shadow-inner">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Attendance</h3>
                <span className="text-sm text-slate-200">Monthly</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-emerald-300">{attendance.today}</p>
              <p className="text-sm text-slate-200">Today’s status</p>
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
                  <span>Monthly present</span>
                  <span>{attendance.monthlyPercent}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${attendance.monthlyPercent}%` }} />
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                {attendance.summary.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-slate-200">
                    <p>{item.label}</p>
                    <p className="font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section> */}

        {/* <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Teacher communication</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live channel</span>
            </div>
            <div className="mt-4 space-y-4">
              {teacherList.map((teacher) => (
                <div key={teacher.name} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-indigo-600" />
                      <div>
                        <p className="font-semibold text-slate-900">{teacher.name}</p>
                        <p className="text-xs text-slate-500">{teacher.subject}</p>
                      </div>
                    </div>
                    <button className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600">See updates</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{teacher.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm">
              {communications.map((note) => (
                <div key={note.title} className="space-y-1 border-b border-slate-200/70 pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-slate-900">{note.title}</p>
                  <p className="text-xs text-slate-500">{note.detail}</p>
                  <p className="text-xs font-semibold text-indigo-600">{note.time}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Notifications</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">School & exams</span>
            </div>
            <div className="mt-5 space-y-4">
              {notificationList.map((note) => (
                <div key={note.title} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                    <span>{note.category}</span>
                    <span className="text-indigo-600">New</span>
                  </div>
                  <p className="mt-2 font-semibold text-slate-900">{note.title}</p>
                  <p className="text-xs text-slate-500">{note.detail}</p>
                </div>
              ))}
            </div>
          </article>
        </section> */}
      </div>
    </div>
  )
}

function ParentMenuCard({ section }: { section: ParentMenuSection }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${section.accent} text-white shadow-md`}>
          <section.icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tap the card to explore</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        {section.items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <CircleCheck className="h-3 w-3 text-indigo-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {section.href && (
        <div className="mt-5 flex justify-end">
          <a
            href={section.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex bg-gradient-to-r items-center gap-1 rounded-full border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            View
          </a>
        </div>
      )}
    </div>
  )
}

function InsightCard({
  title,
  items,
  accent,
}: {
  title: string
  items: string[]
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${accent} text-white flex items-center justify-center font-bold`}>{title[0]}</div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performance insight</p>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="font-semibold text-slate-900">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ParentChildSummaryCard({
  summary,
  loading,
  error,
  fallbackName,
  fallbackAssignedCourseCount,
}: {
  summary: ChildSummary | null
  loading: boolean
  error: string | null
  fallbackName: string
  fallbackAssignedCourseCount: number
}) {
  if (loading) {
    return (
      <article className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 rounded-full bg-slate-200/80 animate-pulse" />
              <div className="h-3 w-20 rounded-full bg-slate-200/80 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <span className="h-6 w-16 rounded-full bg-slate-200/80 animate-pulse" />
              <span className="h-6 w-16 rounded-full bg-slate-200/80 animate-pulse" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-2 rounded-full bg-slate-100 animate-pulse" />
          </div>
        </div>
      </article>
    )
  }

  const displaySummary: ChildSummary = summary ?? {
    name: fallbackName || "Student",
    xp: 0,
    level: 1,
    levelProgressPercent: 0,
    tier: "Bronze",
    role: "student",
    rank: null,
    assignedCourseCount: Math.max(0, fallbackAssignedCourseCount),
    currentStreak: 0,
    longestStreak: 0,
  }

  const progress = Math.max(
    0,
    Math.min(100, displaySummary.levelProgressPercent ?? 0),
  )

  return (
    <article className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Student summary
          </p>
          <h2 className="text-2xl font-bold text-slate-900">
            {displaySummary.name}
          </h2>
          <p className="text-sm text-slate-500 capitalize">
            {displaySummary.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase text-slate-600">
            {displaySummary.tier} Tier
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {displaySummary.rank ? `Rank #${displaySummary.rank}` : "Unranked"}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">XP</p>
          <p className="text-2xl font-semibold text-slate-900">
            {displaySummary.xp.toLocaleString()}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Level</p>
          <p className="text-2xl font-semibold text-slate-900">
            {displaySummary.level}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            Assigned courses
          </p>
          <p className="text-2xl font-semibold text-slate-900">
            {Math.max(0, displaySummary.assignedCourseCount)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Current streak</p>
          <p className="text-2xl font-semibold text-slate-900">
            {Math.max(0, displaySummary.currentStreak)} day
            {Math.abs(displaySummary.currentStreak) === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.1em] text-slate-400">
          <span>Level progress</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Current streak</p>
          <p className="text-2xl font-semibold text-slate-900">
            {Math.max(0, displaySummary.currentStreak)} day
            {Math.abs(displaySummary.currentStreak) === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Longest streak</p>
          <p className="text-2xl font-semibold text-slate-900">
            {Math.max(0, displaySummary.longestStreak)} day
            {Math.abs(displaySummary.longestStreak) === 1 ? "" : "s"}
          </p>
        </div>
      </div> */}

      {error && (
        <p className="mt-4 text-xs text-rose-500">{error}</p>
      )}
    </article>
  )
}

function ParentDailyStreakCalendar({
  attendance,
  childId,
}: {
  attendance: ChildAttendance
  childId?: string
}) {
  const [streakPayload, setStreakPayload] = useState<ParentStreakPayload | null>(null)
  const [isLoadingStreak, setIsLoadingStreak] = useState(true)
  const [streakError, setStreakError] = useState<string | null>(null)
  const [monthOffset, setMonthOffset] = useState(0)
  const todayUtc = useMemo(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }, [childId])
  const todayIso = todayUtc.toISOString().slice(0, 10)
  const yesterdayIso = new Date(todayUtc.getTime() - MS_IN_DAY).toISOString().slice(0, 10)

  useEffect(() => {
    let active = true
    const loadStreakData = async () => {
      if (!childId) {
        setStreakError(null)
        setStreakPayload(null)
        if (active) {
          setIsLoadingStreak(false)
        }
        return
      }

      try {
        setIsLoadingStreak(true)
        setStreakError(null)
        setStreakPayload(null)
        const query = `?child_id=${encodeURIComponent(childId)}`
        const response = await fetch(`/api/parent/streak${query}`)
        if (!response.ok) {
          const text = await response.text()
          const message = text || "Unable to load streak data"
          setStreakError(message)
          return
        }
        const payload = (await response.json()) as ParentStreakPayload
        if (!active) return
        setStreakPayload(payload)
      } catch (error) {
        if (!active) return
        console.error("Failed to load parent streak data", error)
        setStreakError("Unable to load streak data")
      } finally {
        if (active) {
          setIsLoadingStreak(false)
        }
      }
    }

    loadStreakData()
    return () => {
      active = false
    }
  }, [childId])

  const fallbackCalendar = useMemo(() => {
    const streakDaysFromStats = streakPayload?.stats?.streakDays
    if (typeof streakDaysFromStats === "number" && Number.isFinite(streakDaysFromStats)) {
      return generateFallbackStreakCalendar(streakDaysFromStats)
    }
    return buildAttendanceStreakCalendar(attendance.calendarOverrides ?? {}, todayIso)
  }, [streakPayload?.stats?.streakDays, attendance.calendarOverrides, todayIso])
  const calendarEntries = streakPayload?.streakCalendar?.length ? streakPayload.streakCalendar : fallbackCalendar
  const xp = streakPayload?.stats?.xp ?? 0
  const tier = streakPayload?.stats?.tier
  const streakDaysFromStats = streakPayload?.stats?.streakDays ?? 0
  const presenceMap = useMemo(
    () => buildPresenceMapFromCalendar(calendarEntries, todayUtc),
    [calendarEntries, todayUtc],
  )
  const derivedStreakDays = useMemo(
    () => calculateStreakDaysFromPresenceMap(presenceMap, todayIso),
    [presenceMap, todayIso],
  )
  const streakDays = Math.max(streakDaysFromStats, derivedStreakDays)
  const visibleMonthDate = useMemo(() => {
    const base = new Date(todayUtc)
    base.setUTCDate(1)
    base.setUTCMonth(base.getUTCMonth() + monthOffset)
    return base
  }, [todayUtc, monthOffset])
  const visibleMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(DATE_LOCALE, {
        month: "long",
        year: "numeric",
        timeZone: DATE_TIMEZONE,
      }).format(visibleMonthDate),
    [visibleMonthDate],
  )
  const freezeAllowance = getFreezeAllowanceForTier(tier, xp)
  const visibleDays = useMemo(
    () =>
      buildVisibleDays(
        visibleMonthDate,
        presenceMap,
        todayIso,
        todayUtc,
        streakDays,
        freezeAllowance,
      ),
    [presenceMap, todayIso, todayUtc, visibleMonthDate, streakDays, freezeAllowance],
  )
  const goBack = () =>
    setMonthOffset((prev) => Math.max(prev - 1, MIN_MONTH_OFFSET))
  const goForward = () =>
    setMonthOffset((prev) => Math.min(prev + 1, MAX_MONTH_OFFSET))
  const canGoBack = monthOffset > MIN_MONTH_OFFSET
  const canGoForward = monthOffset < MAX_MONTH_OFFSET
  const todayEntry = presenceMap.get(todayIso)
  const yesterdayEntry = presenceMap.get(yesterdayIso)
  const isTodayVisible = visibleDays.some((day) => day.isToday)
  const shouldAnimateToday =
    monthOffset === 0 &&
    isTodayVisible &&
    Boolean(todayEntry?.present) &&
    Boolean(yesterdayEntry?.present)
  const frozenDaysCount = useMemo(
    () => visibleDays.filter((day) => day.isFrozen && !day.isFuture).length,
    [visibleDays],
  )
  const freezeTokensRemaining = Math.max(0, freezeAllowance - frozenDaysCount)
  const freezeIndicatorCount = Number.isFinite(freezeAllowance) ? freezeAllowance : 6
  const freezeBalanceLabel = Number.isFinite(freezeAllowance)
    ? `${freezeTokensRemaining} of ${freezeAllowance} tokens left`
    : "Unlimited streak freeze tokens this month"
  const statusNote =
    streakError
      ? "Showing attendance history while the live streak service is unavailable."
      : !streakPayload?.streakCalendar?.length && !isLoadingStreak
        ? "Using attendance overrides while live data loads."
        : null
  const isLoadingCalendar = isLoadingStreak && !streakPayload

  return (
    <article className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
      {isLoadingCalendar ? (
        <>
          <div className="h-32 animate-pulse rounded-2xl bg-slate-200/70" />
          <p className="mt-3 animate-pulse text-sm text-slate-400">Loading daily streak updates…</p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Flame className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Parent Panel - Streak
                </p>
                <h3 className="text-lg font-bold text-slate-900">Daily Streak Calendar</h3>
              </div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
              {streakDays} day{streakDays === 1 ? "" : "s"} streak
            </div>
          </div>
          {statusNote && <p className="mt-2 text-xs text-slate-500">{statusNote}</p>}
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-slate-500">Status today: {attendance.today}</p>
            <div className="flex items-center gap-2 text-slate-600">
              <button
                type="button"
                onClick={goBack}
                disabled={!canGoBack}
                className="rounded-full border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-slate-900">{visibleMonthLabel}</span>
              <button
                type="button"
                onClick={goForward}
                disabled={!canGoForward}
                className="rounded-full border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>View up to 6 months back or ahead</span>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/80 to-white px-4 py-3 text-xs text-sky-900 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                  <Snowflake className="h-4 w-4 text-sky-500" />
                  Streak Freeze
                </span>
                <div className="flex items-center gap-1">
                  {Array.from({ length: freezeIndicatorCount }, (_, index) => {
                    const spent = index < frozenDaysCount
                    return (
                      <span
                        key={index}
                        className={`h-4 w-4 rounded-full border ${spent ? "bg-sky-400 border-sky-500" : "bg-white border-sky-200"}`}
                      ></span>
                    )
                  })}
                </div>
                <span className="font-semibold text-sky-700">{freezeBalanceLabel}</span>
              </div>
              <p className="mt-1 text-sky-700">
                Snowy days mark auto-freeze protection - your parent tier includes{" "}
                {Number.isFinite(freezeAllowance) ? freezeAllowance : "unlimited"} token
                {Number.isFinite(freezeAllowance) && freezeAllowance === 1 ? "" : "s"} each month to pause without losing progress.
              </p>
            </div>
          </div>
          <div className="mt-4 -mx-3 sm:mx-0 overflow-x-auto">
            <div className="inline-grid min-w-[520px] grid-cols-7 gap-2 px-3 sm:px-0 sm:min-w-0 sm:w-full sm:gap-3">
              {visibleDays.map((day) => (
                <div
                  key={day.iso}
                  className="text-center flex flex-col items-center gap-1 text-[10px] sm:text-xs"
                >
                  <span
                    className={`font-semibold tracking-wide ${day.isCurrentMonth ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {day.weekday}
                  </span>
                  <div
                    className={`relative w-12 h-14 sm:w-14 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition transform overflow-hidden ${
                      day.isFuture
                        ? "bg-slate-50 border-slate-200 text-slate-400"
                        : day.isPresent
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : day.isFrozen
                        ? "bg-gradient-to-br from-sky-50 via-white to-slate-50 border-sky-200 text-sky-700 shadow-[0_0_12px_rgba(125,211,252,0.35)]"
                        : "bg-rose-50 border-rose-200 text-rose-500"
                    } ${day.isCurrentMonth ? "" : "opacity-60"} ${
                      shouldAnimateToday && day.isToday
                        ? "animate-pulse shadow-lg shadow-emerald-200 scale-105"
                        : ""
                    }`}
                    title={
                      day.isFuture
                        ? "Upcoming"
                        : day.isPresent
                        ? "Completed"
                        : day.isFrozen
                        ? "Frozen rest day"
                        : "Missed"
                    }
                  >
                    {day.isFrozen && (
                      <>
                        <Snowflake className="absolute left-1 top-1 h-3 w-3 text-sky-400 opacity-70" />
                        <Snowflake className="absolute right-1 bottom-1 h-3 w-3 text-sky-300 opacity-60" />
                      </>
                    )}
                    <span className="text-[10px] sm:text-[11px] font-semibold">
                      {day.monthLabel}
                    </span>
                    <span className="text-base sm:text-lg font-bold leading-none">
                      {day.dayNumber}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400"></span>
              Present
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-rose-400"></span>
              Missed
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-sky-400"></span>
              Frozen rest day
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-slate-300"></span>
              Upcoming
            </div>
          </div>
        </>
      )}
    </article>
  )
}

type SectionStatusIconProps = {
  label: string
  completed?: boolean | null
}

function SectionStatusIcon({ label, completed }: SectionStatusIconProps) {
  const Icon = completed ? CircleCheck : Clock3
  const tone = completed ? "text-emerald-500" : "text-amber-400"
  return (
    <span className="flex flex-col items-center">
      <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
      <span className="sr-only">{label} {completed ? "done" : "pending"}</span>
    </span>
  )
}

function buildAttendanceStreakCalendar(
  overrides: Record<string, AttendanceStatusOverride>,
  todayIso: string,
): StreakCalendarEntry[] {
  return Object.entries(overrides).map(([iso, status]) => ({
    date: iso,
    present: status !== "Absent",
    isFuture: iso > todayIso,
  }))
}

function generateFallbackStreakCalendar(
  presentDays: number,
  monthsBefore = MONTH_WINDOW,
  monthsAfter = MONTH_WINDOW,
) {
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - monthsBefore, 1))
  const end = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + monthsAfter + 1, 0))
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_IN_DAY) + 1
  const todayIndex = Math.round((todayUtc.getTime() - start.getTime()) / MS_IN_DAY)
  const earliestPresentIndex = Math.max(0, todayIndex - Math.min(presentDays, totalDays) + 1)

  return Array.from({ length: totalDays }).map((_, index) => {
    const date = new Date(start.getTime() + index * MS_IN_DAY)
    const iso = date.toISOString().slice(0, 10)
    const isFuture = index > todayIndex
    const present = !isFuture && index >= earliestPresentIndex && index <= todayIndex
    return { date: iso, present, isFuture }
  })
}

function buildPresenceMapFromCalendar(
  calendar: StreakCalendarEntry[],
  todayUtc: Date,
) {
  const todayIso = todayUtc.toISOString().slice(0, 10)
  const map = new Map<string, { present: boolean; isFuture: boolean }>()
  calendar.forEach((entry) => {
    if (!entry?.date) return
    const iso = entry.date.slice(0, 10)
    map.set(iso, {
      present: Boolean(entry.present),
      isFuture: Boolean(entry.isFuture),
    })
  })
  map.set(todayIso, map.get(todayIso) ?? { present: true, isFuture: false })
  return map
}

function calculateStreakDaysFromPresenceMap(
  presenceMap: Map<string, { present: boolean; isFuture: boolean }>,
  todayIso: string,
) {
  const todayDate = new Date(todayIso)
  const baseTime = Date.UTC(
    todayDate.getUTCFullYear(),
    todayDate.getUTCMonth(),
    todayDate.getUTCDate(),
  )
  let streak = 0
  for (let offset = 0; offset < 365; offset += 1) {
    const cursorIso = new Date(baseTime - offset * MS_IN_DAY).toISOString().slice(0, 10)
    const entry = presenceMap.get(cursorIso)
    const isFuture = entry?.isFuture ?? cursorIso > todayIso
    if (isFuture) {
      continue
    }
    const present = entry?.present ?? true
    if (!present) break
    streak += 1
  }
  return streak
}

function buildVisibleDays(
  visibleMonthDate: Date,
  presenceMap: Map<string, { present: boolean; isFuture: boolean }>,
  todayIso: string,
  todayUtc: Date,
  streakDays: number,
  freezeTokenAllowance: number,
): VisibleDay[] {
  const startOfMonth = new Date(visibleMonthDate)
  const endOfMonth = new Date(
    Date.UTC(
      startOfMonth.getUTCFullYear(),
      startOfMonth.getUTCMonth() + 1,
      0,
    ),
  )
  const startOfCalendar = getStartOfWeek(startOfMonth)
  const endOfCalendar = getEndOfWeek(endOfMonth)
  const days: VisibleDay[] = []
  for (
    let ts = startOfCalendar.getTime();
    ts <= endOfCalendar.getTime();
    ts += MS_IN_DAY
  ) {
    const dateObject = new Date(ts)
    const iso = dateObject.toISOString().slice(0, 10)
    const entry = presenceMap.get(iso)
    const isFuture = entry?.isFuture ?? iso > todayIso
    const weekday = dateObject
      .toLocaleDateString(DATE_LOCALE, {
        weekday: "short",
        timeZone: DATE_TIMEZONE,
      })
      .replace(".", "")
      .slice(0, 3)
      .toUpperCase()
    const monthLabel = dateObject.toLocaleDateString(DATE_LOCALE, {
      month: "short",
      timeZone: DATE_TIMEZONE,
    })
    days.push({
      iso,
      weekday,
      monthLabel,
      dayNumber: dateObject.getUTCDate(),
      isPresent: Boolean(entry?.present) && !isFuture,
      isFuture,
      isToday: iso === todayIso,
      isCurrentMonth: dateObject.getUTCMonth() === visibleMonthDate.getUTCMonth(),
    })
  }
  let remainingFreezes = Number.isFinite(freezeTokenAllowance)
    ? Math.max(0, freezeTokenAllowance)
    : Math.max(0, streakDays)
  let streakCoverage = 0
  for (let i = days.length - 1; i >= 0 && streakCoverage < streakDays; i -= 1) {
    const day = days[i]
    if (day.isFuture) continue
    const dayDate = new Date(day.iso)
    if (dayDate > todayUtc) continue
    if (day.isPresent) {
      streakCoverage += 1
      continue
    }
    if (remainingFreezes > 0) {
      day.isFrozen = true
      remainingFreezes -= 1
      streakCoverage += 1
      continue
    }
    break
  }
  return days
}

function getStartOfWeek(date: Date) {
  const clone = new Date(date)
  clone.setUTCHours(0, 0, 0, 0)
  const day = clone.getUTCDay()
  const diff = (day + 6) % 7
  clone.setUTCDate(clone.getUTCDate() - diff)
  return clone
}

function getEndOfWeek(date: Date) {
  const start = getStartOfWeek(date)
  const clone = new Date(start)
  clone.setUTCDate(clone.getUTCDate() + 6)
  return clone
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm font-semibold text-slate-800 ${valueClass ?? ""}`}>{value}</dd>
    </div>
  )
}
