"use client"

import { ShieldCheck, Star } from "lucide-react"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

export default function PerformanceInsightsPage() {
  const { childData } = useParentDashboardContext()
  const { strengths, weakAreas, teacherRemarks, performanceSignals } = childData

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Performance Insights
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Strengths, growth areas, and teacher notes</h1>
              <p className="mt-1 text-sm text-slate-500">
                This space highlights curated insights from the teaching team so parents can coach intentionally.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600">
              Updated Jan 11 • 09:10 AM
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <InsightGrid title="Strengths" items={strengths} accent="from-emerald-400 to-teal-500" />
          <InsightGrid title="Weak areas" items={weakAreas} accent="from-amber-400 to-orange-500" />
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Teacher remarks</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Confirmed</span>
          </div>
          <div className="mt-5 space-y-4">
            {teacherRemarks.map((item) => (
              <article key={`${item.author}-${item.time}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500">
                  <span>{item.author}</span>
                  <span>{item.time}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-slate-900">{item.role}</p>
                <p className="mt-3 text-sm">{item.remark}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-emerald-500" />
              <h3 className="text-lg font-bold text-slate-900">Performance signals</h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {performanceSignals.map((signal) => (
                <li key={signal} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  {signal}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-3xl border border-white/70 bg-gradient-to-br from-indigo-500 to-slate-900 p-6 text-white shadow-xl shadow-indigo-500/40">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-white/80" />
              <h3 className="text-lg font-bold">Celebrations ✨</h3>
            </div>
            <p className="mt-2 text-sm text-white/80">
              Acknowledge strengths and point the family to the next practical steps. Check in on timeout writing or revision planning as needed.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl border border-white/30 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/70">Highlight</p>
                <p className="text-sm font-semibold text-white">Share praise for science lab leadership.</p>
              </div>
              <div className="rounded-2xl border border-white/30 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-white/70">Focus</p>
                <p className="text-sm font-semibold text-white">Practice timed writing in short bursts.</p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}

function InsightGrid({
  title,
  items,
  accent,
}: {
  title: string
  items: { label: string; detail: string }[]
  accent: string
}) {
  return (
    <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
      <div className="flex items-center gap-2">
        <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${accent} text-white flex items-center justify-center font-bold`}>
          {title[0]}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performance insight</p>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="font-semibold text-slate-900">{item.label}</p>
            <p className="text-xs text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </article>
  )
}
