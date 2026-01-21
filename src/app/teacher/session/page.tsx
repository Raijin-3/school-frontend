import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import Link from "next/link"
import { Activity, CheckCircle2, ClipboardList, ShieldCheck, Terminal, Users2 } from "lucide-react"

export const metadata = { title: "Session | Jarvis" }

type TeacherSessionPageProps = {
  searchParams?: {
    sessionId?: string
  }
}

export default async function TeacherSessionPage({ searchParams }: TeacherSessionPageProps) {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  const role = String(profile?.role ?? "").toLowerCase()
  if (role !== "teacher" && role !== "admin") redirect("/dashboard")

  const sessionId = searchParams?.sessionId ?? "CLS-DEMO01"

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-emerald-50/40">
      <div className="mx-auto max-w-screen-lg p-4 md:p-6">
        <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <Activity className="h-3.5 w-3.5 text-emerald-600" />
              Session Live
            </div>
            <Link
              href="/teacher"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back to Teacher Dashboard
            </Link>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Classroom AI Session</h1>
          <p className="mt-1 text-sm text-slate-600">
            Share the session code with students and keep this screen open during class.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-xs font-semibold text-slate-500">Lesson</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">Fractions - Equivalent Fractions</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-xs font-semibold text-slate-500">Session ID</div>
              <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{sessionId}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-xs font-semibold text-slate-500">Students Joined</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">28</div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-1 h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-sm font-semibold text-emerald-900">System response</div>
                <div className="mt-2 space-y-2 text-sm text-emerald-900/90">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-emerald-600" />
                    Session ID created
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Scope locked
                  </div>
                  <div className="flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-emerald-600" />
                    Student access enabled only for this session
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Replay system messages
            </div>
            <p className="mt-1 text-xs text-slate-600">
              This list shows what the system confirmed at launch. Use it to verify the session state.
            </p>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Session ID created at 09:02 AM
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Scope locked to lesson objectives
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                Student access enabled for this session only
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
