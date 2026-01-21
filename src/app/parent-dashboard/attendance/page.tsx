"use client"

import { useMemo, useState } from "react"
import { CalendarDays, Clock, ShieldCheck, Trophy } from "lucide-react"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

const months = [
  { label: "January", value: 0 },
  { label: "February", value: 1 },
  { label: "March", value: 2 },
  { label: "April", value: 3 },
  { label: "May", value: 4 },
  { label: "June", value: 5 },
  { label: "July", value: 6 },
  { label: "August", value: 7 },
  { label: "September", value: 8 },
  { label: "October", value: 9 },
  { label: "November", value: 10 },
  { label: "December", value: 11 },
]

const currentYear = new Date().getFullYear()
const years = [currentYear - 1, currentYear, currentYear + 1]
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

type Status = "Present" | "Absent" | "Holiday" | "Weekend"

type CalendarCell = {
  day?: number
  status?: Status
  iso?: string
  empty?: boolean
}

function buildCalendarDays(year: number, monthIndex: number, overrides: Record<string, Status>) {
  const firstDay = new Date(year, monthIndex, 1)
  const startWeekday = firstDay.getDay()
  const blanks: CalendarCell[] = Array.from({ length: startWeekday }, (_, index) => ({
    empty: true,
    iso: `blank-${index}`,
  }))
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const days: CalendarCell[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day)
    const iso = date.toISOString().split("T")[0]
    const override = overrides[iso]
    const dayOfWeek = date.getDay()
    let status: Status = "Present"
    if (override === "Holiday") {
      status = "Holiday"
    } else if (override === "Absent") {
      status = "Absent"
    } else if (dayOfWeek === 0 || dayOfWeek === 6) {
      status = "Weekend"
    }
    days.push({ day, status, iso })
  }

  return [...blanks, ...days]
}

export default function AttendancePage() {
  const { childData } = useParentDashboardContext()
  const { attendance, profile } = childData
  const [selection, setSelection] = useState(() => {
    const now = new Date()
    return { monthIndex: now.getMonth(), year: now.getFullYear() }
  })
  const calendarCells = useMemo(
    () => buildCalendarDays(selection.year, selection.monthIndex, attendance.calendarOverrides),
    [selection, attendance.calendarOverrides],
  )
  const monthLabel = months.find((option) => option.value === selection.monthIndex)?.label ?? "Month"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Attendance
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 lg:text-4xl">
                Daily attendance & monthly summary for {profile.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Review presence records, punctuality trends, and any teacher flags in one place.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600">
              Sync completed • 09:05 AM
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <SummaryCard
            title="Daily attendance"
            icon={<CalendarDays className="h-5 w-5 text-indigo-600" />}
            callout="Punctual & engaged"
            description="Live log shows last 5 days; tap for older entries."
          />
          <SummaryCard
            title="Monthly summary"
            icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
            callout={`${attendance.monthlyPercent}% presence`}
            description="Tracked days updated hourly."
          />
          <SummaryCard
            title="Punctuality rhythm"
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            callout="Consistent arrival"
            description="Weekday arrival window remains steady."
          />
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Daily attendance log</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Last entries</span>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {attendance.log.map((entry) => (
              <div
                key={entry.date}
                className="flex items-start justify-between rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
              >
                <div>
                  <p className="font-semibold text-slate-900">{entry.date}</p>
                  <p className="text-xs text-slate-500">{entry.note}</p>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    entry.status === "Present" ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Attendance calendar</h2>
              <p className="text-xs text-slate-500">
                {monthLabel} {selection.year} • holidays & weekends marked
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <label className="flex items-center gap-1">
                Month
                <select
                  value={selection.monthIndex}
                  onChange={(event) =>
                    setSelection((prev) => ({
                      ...prev,
                      monthIndex: Number(event.target.value),
                    }))
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                >
                  {months.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                Year
                <select
                  value={selection.year}
                  onChange={(event) =>
                    setSelection((prev) => ({
                      ...prev,
                      year: Number(event.target.value),
                    }))
                  }
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                >
                  {years.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase text-slate-400">
            {WEEKDAYS.map((weekDay) => (
              <div key={weekDay} className="text-center">
                {weekDay}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 text-xs text-slate-600">
            {calendarCells.map((cell, index) => {
              if (cell.empty) {
                return (
                  <div
                    key={cell.iso ?? `empty-${index}`}
                    className="rounded-2xl border border-transparent bg-transparent px-1 py-2"
                  />
                )
              }
              const statusClass =
                {
                  Present: "bg-emerald-50 border-emerald-200 text-emerald-700",
                  Absent: "bg-rose-50 border-rose-200 text-rose-600",
                  Holiday: "bg-amber-50 border-amber-200 text-amber-600",
                  Weekend: "bg-slate-50 border-slate-200 text-slate-400",
                }[cell.status ?? "Present"]
              const badge =
                cell.status === "Present"
                  ? "P"
                  : cell.status === "Absent"
                  ? "A"
                  : cell.status === "Holiday"
                  ? "H"
                  : "W"
              return (
                <div
                  key={cell.iso ?? `day-${cell.day}`}
                  className={`flex flex-col items-center rounded-2xl border px-1 py-2 text-center text-[11px] ${statusClass}`}
                >
                  <span className="text-base font-semibold text-current">{cell.day}</span>
                  <span className="text-[9px] uppercase tracking-wide text-current">{badge}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <LegendBadge label="P: Present" className="border-emerald-200 bg-emerald-50 text-emerald-700" />
            <LegendBadge label="A: Absent" className="border-rose-200 bg-rose-50 text-rose-600" />
            <LegendBadge label="H: Holiday" className="border-amber-200 bg-amber-50 text-amber-600" />
            <LegendBadge label="W: Weekend" className="border-slate-200 bg-slate-50 text-slate-500" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Monthly breakdown</h2>
              <p className="text-xs text-slate-500">Tracked days/flags</p>
            </div>
            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">
              Summary verified
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {attendance.summary.map((item) => (
              <StatCard key={item.label} label={item.label} value={item.value} highlight={item.label === "Absent days" ? false : true} />
            ))}
          </div>
          <ul className="mt-6 space-y-3 text-sm text-slate-600">
            {attendance.trendHighlights.map((item) => (
              <li key={item} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <Trophy className="h-4 w-4 text-indigo-500" />
                <span className="ml-3">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  icon,
  callout,
  description,
}: {
  title: string
  icon: React.ReactNode
  callout: string
  description: string
}) {
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-500">
        <span>{title}</span>
        {icon}
      </div>
      <p className="text-lg font-bold text-slate-900">{callout}</p>
      <p className="text-xs text-slate-500">{description}</p>
    </article>
  )
}

function StatCard({
  label,
  value,
  highlight = true,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl border ${highlight ? "border-slate-200" : "border-rose-200"} bg-slate-50/80 p-4`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${highlight ? "text-slate-900" : "text-rose-500"}`}>{value}</p>
    </div>
  )
}

function LegendBadge({ label, className }: { label: string; className: string }) {
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>
}
