"use client"

import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

export function ChildSwitcher() {
  const { selectedChildId, setSelectedChildId, children } = useParentDashboardContext()
  const child = children.find((item) => item.id === selectedChildId) ?? children[0]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 shadow-sm shadow-slate-200">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="child-select">
          Viewing progress for
        </label>
        <select
          id="child-select"
          value={selectedChildId}
          onChange={(event) => setSelectedChildId(event.target.value)}
          className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200 transition hover:border-slate-300"
        >
          {children.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.grade})
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-xs text-slate-500">Current focus: {child.remarks}</p>
    </div>
  )
}
