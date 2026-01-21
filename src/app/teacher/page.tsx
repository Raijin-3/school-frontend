import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import {
  Activity,
  CalendarClock,
  Clock3,
  GraduationCap,
  MapPin,
  MessageSquare,
  PlayCircle,
  Users,
} from "lucide-react"
import { LessonWizard } from "@/components/teacher/lesson-wizard"
import { ActiveSessionView } from "@/components/teacher/active-session-view"
import { CommonQuestionsCard } from "@/components/teacher/common-questions-card"

export const metadata = { title: "Teacher | Jarvis" }

export default async function TeacherPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  // NOTE: Temporarily bypass auth/role checks for UI design work.
  // if (!user) redirect("/login")

  // Ensure onboarding complete and correct role
  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  // if (!profile?.onboarding_completed) redirect("/profile")
  // if ((profile?.role ?? "").toLowerCase() !== "teacher") redirect("/dashboard")

  const data = await apiGet<any>("/v1/dashboard").catch(() => ({
    panels: ["Cohorts", "Assignments", "Progress"],
    user: {
      id: user?.id ?? "teacher",
      displayName: user?.email?.split("@")[0] ?? "Teacher",
    },
  }))
  const panels: string[] = Array.isArray(data?.panels) ? data.panels : ["Cohorts", "Assignments", "Progress"]
  const displayName: string = data?.user?.displayName || (user?.email?.split("@")[0] ?? "Teacher")
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const todaysClasses = [
    { time: "08:30 AM", title: "Data Storytelling", room: "Room 214", cohort: "Grade 10 - Blue", status: "Starting soon" },
    { time: "10:15 AM", title: "Statistics Lab", room: "Lab 3", cohort: "Grade 11 - Gold", status: "In 45 min" },
    { time: "01:00 PM", title: "AI Literacy", room: "Auditorium", cohort: "Grade 9 - Green", status: "After lunch" },
  ]

  const activeSessions = [
    { title: "Regression Practice", cohort: "Grade 11 - Gold", learners: 24, progress: 68, activity: "6 questions left" },
    { title: "Capstone Check-in", cohort: "Grade 10 - Blue", learners: 18, progress: 42, activity: "2 submissions pending" },
  ]

  const insightRows = [
    { label: "Class momentum", value: "Up 12% vs last week" },
    { label: "Top blocker", value: "Confidence intervals" },
    { label: "Suggested focus", value: "Short formative quiz" },
  ]

  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto max-w-screen-2xl p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_100%_-10%,rgba(15,23,42,.08),transparent),radial-gradient(500px_240px_at_-10%_120%,rgba(16,185,129,.12),transparent)]" />
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Teacher Dashboard
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-slate-900">
                Good morning, <span className="bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent">{displayName}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-600">Today is {todayLabel}. Focus on what needs your attention first.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <CalendarClock className="h-4 w-4 text-emerald-600" />
                3 classes today
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <Users className="h-4 w-4 text-sky-600" />
                42 active learners
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Today's Classes</h2>
                  <p className="mt-1 text-sm text-slate-600">Upcoming lessons with quick controls.</p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                  View weekly plan
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {todaysClasses.map((item) => (
                  <div key={item.title} className="flex flex-col gap-4 rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                        <div className="text-xs font-semibold text-slate-500">Time</div>
                        <div className="text-sm font-bold text-slate-900">{item.time}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <GraduationCap className="h-4 w-4 text-emerald-600" />
                          {item.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                            {item.cohort}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-500" />
                            {item.room}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
                        <PlayCircle className="h-4 w-4" />
                        Start
                      </button>
                      <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                        <MessageSquare className="h-4 w-4 text-slate-500" />
                        Message
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <LessonWizard />
          </section>

          <section>
            <ActiveSessionView />
          </section>

          <section>
            <CommonQuestionsCard />
          </section>

          <section className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Active Sessions</h2>
                  <p className="mt-1 text-sm text-slate-600">Live classrooms and real-time progress.</p>
                </div>
                <button className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">
                  View all sessions
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {activeSessions.map((session) => (
                  <div key={session.title} className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <Activity className="h-4 w-4 text-sky-600" />
                          {session.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{session.cohort} - {session.learners} learners</div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1">
                          {session.activity}
                        </span>
                        <button className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800">
                          Join
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Class progress</span>
                        <span>{session.progress}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-gradient-to-r from-sky-500 to-emerald-500" style={{ width: `${session.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <details className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold text-slate-900">
                Insights
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Collapsed</span>
              </summary>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                {insightRows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">{row.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{row.value}</div>
                  </div>
                ))}
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-800">
                  Pro tip: Use a 5-minute diagnostic at the start of class to lift engagement.
                </div>
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  )
}

