"use client"

import { MessageCircleQuestion } from "lucide-react"

const commonQuestions = [
  { label: "Why are these fractions equivalent?", count: 8 },
  { label: "How do I simplify this fraction?", count: 6 },
  { label: "What is a common denominator?", count: 5 },
  { label: "Can I see a visual model?", count: 4 },
]

export function CommonQuestionsCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-slate-900 bg-white p-6 shadow-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
        <MessageCircleQuestion className="h-3.5 w-3.5 text-emerald-600" />
        Quick View
      </div>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Common questions being asked</h2>
      <p className="mt-1 text-sm text-slate-600">Live signals from the classroom.</p>

      <div className="mt-4 space-y-2">
        {commonQuestions.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700 shadow-xs"
          >
            <span>{item.label}</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
