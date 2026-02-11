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

export function PlannedLectureList({ context }: PlannedLectureListProps) {
  const [plans, setPlans] = useState<LecturePlanItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [arePlanDetailsOpen, setPlanDetailsOpen] = useState(true)

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
  }, [context, queryKey])

  if (!context) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/70 p-6 text-sm text-slate-500">
        Select a class, subject, module, and section in the Plan Lecture tab to
        see existing plans tied to that context.
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
  const timestamp = filteredPlan
    ? new Date(filteredPlan.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''
  const payload = filteredPlan?.input_payload ?? {}
  const moduleLabel = payload.module_title || 'Module'
  const sectionLabel = payload.subtopic_title || 'Section'
  const minutes = payload.time_available_minutes ?? 40
  const struggles = payload.struggling_concepts
  const planText =
    filteredPlan?.ai_response?.trim() ||
    filteredPlan?.raw_ai_response?.trim() ||
    ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {timestamp}
          </p>
          <p className="text-sm text-slate-700">
            Showing plan for <span className="font-semibold">{moduleLabel}</span>{" "}
            / <span className="font-semibold">{sectionLabel}</span>
          </p>
        </div>
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
          Selected plan
          <select
            value={selectedPlan?.id ?? ""}
            onChange={(event) => {
              setSelectedPlanId(event.target.value)
              setPlanDetailsOpen(true)
            }}
            className="mt-1 h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
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
                  {moduleLabel}
                </p>
                <span className="text-xs text-slate-500">{sectionLabel}</span>
              </div>
            </div>
            <span className="text-xs font-medium uppercase text-slate-500">
              {minutes} min
            </span>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Plan focus
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {payload.topic_to_cover || moduleLabel}
              </p>
            </div>
            {payload.topic_hierarchy_covered_so_far && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Topic hierarchy covered
                </p>
                <p className="text-sm text-slate-700">
                  {payload.topic_hierarchy_covered_so_far}
                </p>
              </div>
            )}
            {struggles && (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Struggling concepts
                </p>
                <p className="text-sm text-slate-600">{struggles}</p>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {planText ? (
              <ReactMarkdown
                components={PLAN_MARKDOWN_COMPONENTS}
                remarkPlugins={[gfm]}
              >
                {planText}
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
