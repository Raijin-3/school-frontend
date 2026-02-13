import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { TeacherDashboardCards } from "@/components/teacher/teacher-dashboard-cards"

export const metadata = { title: "Teacher | Jarvis" }

const cards = [
  {
    title: "Teacher co-pilot",
    description: "Plan lessons, outlines, and lecture flows.",
    href: "/teacher/lecture-planning",
    icon: "book",
    accent: "from-sky-500 to-emerald-500",
  },
  {
    title: "Homework & Assignment",
    description: "Create lessons and track assignment coverage.",
    href: "/teacher/homework",
    icon: "clipboard",
    accent: "from-emerald-500 to-lime-500",
  },
  {
    title: "Class Insight",
    description: "See class mastery, AI engagement, and suggested actions in one view.",
    href: "/teacher/class-insight",
    icon: "chart",
    accent: "from-amber-500 to-rose-500",
  },
]

export default async function TeacherPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  const displayName = user?.email?.split("@")[0] ?? "Teacher"
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-7xl p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_100%_-10%,rgba(15,23,42,.08),transparent),radial-gradient(500px_240px_at_-10%_120%,rgba(16,185,129,.12),transparent)]" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              Teacher Dashboard
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">
              Welcome back,{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">
                {displayName}
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Today is {todayLabel}. Choose where you want to start.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <TeacherDashboardCards cards={cards} />
        </div>
      </div>
    </div>
  )
}

