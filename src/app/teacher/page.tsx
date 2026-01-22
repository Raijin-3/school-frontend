import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { LessonWizard } from "@/components/teacher/lesson-wizard"

export const metadata = { title: "Teacher | Jarvis" }

export default async function TeacherPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  // Ensure onboarding complete and correct role
  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  const displayName = user?.email?.split("@")[0] ?? "Teacher"
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const lessonSummary = [
    { label: "Lessons created", value: "12", detail: "3 this week" },
    { label: "Classes assigned", value: "4", detail: "112 students" },
    { label: "Avg. score", value: "78%", detail: "Across all subjects" },
    { label: "Questions attempted", value: "1,284", detail: "Last 30 days" },
  ]

  const performanceRows = [
    { label: "Statistics", detail: "Subject average 82%", progress: 82 },
    { label: "Regression", detail: "Module average 74%", progress: 74 },
    { label: "Hypothesis Tests", detail: "Section average 69%", progress: 69 },
  ]

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_100%_-10%,rgba(15,23,42,.08),transparent),radial-gradient(500px_240px_at_-10%_120%,rgba(16,185,129,.12),transparent)]" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Teacher Dashboard
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-900">
                Good morning,{" "}
                <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                  {displayName}
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Today is {todayLabel}. Build your next lesson to get started.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <LessonWizard />
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Lesson overview</h2>
              <div className="mt-4 space-y-3">
                {lessonSummary.map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-900">{item.value}</div>
                    <div className="text-xs text-slate-600">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Student performance</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Subject, module, and section averages across active classes.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  Last 30 days
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {performanceRows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span>{row.label}</span>
                      <span>{row.progress}%</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{row.detail}</div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                        style={{ width: `${row.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Engagement snapshot</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Sessions completed</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">36</div>
                  <div className="text-xs text-slate-600">+8 vs last month</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Questions attempted</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">1,284</div>
                  <div className="text-xs text-slate-600">Avg 32 per student</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Active learners</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900">88</div>
                  <div className="text-xs text-slate-600">Across 4 classes</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

