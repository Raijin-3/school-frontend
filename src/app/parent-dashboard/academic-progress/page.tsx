"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PieChart, Star, Target } from "lucide-react"

import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"
import { ModuleSectionAttempt, deriveSectionScoreSummary } from "@/lib/module-section"

export default function AcademicProgressPage() {
  const { childData, selectedChildId } = useParentDashboardContext()
  const { subjectDetails, learningSignals } = childData
  const [activeSubject, setActiveSubject] = useState(subjectDetails[0])
  const topicSectionRef = useRef<HTMLDivElement | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(
    subjectDetails[0]?.modules?.[0]?.id ?? null,
  )
  const [moduleSectionsCache, setModuleSectionsCache] = useState<Record<string, ModuleSectionAttempt[]>>({})
  const [moduleSectionsLoading, setModuleSectionsLoading] = useState(false)
  const [moduleSectionsError, setModuleSectionsError] = useState<string | null>(null)

  useEffect(() => {
    setActiveSubject(subjectDetails[0])
  }, [subjectDetails])

  useEffect(() => {
    const firstModuleId = activeSubject?.modules?.[0]?.id ?? null
    setSelectedModuleId(firstModuleId)
  }, [activeSubject])

  const topics = useMemo(() => activeSubject?.topics ?? [], [activeSubject])
  const tests = useMemo(() => activeSubject?.tests ?? [], [activeSubject])
  const assignments = useMemo(() => activeSubject?.assignments ?? [], [activeSubject])
  const monthLabel = `${activeSubject?.subject ?? "Subject"} overview`
  const modules = useMemo(() => activeSubject?.modules ?? [], [activeSubject])
  const activeModule =
    modules.find((module) => module.id === selectedModuleId) ?? modules[0] ?? null
  const activeModuleSections = activeModule?.id
    ? moduleSectionsCache[activeModule.id] ?? []
    : []
 
  useEffect(() => {
    if (!modules.length) {
      setModuleSectionsCache({})
      setModuleSectionsError(null)
      setModuleSectionsLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true
    setModuleSectionsLoading(true)
    setModuleSectionsError(null)
    setModuleSectionsCache({})

    const fetchSectionForModule = async (moduleId: string) => {
      const params = new URLSearchParams({ module_id: moduleId })
      if (selectedChildId) {
        params.set("child_id", selectedChildId)
      }
      const response = await fetch(`/api/parent/module-sections?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText)
        throw new Error(message || "Failed to load sections")
      }
      return (await response.json()) as ModuleSectionAttempt[]
    }

    const load = async () => {
      try {
        await Promise.all(
          modules.map(async (module) => {
            if (!module?.id) return
            const payload = await fetchSectionForModule(module.id)
            if (!active) return
            setModuleSectionsCache((prev) => ({
              ...prev,
              [module.id]: payload,
            }))
          }),
        )
      } catch (error) {
        if (!active) return
        if ((error as any)?.name === "AbortError") {
          return
        }
        console.error("Failed to load module sections", error)
        setModuleSectionsError((error as Error)?.message ?? "Unable to load sections")
      } finally {
        if (active) {
          setModuleSectionsLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [modules, selectedChildId])
  const combinedScore = useMemo(() => {
    if (!subjectDetails?.length) return 0
    const total =
      subjectDetails.reduce((sum, subject) => sum + (typeof subject.completion === "number" ? subject.completion : 0), 0)
    return Math.round(total / subjectDetails.length)
  }, [subjectDetails])
  const overallSubjectScores = useMemo(
    () =>
      subjectDetails.map((subject) => ({
        name: subject.subject,
        score: typeof subject.completion === "number" ? subject.completion : 0,
      })),
    [subjectDetails],
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Academic Progress
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
                Detailed learning metrics for {childData.profile.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Subject-wise completion, topic milestones, and assessment breakdowns are refreshed hourly.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-600">
              Updated Jan 11 • 09:05 AM
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Combined completion</p>
            <p className="text-4xl font-bold text-indigo-600">{combinedScore}%</p>
            <p className="text-xs text-slate-500">Average across all subjects</p>
          </div>
          {overallSubjectScores.map((entry) => (
            <div key={entry.name} className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{entry.name}</p>
              <p className="text-2xl font-bold text-slate-900">{entry.score}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${entry.score}%` }} />
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Subject-wise progress</h2>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live data</span>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {subjectDetails.map((subject) => {
              const isActive = subject.subject === activeSubject?.subject
              return (
                <button
                  key={subject.subject}
                  onClick={() => {
                    setActiveSubject(subject)
                    topicSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                  className={`group flex flex-col rounded-3xl border p-5 shadow-sm transition ${isActive ? "border-indigo-500 bg-white/90 ring-2 ring-indigo-200" : "border-white/70 bg-white/80"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Subject mastery</p>
                      <h3 className="text-xl font-bold text-slate-900">{subject.subject}</h3>
                    </div>
                    <PieChart className="h-7 w-7 text-indigo-500" />
                  </div>
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${subject.completion}%` }} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                      <p>{subject.focus}</p>
                      <span className="font-semibold text-slate-900">{subject.completion}%</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-xs font-semibold uppercase tracking-wide text-indigo-500 opacity-80">
                    {isActive ? "Active subject" : "Tap to view"}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section ref={topicSectionRef} className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs tracking-[0.1em] text-slate-400">Module insight</p>
              <h3 className="text-lg font-bold text-slate-900">
                {activeModule?.title ?? "Select a module"} overview
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {modules.map((module) => {
                const isActive = module.id === activeModule?.id
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setSelectedModuleId(module.id)}
                    className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                      isActive
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {module.title ?? module.id}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-5">
            {moduleSectionsLoading ? (
              <p className="text-xs text-slate-500">Loading section detail…</p>
            ) : moduleSectionsError ? (
              <p className="text-xs text-rose-500">{moduleSectionsError}</p>
            ) : activeModuleSections.length > 0 ? (
              <div className="space-y-3">
                {activeModuleSections.map((section) => {
                  const status = section.sectionStatus
                  const sectionLabel = section.order_index ?? "?"
                  const summary = deriveSectionScoreSummary(section)
                  return (
                    <details
                      key={section.id}
                      className="rounded-2xl border border-slate-100 bg-white/90 p-3 transition hover:border-slate-300"
                    >
                      <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-slate-700">
                        <div>
                          <p>{section.title}</p>
                          <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">
                            Section {sectionLabel} • {status?.adaptiveCompleted ? "Adaptive ready" : "Adaptive pending"}
                          </p>
                        </div>
                        <div className="text-right text-[10px] text-slate-500 space-y-1">
                          <p>Adaptive {status?.adaptiveCompleted ? "Done" : "Pending"}</p>
                          <p>Exercises {status?.exerciseSatisfied ? "Done" : "Pending"}</p>
                        </div>
                      </summary>
                      <div className="mt-3 space-y-3 text-xs text-slate-600">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[12px] uppercase tracking-[0.1em] text-slate-500">
                                Section score
                              </p>
                              {summary.scorePercent !== null ? (
                                <p className="text-2xl font-semibold text-slate-900">
                                  {summary.scorePercent}%
                                </p>
                              ) : (
                                <p className="text-xs text-slate-500">No attempts yet</p>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-emerald-600">
                              {summary.strength}
                            </p>
                          </div>
                          {summary.scorePercent !== null && summary.totalQuestions > 0 ? (
                            <p className="mt-2 text-[11px] text-slate-500">
                              {summary.totalCorrect}/{summary.totalQuestions} correct answers
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                            Adaptive quiz sessions
                          </p>
                          {section.adaptiveSessions && section.adaptiveSessions.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {section.adaptiveSessions.map((session) => {
                                const dateLabel = session.createdAt
                                  ? new Date(session.createdAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "Unknown date"
                                return (
                                  <div
                                    key={session.sessionId}
                                    className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between text-[12px] font-semibold text-slate-900">
                                      <span>{session.mainTopic ?? "Adaptive quiz"}</span>
                                      <span>{session.scorePercent}%</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                      {session.questionCount} questions • {session.correctAnswers} correct
                                    </p>
                                    <p className="text-[11px] text-slate-400">{dateLabel}</p>
                                    <p
                                      className={`text-[11px] font-semibold ${
                                        session.passed ? "text-emerald-600" : "text-rose-500"
                                      }`}
                                    >
                                      {session.passed ? "Passed" : "Needs review"}
                                    </p>
                                  </div>
                                )
                              })}
                              {(() => {
                                const adaptiveSessions = section.adaptiveSessions ?? []
                                const totalQuestions = adaptiveSessions.reduce(
                                  (sum, session) => sum + (session.questionCount ?? 0),
                                  0,
                                )
                                const totalCorrect = adaptiveSessions.reduce(
                                  (sum, session) => sum + (session.correctAnswers ?? 0),
                                  0,
                                )
                                if (totalQuestions === 0) {
                                  return null
                                }
                                const scorePercent = Math.round(
                                  (totalCorrect / totalQuestions) * 100,
                                )
                                const passed = scorePercent >= 70
                                return (
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600">
                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-slate-500">
                                      <span>Total across sessions</span>
                                      <span>Passing ≥ 70%</span>
                                    </div>
                                    <div className="mt-2 flex items-end justify-between gap-4">
                                      <div>
                                        <p className="text-2xl font-semibold text-slate-900">
                                          {totalQuestions} question{totalQuestions === 1 ? "" : "s"}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                          {totalCorrect}/{totalQuestions} correct answers
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs font-semibold text-slate-500">score</p>
                                        <p className="text-2xl font-semibold text-slate-900">{scorePercent}%</p>
                                        <p
                                          className={`mt-1 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold ${
                                            passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                                          }`}
                                        >
                                          {passed ? "Passed" : "Needs review"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              No adaptive quiz sessions recorded for this section yet.
                            </p>
                          )}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                            Practice exercises
                          </p>
                          {section.practiceExercises && section.practiceExercises.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {section.practiceExercises.map((exercise) => {
                                const attemptedQuestion = exercise.attemptedQuestion
                                const questionText = attemptedQuestion?.text
                                const questionStatus = attemptedQuestion?.statusLabel
                                const scoreLabel =
                                  typeof exercise.scorePercent === "number"
                                    ? `${exercise.scorePercent}%`
                                    : null
                                const attemptsLabel = `${exercise.attemptedQuestions}/${exercise.questionCount}`
                                const attemptDetailLabel =
                                  questionText && questionText.length > 0
                                    ? `Question attempt: ${questionText}`
                                    : `Questions attempted: ${attemptsLabel}`
                                const displayStatus =
                                  exercise.displayStatus ??
                                  exercise.status ??
                                  "Status pending"
                                return (
                                  <div
                                    key={exercise.id}
                                    className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-2"
                                  >
                                    <div className="flex items-center justify-between text-[12px] font-semibold text-slate-500">
                                      <span>{exercise.type ?? "Practice"}</span>
                                      <span>{exercise.difficulty ?? "Level"}</span>
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-slate-900">
                                      {exercise.title}
                                    </p>
                                    {exercise.description ? (
                                      <p className="text-[12px] text-slate-500">
                                        {exercise.description}
                                      </p>
                                    ) : null}
                                    {/* <p className="text-[11px] text-slate-500">
                                      {attemptDetailLabel}
                                    </p> */}
                                    <div className="mt-2 flex items-center justify-between text-[12px] text-slate-500">
                                      <span className="font-semibold text-slate-600">
                                        {displayStatus}
                                      </span>
                                      <span>Attempts {attemptsLabel}</span>
                                    </div>
                                    {scoreLabel ? (
                                      <p className="text-[12px] text-slate-500">Score: {scoreLabel}</p>
                                    ) : null}
                                    {exercise.latestVerdict ? (
                                    <p
                                      className={`text-[11px] font-semibold ${
                                        exercise.latestVerdict === "Correct"
                                          ? "text-emerald-600"
                                          : "text-red-600"
                                      }`}
                                    >
                                      Last Question: {exercise.latestVerdict}
                                    </p>
                                  ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-500">
                              Practice exercises will appear once attempts are synced.
                            </p>
                          )}
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Sections will appear here once module progress is synced.
              </p>
            )}
          </div>
        </section>

        {/* <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Assignment status</h3>
            <span className="text-xs uppercase tracking-wider text-slate-500">Track submissions</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {assignments.map((assignment) => (
              <div key={assignment.title} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{assignment.title}</p>
                  <span className="text-xs font-semibold text-slate-600">{assignment.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{assignment.detail}</p>
                <p className="mt-4 text-sm font-semibold text-slate-700">{assignment.score}</p>
              </div>
            ))}
          </div>
        </section> */}

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-500" />
              <h3 className="text-lg font-bold text-slate-900">Next steps</h3>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              {learningSignals.map((signal) => (
                <li key={signal} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  {signal}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-indigo-500 to-slate-900 px-6 py-6 text-white shadow-xl shadow-indigo-500/40">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-300" />
              <h3 className="text-lg font-bold">Highlights</h3>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              <HighlightCard label="Top strengths" detail="Precision in lab observations & accuracy in math" />
              <HighlightCard label="Focus zones" detail="More self-written reflections for English" />
              <HighlightCard label="Upcoming goal" detail="Complete two additional algebra practice sets" />
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}

function HighlightCard({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/10 p-4">
      <p className="text-xs uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{detail}</p>
    </div>
  )
}
