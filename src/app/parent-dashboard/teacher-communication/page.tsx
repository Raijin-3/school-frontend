"use client"

import { Bell, MessageCircle, Phone, Star, User } from "lucide-react"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

export default function TeacherCommunicationPage() {
  const { childData } = useParentDashboardContext()
  const { teacherList, communications } = childData

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Teacher Communication
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Stay in sync with {childData.profile.name}’s team</h1>
              <p className="mt-1 text-sm text-slate-500">
                Subject teachers, messages, and announcements collected in one trusted pane.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600">
              Latest sync • 08:55 AM
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Subject teacher list</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Read-only</span>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {teacherList.map((teacher) => (
              <div key={teacher.name} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{teacher.name}</p>
                  <p className="text-xs uppercase tracking-wider text-slate-500">{teacher.subject}</p>
                </div>
                <div className="flex flex-col items-start gap-1 text-sm text-slate-600 md:items-end">
                  <span>{teacher.status}</span>
                  <p className="text-xs text-slate-500">{teacher.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Messages & announcements</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Trusted updates</span>
          </div>
          <div className="mt-5 space-y-4">
            {communications.map((note) => (
              <article key={note.title} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="mt-0.5 rounded-2xl bg-slate-100 p-2 text-slate-600">
                  <note.icon className="h-5 w-5 text-slate-500" />
                </div>
                <div className="flex-1 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">{note.title}</p>
                  <p className="text-xs text-slate-500">{note.time}</p>
                  <p className="mt-2 text-sm text-slate-600">{note.detail}</p>
                </div>
                <button className="rounded-full border border-indigo-200 px-4 py-1 text-xs font-semibold text-indigo-600">View thread</button>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-gradient-to-br from-indigo-500 to-slate-900 p-6 text-white shadow-xl shadow-indigo-500/40 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-white/80" />
            <h3 className="text-lg font-bold">Teacher quick actions</h3>
          </div>
          <p className="mt-2 text-sm text-white/80">
            Use the approved channels for quick clarifications—expect replies within working hours.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ActionCard title="Send appreciation" subtitle="Share praise with the class teacher" icon={Star} />
            <ActionCard title="Request clarification" subtitle="Ask about today's math challenge" icon={MessageCircle} />
            <ActionCard title="Call office" subtitle="Need urgent attendance update?" icon={Phone} />
          </div>
        </section>
      </div>
    </div>
  )
}

function ActionCard({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string
  subtitle: string
  icon: (typeof Star) | (typeof MessageCircle) | (typeof Phone)
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold">
      <Icon className="h-5 w-5 text-white" />
      <p className="text-white">{title}</p>
      <p className="text-xs font-normal text-white/70">{subtitle}</p>
    </div>
  )
}
