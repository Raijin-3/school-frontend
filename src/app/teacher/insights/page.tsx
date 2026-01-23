import Link from "next/link"
import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"

export const metadata = { title: "Performance & Insights | Jarvis" }

type ClassRow = {
  id: string
  name?: string | null
}

type SectionInsight = {
  section_id: string
  section_title: string
  adaptive_quiz_percent: number | null
  exercise_percent: number | null
  overall_average: number | null
  student_count: number
}

type InsightsResponse = {
  class_id: string | null
  sections: SectionInsight[]
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
  summary: {
    total_hints_used: number
    total_students: number
    adaptive_sessions_completed: number
    section_exercises_completed: number
    average_score: number | null
    sections_tracked: number
  }
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams?: Promise<{ classId?: string }>
}) {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  const classes = await apiGet<ClassRow[]>("/v1/classes").catch(() => [])
  const resolvedParams = await searchParams
  const selectedClassId = resolvedParams?.classId || classes[0]?.id || ""
  const selectedClassName =
    classes.find((item) => item.id === selectedClassId)?.name || "Class"

  const insights = selectedClassId
    ? await apiGet<InsightsResponse>(`/v1/teacher/insights?class_id=${selectedClassId}`).catch(
        () => ({
          class_id: selectedClassId,
          sections: [],
          top_performer: null,
          needs_improvement: null,
          trend: [],
          summary: {
            total_hints_used: 0,
            total_students: 0,
            adaptive_sessions_completed: 0,
            section_exercises_completed: 0,
            average_score: null,
            sections_tracked: 0,
          },
        }),
      )
    : {
        class_id: null,
        sections: [],
        top_performer: null,
        needs_improvement: null,
        trend: [],
        summary: {
          total_hints_used: 0,
          total_students: 0,
          adaptive_sessions_completed: 0,
          section_exercises_completed: 0,
          average_score: null,
          sections_tracked: 0,
        },
      }

  const summaryCards = [
    { label: "Total hints used", value: insights.summary.total_hints_used },
    { label: "Total students", value: insights.summary.total_students },
    { label: "Adaptive sessions completed", value: insights.summary.adaptive_sessions_completed },
    { label: "Section exercises completed", value: insights.summary.section_exercises_completed },
    {
      label: "Average score",
      value: insights.summary.average_score === null ? "--" : `${insights.summary.average_score}%`,
    },
    { label: "Sections tracked", value: insights.summary.sections_tracked },
  ]


  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            Performance & Insights
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Performance & Insights</h1>
          <p className="mt-1 text-sm text-slate-600">
            Section-level performance across adaptive quizzes and exercises.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {selectedClassName}
          </div>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">{card.value}</div>
            </div>
          ))}
        </div>

        {classes.length > 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Class</span>
            {classes.map((item) => {
              const isActive = item.id === selectedClassId
              return (
                <Link
                  key={item.id}
                  href={`/teacher/insights?classId=${item.id}`}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.name || "Class"}
                </Link>
              )
            })}
          </div>
        )}

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Section performance</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Adaptive quiz and exercise averages with a combined score.
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                Completed work only
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-5 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Section</span>
                <span>Adaptive quiz</span>
                <span>Exercise</span>
                <span>Students</span>
                <span>Overall avg</span>
              </div>
              <div className="divide-y divide-slate-200">
                {insights.sections.length === 0 && (
                  <div className="px-4 py-6 text-sm text-slate-500">
                    No completed activity yet for this class.
                  </div>
                )}
                {insights.sections.map((section) => (
                  <div key={section.section_id} className="grid grid-cols-5 items-center px-4 py-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">{section.section_title}</div>
                    <div>
                      {section.adaptive_quiz_percent === null ? "—" : `${section.adaptive_quiz_percent}%`}
                    </div>
                    <div>
                      {section.exercise_percent === null ? "—" : `${section.exercise_percent}%`}
                    </div>
                    <div>{section.student_count}</div>
                    <div className="font-semibold text-slate-900">
                      {section.overall_average === null ? "—" : `${section.overall_average}%`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top performer</div>
              {insights.top_performer ? (
                <div className="mt-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {insights.top_performer.student_name}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Overall avg: {insights.top_performer.overall_average ?? "—"}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Adaptive: {insights.top_performer.adaptive_quiz_percent ?? "—"}% · Exercise:{" "}
                    {insights.top_performer.exercise_percent ?? "—"}%
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">No data yet.</div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs improvement</div>
              {insights.needs_improvement ? (
                <div className="mt-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {insights.needs_improvement.student_name}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Overall avg: {insights.needs_improvement.overall_average ?? "—"}%
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Adaptive: {insights.needs_improvement.adaptive_quiz_percent ?? "—"}% · Exercise:{" "}
                    {insights.needs_improvement.exercise_percent ?? "—"}%
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">No data yet.</div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
