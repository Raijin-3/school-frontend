"use client"

import { useState } from "react"
import { LecturePlanningForm, LecturePlanningContext } from "./lecture-planning-form"
import { PlannedLectureList } from "./planned-lecture-list"

type LecturePlanningShellProps = {
  displayName: string
}

export function LecturePlanningShell({ displayName }: LecturePlanningShellProps) {
  const [context, setContext] = useState<LecturePlanningContext | null>(null)
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
        Lecture Planning
      </div>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">Lecture Planning</h1>
      <p className="mt-1 text-sm text-slate-600">
        Welcome back,{" "}
        <span className="font-semibold text-slate-900">{displayName}</span>. Build lecture outlines,
        capture how the class is progressing, and highlight what needs extra attention.
      </p>

      <div className="mt-6 space-y-6">
        <section>
          <div className="mt-4">
            <LecturePlanningForm onContextChange={setContext} />
          </div>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Planned lectures</h2>
          <p className="text-sm text-slate-500">
            All plans are linked to the selected class, subject, module, and section.
          </p>
          <div className="mt-4">
            <PlannedLectureList context={context} />
          </div>
        </section>
      </div>
    </div>
  )
}
