import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { LessonWizard } from "@/components/teacher/lesson-wizard"

export const metadata = { title: "Homework & Assignment | Jarvis" }

type LessonAssignmentRow = {
  id: string
  status: string
  assigned_at?: string | null
  due_at?: string | null
  classes?: { name?: string | null } | null
  modules?: { title?: string | null } | null
  sections?: { title?: string | null } | null
  section_topics?: { topic_name?: string | null } | null
  lesson_assignment_students?: Array<{ count?: number | null }> | { count?: number | null } | null
}

function getAssignedCount(row: LessonAssignmentRow): number {
  if (Array.isArray(row.lesson_assignment_students)) {
    return row.lesson_assignment_students[0]?.count ?? 0
  }
  return row.lesson_assignment_students?.count ?? 0
}

function getLessonTitle(row: LessonAssignmentRow): string {
  return (
    row.section_topics?.topic_name ||
    row.sections?.title ||
    row.modules?.title ||
    "Lesson"
  )
}

function formatDueLabel(dueAt?: string | null): string {
  if (!dueAt) return "No due date"
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return "No due date"
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

function formatCreatedLabel(assignedAt?: string | null): string {
  if (!assignedAt) return "Unknown date"
  const date = new Date(assignedAt)
  if (Number.isNaN(date.getTime())) return "Unknown date"
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default async function HomeworkPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  const assignments = await apiGet<LessonAssignmentRow[]>("/v1/lesson-assignments").catch(() => [])

  const lessonRollup = assignments.slice(0, 6).map((row) => ({
    id: row.id,
    title: getLessonTitle(row),
    students: getAssignedCount(row),
    status: row.status || "assigned",
    due: formatDueLabel(row.due_at),
  }))

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            Homework & Assignment
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Homework & Assignment</h1>
          <p className="mt-1 text-sm text-slate-600">
            Build lessons and track how many students have been assigned so far.
          </p>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Lesson rollup</h2>
                  <p className="mt-1 text-sm text-slate-600">Recent lesson plans with status and due dates.</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  All lessons
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {lessonRollup.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>{item.students} students assigned</span>
                      <span>{item.due}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <LessonWizard />
            </div>
          </section>
        </div>

      </div>
    </div>
  )
}
