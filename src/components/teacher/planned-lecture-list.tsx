"use client"

import { useEffect, useMemo, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import gfm from "remark-gfm"
import { LecturePlanningContext } from "./lecture-planning-form"

type LecturePlanItem = {
  id: string
  created_at: string
  ai_response: string
  raw_ai_response?: string | null
  input_payload?: {
    module_title?: string | null
    subtopic_title?: string | null
    struggling_concepts?: string | null
    time_available_minutes?: number | null
    topic_hierarchy_covered_so_far?: string | null
    topic_to_cover?: string | null
  }
}

type PlannedLectureListProps = {
  context: LecturePlanningContext | null
  refreshToken?: number
}

const PLAN_MARKDOWN_COMPONENTS: Components = {
  h1: ({ ...props }) => (
    <p
      {...props}
      className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-600"
    />
  ),
  h2: ({ ...props }) => (
    <p
      {...props}
      className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-600"
    />
  ),
  h3: ({ ...props }) => (
    <p
      {...props}
      className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-600"
    />
  ),
  h4: ({ ...props }) => (
    <p
      {...props}
      className="mt-3 text-sm font-semibold uppercase tracking-wide text-slate-600"
    />
  ),
  p: ({ ...props }) => (
    <p {...props} className="text-sm text-slate-700 leading-relaxed" />
  ),
  ul: ({ ...props }) => (
    <ul {...props} className="mb-3 list-disc pl-5 text-sm text-slate-700" />
  ),
  ol: ({ ...props }) => (
    <ol {...props} className="mb-3 list-decimal pl-5 text-sm text-slate-700" />
  ),
  li: ({ ...props }) => (
    <li {...props} className="text-sm text-slate-700 leading-relaxed" />
  ),
  strong: ({ ...props }) => (
    <strong {...props} className="font-semibold text-slate-900" />
  ),
  em: ({ ...props }) => (
    <em {...props} className="text-sm text-slate-700 italic" />
  ),
  hr: ({ ...props }) => (
    <div {...props} className="my-3 h-px w-full bg-slate-200/80" />
  ),
}

export function PlannedLectureList({
  context,
  refreshToken,
}: PlannedLectureListProps) {
  const [plans, setPlans] = useState<LecturePlanItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [arePlanDetailsOpen, setPlanDetailsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<"latest" | "all">("latest")

  const queryKey = useMemo(
    () =>
      context
        ? new URLSearchParams({
            class_id: context.classId,
            subject_id: context.subjectId,
            module_id: context.moduleId,
            section_id: context.sectionId,
          }).toString()
        : "",
    [context],
  )

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[0]
  useEffect(() => {
    if (selectedPlan) {
      setPlanDetailsOpen(true)
    }
  }, [selectedPlan])

  useEffect(() => {
    if (!context) {
      setPlans([])
      setError(null)
      setSelectedPlanId(null)
      return
    }

    const controller = new AbortController()
    const fetchPlans = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/teacher/lecture-planning?${queryKey}`,
          {
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || "Failed to load plans")
        }
        const data = await response.json()
        setPlans(Array.isArray(data?.plans) ? data.plans : [])
        const ids = Array.isArray(data?.plans) ? data.plans : []
        if (ids.length) {
          setSelectedPlanId((prev) => {
            if (refreshToken) return ids[0].id
            return prev && ids.some((plan) => plan.id === prev)
              ? prev
              : ids[0].id
          })
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load planned lectures",
        )
      } finally {
        setIsLoading(false)
      }
    }

    void fetchPlans()
    return () => {
      controller.abort()
    }
  }, [context, queryKey, refreshToken])

  if (!context) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-sm text-slate-500">
        Select a class, subject, module, and section above to unlock the planned lectures view.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading saved lecture plans…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-6 text-sm text-rose-700">
        {error}
      </div>
    )
  }

  if (!plans.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-sm text-slate-500">
        No plans found for the selected class/module/section yet.
      </div>
    )
  }

  const filteredPlan = selectedPlan
  const latestPlan = plans[0]
  const payload = filteredPlan?.input_payload ?? {}
  const moduleLabel = payload.module_title || 'Module'
  const sectionLabel = payload.subtopic_title || 'Section'
  const minutes = payload.time_available_minutes ?? 40
  const struggles = payload.struggling_concepts
  const planText =
    filteredPlan?.ai_response?.trim() ||
    filteredPlan?.raw_ai_response?.trim() ||
    ''

  const latestPayload = latestPlan?.input_payload ?? {}
  const latestModuleLabel = latestPayload.module_title || 'Module'
  const latestSectionLabel = latestPayload.subtopic_title || 'Section'
  const latestMinutes = latestPayload.time_available_minutes ?? 40
  const latestStruggles = latestPayload.struggling_concepts
  const latestTimestamp = latestPlan
    ? new Date(latestPlan.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

  const activePayload =
    activeTab === "latest" ? latestPayload : payload
  const activeModuleLabel =
    activeTab === "latest" ? latestModuleLabel : moduleLabel
  const activeSectionLabel =
    activeTab === "latest" ? latestSectionLabel : sectionLabel
  const activeMinutes =
    activeTab === "latest" ? latestMinutes : minutes
  const activeStruggles =
    activeTab === "latest" ? latestStruggles : struggles
  const activePlanText =
    activeTab === "latest"
      ? latestPlan?.ai_response?.trim() ||
        latestPlan?.raw_ai_response?.trim() ||
        ""
      : planText

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Planned lectures
            </p>
            <p className="text-sm text-slate-600">
              Review the newest plan or browse the full history.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab("latest")}
              className={`rounded-lg px-3 py-1 ${
                activeTab === "latest"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Latest
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-lg px-3 py-1 ${
                activeTab === "all"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              All plans
            </button>
          </div>
        </div>

        {activeTab === "latest" ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Latest plan
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {plans.length} saved
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {latestModuleLabel} • {latestSectionLabel}
                </h3>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {latestTimestamp}
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="rounded-full bg-white px-2 py-1 shadow-xs">
                    {latestMinutes} min
                  </span>
                  {latestStruggles && (
                    <span className="rounded-full bg-white px-2 py-1 shadow-xs">
                      Struggling: {latestStruggles}
                    </span>
                  )}
                </div>
              </div>
              {/* <button
                type="button"
                onClick={() => {
                  if (latestPlan?.id) {
                    setSelectedPlanId(latestPlan.id)
                    setPlanDetailsOpen(true)
                  }
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800"
              >
                View latest plan
              </button> */}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selected plan
                <select
                  value={selectedPlan?.id ?? ""}
                  onChange={(event) => {
                    setSelectedPlanId(event.target.value)
                    setPlanDetailsOpen(true)
                  }}
                  className="mt-1 h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
                >
                  {plans.map((plan, index) => {
                    const label = new Date(plan.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                    return (
                      <option key={plan.id} value={plan.id}>
                        {`Plan ${index + 1} - ${label}`}
                      </option>
                    )
                  })}
                </select>
              </label>
            </div> */}
            <div className="grid gap-2">
              {plans.map((plan, index) => {
                const label = new Date(plan.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
                const isSelected = plan.id === selectedPlan?.id
                const isLatest = plan.id === latestPlan?.id
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedPlanId(plan.id)
                      setPlanDetailsOpen(true)
                    }}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50/70 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="font-semibold">Plan {index + 1}</span>
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      {label}
                    </span>
                    {isLatest && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Latest
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <details
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        open={arePlanDetailsOpen}
        onToggle={(event) => setPlanDetailsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">
          Plan details
        </summary>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Selected plan
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-semibold text-slate-900">
                  {activeModuleLabel}
                </p>
                <span className="text-xs text-slate-500">
                  {activeSectionLabel}
                </span>
              </div>
            </div>
            <span className="text-xs font-medium uppercase text-slate-500">
              {activeMinutes} min
            </span>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Plan focus
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {activePayload.topic_to_cover || activeModuleLabel}
              </p>
            </div>
            {activePayload.topic_hierarchy_covered_so_far && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Topic hierarchy covered
                </p>
                <p className="text-sm text-slate-700">
                  {activePayload.topic_hierarchy_covered_so_far}
                </p>
              </div>
            )}
            {activeStruggles && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Struggling concepts
                </p>
                <p className="text-sm text-slate-600">{activeStruggles}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {activePlanText ? (
              <ReactMarkdown
                components={PLAN_MARKDOWN_COMPONENTS}
                remarkPlugins={[gfm]}
              >
                {activePlanText}
              </ReactMarkdown>
            ) : (
              <p className="text-sm text-slate-500">
                AI has not returned any lesson details yet.
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  )
}
