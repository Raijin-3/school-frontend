"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PieChart, Star, Target } from "lucide-react"

import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

export default function AcademicProgressPage() {
  const { childData } = useParentDashboardContext()
  const { subjectDetails, learningSignals } = childData
  const [activeSubject, setActiveSubject] = useState(subjectDetails[0])
  const topicSectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setActiveSubject(subjectDetails[0])
  }, [subjectDetails])

  const topics = useMemo(() => activeSubject?.topics ?? [], [activeSubject])
  const tests = useMemo(() => activeSubject?.tests ?? [], [activeSubject])
  const assignments = useMemo(() => activeSubject?.assignments ?? [], [activeSubject])
  const monthLabel = `${activeSubject?.subject ?? "Subject"} overview`
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

        <section ref={topicSectionRef} className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Topic completion • {monthLabel}</h3>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Focus ready</span>
            </div>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              {topics.map((topic) => (
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
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${(topic.completed / topic.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Test scores • {monthLabel}</h3>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rolling 2 weeks</span>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              {tests.map((test) => (
                <div key={test.name} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{test.name}</p>
                    <p className="text-xs text-slate-500">{test.trend}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{test.score}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{test.percentile}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
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
        </section>

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
