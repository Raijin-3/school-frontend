"use client"

import { useRef, useState } from "react"
import { LecturePlanningForm, LecturePlanningContext } from "./lecture-planning-form"
import { PlannedLectureList } from "./planned-lecture-list"

type LecturePlanningShellProps = {
  displayName: string
}

export function LecturePlanningShell({ displayName }: LecturePlanningShellProps) {
  const [context, setContext] = useState<LecturePlanningContext | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const plannedListRef = useRef<HTMLDivElement | null>(null)

  const scrollToPlanned = () => {
    const target =
      plannedListRef.current ??
      (typeof document !== "undefined"
        ? document.getElementById("planned-lectures")
        : null)
    if (!target) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    })
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
          Lecture Planning
        </div>
        {/* <h1 className="mt-3 text-2xl font-semibold text-slate-900">Lecture Planning</h1> */}
        <p className="mt-1 text-sm text-slate-600">
          Welcome back,{" "}
          <span className="font-semibold text-slate-900">{displayName}</span>. Build lecture
          outlines, capture how the class is progressing, and highlight what needs extra attention.
        </p>
        <div className="mt-4">
          <LecturePlanningForm
            onContextChange={setContext}
            onPlanSaved={() => {
              setRefreshToken((prev) => prev + 1)
              scrollToPlanned()
            }}
          />
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8 lg:sticky lg:top-6 lg:self-start"
        ref={plannedListRef}
        id="planned-lectures"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-slate-900">Planned lectures</h2>
          <p className="text-sm text-slate-600">
            Review the latest AI plan below before stepping into class.
          </p>
        </div>
        <div className="mt-4">
          <PlannedLectureList context={context} refreshToken={refreshToken} />
        </div>
      </div>
    </div>
  )
}
