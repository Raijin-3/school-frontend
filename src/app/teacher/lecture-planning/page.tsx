import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"

export const metadata = { title: "Lecture Planning | Jarvis" }

export default async function LecturePlanningPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-5xl p-4 md:p-6">
        <header className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            Lecture Planning
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Lecture Planning</h1>
          <p className="mt-1 text-sm text-slate-600">
            Plan lessons, outlines, and lecture flows for upcoming classes.
          </p>
        </header>

        <div className="mt-10 flex min-h-[50vh] items-center justify-center">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-12 text-center shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coming soon</div>
            <p className="mt-2 text-sm text-slate-600">
              We are preparing lecture planning tools for your next rollout.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
