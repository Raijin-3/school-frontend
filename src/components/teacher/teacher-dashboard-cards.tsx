"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { BookOpen, ClipboardList, LineChart } from "lucide-react"

type Card = {
  title: string
  description: string
  href: string
  accent: string
  icon: "book" | "clipboard" | "chart"
}

const iconMap = {
  book: BookOpen,
  clipboard: ClipboardList,
  chart: LineChart,
}

export function TeacherDashboardCards({ cards }: { cards: Card[] }) {
  const router = useRouter()
  const [loadingHref, setLoadingHref] = useState<string | null>(null)

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = iconMap[card.icon]
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => {
                if (loadingHref) return
                setLoadingHref(card.href)
                router.push(card.href)
              }}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{card.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Open
              </div>
            </button>
          )
        })}
      </div>

      {loadingHref && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            Loading…
          </div>
        </div>
      )}
    </div>
  )
}
