"use client"

import { Activity, PauseCircle, Users2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

const objectives = [
  "Identify equivalent fractions",
  "Use visual models to explain fraction relationships",
  "Simplify fractions with common factors",
]

export function ActiveSessionView() {
  return (
    <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-emerald-500 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            <Activity className="h-3.5 w-3.5 text-emerald-600" />
            Active Session
          </div>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Fractions - Equivalent Fractions</h2>
          <p className="mt-1 text-sm text-slate-600">Objectives</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="font-semibold text-slate-900">28 students</div>
          Joined
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {objectives.map((item) => (
          <div key={item} className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700 shadow-xs">
            {item}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <div className="flex items-center gap-2">
          <Users2 className="h-4 w-4" />
          AI assisting 12 students
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Live</span>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl border-amber-200 text-sm text-amber-700 hover:bg-amber-50"
        >
          <PauseCircle className="mr-2 h-4 w-4" />
          Pause AI
        </Button>
        <Button
          type="button"
          className="h-10 rounded-xl bg-rose-600 text-sm font-semibold text-white transition hover:bg-rose-700"
        >
          <XCircle className="mr-2 h-4 w-4" />
          End Session
        </Button>
      </div>
    </div>
  )
}
