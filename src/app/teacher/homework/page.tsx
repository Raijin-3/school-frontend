import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { TeacherHomeworkDashboard } from "@/components/teacher/homework-dashboard"

export const metadata = { title: "Homework & Assignment | Jarvis" }

export default async function HomeworkPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

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

        <TeacherHomeworkDashboard />
      </div>
    </div>
  )
}
