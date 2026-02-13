import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { LecturePlanningShell } from "@/components/teacher/lecture-planning-shell"

export const metadata = { title: "Lecture Planning | Jarvis" }

export default async function LecturePlanningPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")
  const displayName =
    user?.email?.split("@")[0] ?? profile?.full_name ?? "Teacher"

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <LecturePlanningShell displayName={displayName} />
      </div>
    </div>
  )
}
