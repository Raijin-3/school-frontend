"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart, PieChart, Target } from "lucide-react"

import {
  deriveSectionScoreSummary,
  ModuleSectionAttempt,
} from "@/lib/module-section"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

type SectionInsight = {
  moduleId: string
  moduleTitle: string
  subjectTitle: string
  sectionTitle: string
  summary: ReturnType<typeof deriveSectionScoreSummary>
}

export default function PerformanceInsightsPage() {
  const { childData, selectedChildId } = useParentDashboardContext()
  const { subjectDetails } = childData
  const moduleMeta = useMemo(() => {
    const list: Array<{ id: string; title?: string | null; subject: string }> = []
    subjectDetails.forEach((subject) => {
      const subjectName = subject.subject
      subject.modules?.forEach((module) => {
        if (module?.id) {
          list.push({
            id: module.id,
            title: module.title ?? module.id,
            subject: subjectName,
          })
        }
      })
    })
    return list
  }, [subjectDetails])

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>()
    const options = [{ value: "all", label: "All subjects" }]
    moduleMeta.forEach((module) => {
      const title = module.subject?.trim() || "Untitled subject"
      if (!seen.has(title)) {
        seen.add(title)
        options.push({ value: title, label: title })
      }
    })
    return options
  }, [moduleMeta])

  const [sectionCache, setSectionCache] = useState<Record<string, ModuleSectionAttempt[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState("all")

  const moduleIds = useMemo(() => moduleMeta.map((module) => module.id), [moduleMeta])

  useEffect(() => {
    if (!moduleIds.length) {
      setSectionCache({})
      setFetchError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true
    setIsLoading(true)
    setFetchError(null)
    setSectionCache({})

    const fetchForModule = async (moduleId: string) => {
      const params = new URLSearchParams({ module_id: moduleId })
      if (selectedChildId) {
        params.set("child_id", selectedChildId)
      }
      const response = await fetch(`/api/parent/module-sections?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText)
        throw new Error(message || "Failed to load sections")
      }
      return (await response.json()) as ModuleSectionAttempt[]
    }

    const loadAll = async () => {
      try {
        await Promise.all(
          moduleIds.map(async (moduleId) => {
            const data = await fetchForModule(moduleId)
            if (!active) return
            setSectionCache((prev) => ({
              ...prev,
              [moduleId]: data,
            }))
          }),
        )
      } catch (error) {
        if (!active) return
        if ((error as any)?.name === "AbortError") {
          return
        }
        console.error("Failed to load performance insights", error)
        setFetchError((error as Error)?.message ?? "Unable to load section insights")
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadAll()
    return () => {
      active = false
      controller.abort()
    }
  }, [moduleIds, selectedChildId])

  useEffect(() => {
    if (subjectOptions.some((option) => option.value === selectedSubject)) {
      return
    }
    setSelectedSubject(subjectOptions[0]?.value ?? "all")
  }, [selectedSubject, subjectOptions])

  const producedSections = useMemo(() => {
    return moduleIds.flatMap((moduleId) => {
      const sections = sectionCache[moduleId] ?? []
      const meta = moduleMeta.find((item) => item.id === moduleId)
      return sections.map((section) => ({
        moduleId,
        moduleTitle: meta?.title ?? "Module",
        subjectTitle: meta?.subject ?? "Subject",
        sectionTitle: section.title ?? "Section",
        summary: deriveSectionScoreSummary(section),
      }))
    })
  }, [moduleIds, moduleMeta, sectionCache])

  const filteredSections = useMemo(() => {
    if (selectedSubject === "all") {
      return producedSections
    }
    return producedSections.filter(
      (section) => section.subjectTitle === selectedSubject,
    )
  }, [producedSections, selectedSubject])

  const sectionsWithSummary = useMemo(() => {
    return filteredSections.filter((item) => item.summary.scorePercent !== null)
  }, [filteredSections])

  const subjectPerformanceLabel = useMemo(() => {
    const scored = sectionsWithSummary
    if (!scored.length) {
      return { label: "No attempts yet", tone: "text-slate-500" }
    }
    const total = scored.reduce(
      (sum, entry) => sum + (entry.summary.scorePercent ?? 0),
      0,
    )
    const average = Math.round(total / scored.length)
    if (average >= 70) {
      return { label: "Strong performance", tone: "text-emerald-600" }
    }
    if (average >= 50) {
      return { label: "Average performance", tone: "text-amber-600" }
    }
    return { label: "Needs attention", tone: "text-rose-600" }
  }, [sectionsWithSummary])

  const sectionCategories = useMemo(() => {
    const strengthsList: SectionInsight[] = []
    const averageList: SectionInsight[] = []
    const weakList: SectionInsight[] = []
    sectionsWithSummary.forEach((entry) => {
      const score = entry.summary.scorePercent
      if (score === null) {
        weakList.push(entry)
        return
      }
      if (score >= 70) {
        strengthsList.push(entry)
      } else if (score >= 50) {
        averageList.push(entry)
      } else {
        weakList.push(entry)
      }
    })
    strengthsList.sort((a, b) => (b.summary.scorePercent ?? 0) - (a.summary.scorePercent ?? 0))
    averageList.sort((a, b) => (b.summary.scorePercent ?? 0) - (a.summary.scorePercent ?? 0))
    weakList.sort((a, b) => (a.summary.scorePercent ?? 0) - (b.summary.scorePercent ?? 0))
    return {
      strengths: strengthsList,
      average: averageList,
      weak: weakList,
    }
  }, [sectionsWithSummary])

  const categoryConfigs = useMemo(() => {
    return [
      {
        id: "strengths",
        label: "Strengths",
        description: "Score ≥ 70%",
        icon: Target,
        emptyLabel: "No strong sections yet.",
        items: sectionCategories.strengths,
      },
      {
        id: "average",
        label: "Average",
        description: "Score between 50% and 69%",
        icon: PieChart,
        emptyLabel: "No average-range sections tracked yet.",
        items: sectionCategories.average,
      },
      {
        id: "weak",
        label: "Weak areas",
        description: "Score below 50% or not attempted",
        icon: BarChart,
        emptyLabel: "All sections look strong so far.",
        items: sectionCategories.weak,
      },
    ]
  }, [sectionCategories])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Performance insights
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
                Strength & weakness overview for {childData.profile.name}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Based on adaptive quizzes and practice exercise submissions.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-600">
              Refreshed hourly
            </div>
          </div>
        </header>

        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filter</p>
            <h2 className="text-lg font-semibold text-slate-900">Subject</h2>
            <p className={`text-sm font-semibold ${subjectPerformanceLabel.tone}`}>
              {subjectPerformanceLabel.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="subject-filter" className="text-xs font-semibold text-slate-500">
              Show subject
            </label>
            <select
              id="subject-filter"
              value={selectedSubject}
              onChange={(event) => setSelectedSubject(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              {subjectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <section className="grid gap-6 lg:grid-cols-3">
          {categoryConfigs.map((category) => {
            const Icon = category.icon
            return (
              <article
                key={category.id}
                className="rounded-3xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-slate-200/60"
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-5 w-5 ${
                      category.id === "weak"
                        ? "text-rose-500"
                        : category.id === "strengths"
                        ? "text-emerald-500"
                        : "text-indigo-500"
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      {category.description}
                    </p>
                    <h2 className="text-xl font-bold text-slate-900">{category.label}</h2>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Entire section attempts for {category.label.toLowerCase()}.
                </p>
                <div className="mt-5">
                  {isLoading && !category.items.length ? (
                    <p className="text-xs text-slate-500">Loading insights...</p>
                  ) : !category.items.length ? (
                    <p className="text-xs text-slate-500">{category.emptyLabel}</p>
                  ) : (
                    <div className="space-y-4">
                      {category.items.map((entry) => (
                        <SectionEntryCard
                          key={`${entry.moduleId}-${entry.sectionTitle}`}
                          entry={entry}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function SectionEntryCard({ entry }: { entry: SectionInsight }) {
  const scorePercent = entry.summary.scorePercent
  const scoreLabel = scorePercent !== null ? `${scorePercent}%` : "Pending"
  const questionCount = Math.max(0, entry.summary.totalQuestions)
  const questionLabel = questionCount > 0 ? `${questionCount} question${questionCount === 1 ? "" : "s"}` : "No questions recorded"
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
            {entry.subjectTitle}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {entry.moduleTitle} › {entry.sectionTitle}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-900">{scoreLabel}</p>
          <p className="text-[10px] text-slate-500">{questionLabel}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {Math.max(0, entry.summary.totalCorrect)}/{questionCount} correct answers
      </p>
      <p className="text-[10px] font-semibold text-emerald-600">
        {entry.summary.strength}
      </p>
    </div>
  )
}
