"use client"

import { CheckCircle2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { LessonWizard } from "@/components/teacher/lesson-wizard"

type LessonAssignmentRow = {
  id: string
  status: string
  assigned_at?: string | null
  due_at?: string | null
  classes?: { name?: string | null } | null
  modules?: { title?: string | null } | null
  sections?: { title?: string | null } | null
  section_topics?: { topic_name?: string | null } | null
  section_id?: string | null
  trigger_type?: string | null
  trigger_config?: Record<string, any> | null
  lesson_assignment_students?:
    | Array<{ count?: number | null }>
    | { count?: number | null }
    | null
}

type TriggerEntry = {
  key: string
  value: any
}

function getAssignedCount(row: LessonAssignmentRow): number {
  if (Array.isArray(row.lesson_assignment_students)) {
    return row.lesson_assignment_students[0]?.count ?? 0
  }
  return row.lesson_assignment_students?.count ?? 0
}

function getLessonTitle(row: LessonAssignmentRow): string {
  return (
    row.section_topics?.topic_name ||
    row.sections?.title ||
    row.modules?.title ||
    "Lesson"
  )
}

function getModuleName(row: LessonAssignmentRow): string | null {
  return row.modules?.title ?? null
}

function getSectionName(row: LessonAssignmentRow): string | null {
  return row.sections?.title ?? null
}

function formatDueLabel(dueAt?: string | null): string {
  if (!dueAt) return "No due date"
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return "No due date"
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

function formatTriggerEntries(row: LessonAssignmentRow): TriggerEntry[] {
  const config = row.trigger_config
  if (!config || typeof config !== "object") {
    return []
  }
  return Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({ key, value }))
}

type LessonRollupContext = {
  classId: string
  subjectId: string
  moduleId?: string
}

export function TeacherHomeworkDashboard() {
  const [assignments, setAssignments] = useState<LessonAssignmentRow[]>([])
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [context, setContext] = useState<LessonRollupContext | null>(null)
  const [deletingAssignmentIds, setDeletingAssignmentIds] = useState<Set<string>>(new Set())
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null)

  const assignedSectionIds = useMemo(() => {
    const ids = new Set<string>()
    assignments.forEach((assignment) => {
      if (assignment.section_id) {
        ids.add(assignment.section_id)
      }
    })
    return Array.from(ids)
  }, [assignments])

  const lessonRollup = useMemo(
    () =>
      assignments.slice(0, 6).map((row) => ({
        id: row.id,
        title: getLessonTitle(row),
        moduleName: getModuleName(row),
        sectionName: getSectionName(row),
        students: getAssignedCount(row),
        status: row.status || "assigned",
        due: formatDueLabel(row.due_at),
        triggerType: row.trigger_type ?? "manual",
        triggerEntries: formatTriggerEntries(row),
      })),
    [assignments],
  )

  const classId = context?.classId
  const subjectId = context?.subjectId
  const moduleId = context?.moduleId
  const hasSelection = Boolean(classId && subjectId)

  const markAssignmentDeleting = (assignmentId: string, deleting: boolean) => {
    setDeletingAssignmentIds((prev) => {
      const next = new Set(prev)
      if (deleting) {
        next.add(assignmentId)
      } else {
        next.delete(assignmentId)
      }
      return next
    })
  }

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (deletingAssignmentIds.has(assignmentId)) return
    if (!confirm("Are you sure you want to remove this lesson assignment?")) {
      return
    }
    markAssignmentDeleting(assignmentId, true)
    try {
      const response = await fetch(`/api/teacher/lesson-assignments/${assignmentId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const errorText = (await response.text()) || "Failed to remove lesson assignment"
        throw new Error(errorText)
      }
      setAssignments((prev) => prev.filter((assignment) => assignment.id !== assignmentId))
      toast.success("Lesson assignment removed")
    } catch (error: any) {
      toast.error(error?.message || "Failed to remove lesson assignment")
    } finally {
      markAssignmentDeleting(assignmentId, false)
    }
  }

  useEffect(() => {
    if (!classId || !subjectId) {
      setAssignments([])
      setAssignmentError(null)
      setIsLoadingAssignments(false)
      return
    }

    let isMounted = true
    const loadAssignments = async () => {
      setIsLoadingAssignments(true)
      setAssignmentError(null)
      try {
        const params = new URLSearchParams({
          class_id: classId,
          subject_id: subjectId,
          ...(moduleId ? { module_id: moduleId } : {}),
        })
        const response = await fetch(`/api/teacher/lesson-assignments?${params.toString()}`)
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text)
        }
        const payload = await response.json()
        if (isMounted) setAssignments(payload || [])
      } catch (error: any) {
        if (isMounted) {
          const message = error.message || "Failed to load lesson rollup"
          setAssignmentError(message)
          toast.error(message)
        }
      } finally {
        if (isMounted) setIsLoadingAssignments(false)
      }
    }

    loadAssignments()
    return () => {
      isMounted = false
    }
  }, [classId, subjectId, moduleId, hasSelection])

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[7fr_3fr]">
      <section className="flex items-start justify-center">
        <div className="w-full">
          <LessonWizard onContextChange={setContext} assignedSectionIds={assignedSectionIds} />
        </div>
      </section>
      <section className="space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Lesson rollup</h2>
              <p className="mt-1 text-sm text-slate-600">
                {hasSelection
                  ? "Latest lessons tied to your current lesson setup."
                  : "Pick a class and subject inside Lesson Setup to preview recent activity."}
              </p>
            </div>
            {hasSelection && (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {lessonRollup.length} lesson{lessonRollup.length === 1 ? "" : "s"}
              </div>
            )}
          </div>

          {assignmentError && (
            <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {assignmentError}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {!hasSelection ? (
              <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                Lessons are grouped by the class and subject currently selected in the Lesson Setup form.
              </div>
            ) : isLoadingAssignments ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                Loading lesson rollup...
              </div>
            ) : lessonRollup.length === 0 ? (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                No lessons have been assigned for this context yet.
              </div>
            ) : (
              lessonRollup.map((item) => (
                <details
                  key={item.id}
                  open={expandedAssignmentId === item.id}
                  onToggle={(event) => {
                    if (event.currentTarget.open) {
                      setExpandedAssignmentId(item.id)
                    } else if (expandedAssignmentId === item.id) {
                      setExpandedAssignmentId(null)
                    }
                  }}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
                    <div>{item.title}</div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.status}
                      </span>
                      
                    </div>
                  </summary>
                  <div className="space-y-3 border-t border-slate-200 px-4 py-4 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-700 font-semibold">Trigger:</span>
                      <span className="text-slate-900 font-semibold capitalize">
                        {item.triggerType}
                      </span>
                      {item.triggerEntries.map((entry) => (
                        <span
                          key={entry.key}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {entry.value === true ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          ) : entry.value === false ? (
                            <X className="h-3 w-3 text-rose-500" />
                          ) : null}
                          <span className="text-[11px] font-semibold text-slate-600">
                            {entry.key}
                            {typeof entry.value === "boolean" ? "" : `: ${entry.value}`}
                          </span>
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      {item.moduleName && (
                        <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-600">
                          Module: {item.moduleName}
                        </span>
                      )}
                      {item.sectionName && (
                        <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-600">
                          Section: {item.sectionName}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>{item.students} students assigned</span>
                      <span>{item.due}</span>
                    </div>
                    <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          handleRemoveAssignment(item.id)
                        }}
                        disabled={deletingAssignmentIds.has(item.id)}
                        className="rounded-full border border-rose-200 bg-white px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-300 hover:text-rose-700 disabled:border-rose-100 disabled:text-rose-300 disabled:cursor-not-allowed"
                      >
                        {deletingAssignmentIds.has(item.id) ? "Removing" : "Remove"}
                      </button>
                  </div>
                </details>
              ))
            )}
          </div>
        </div>
      </section>

    </div>
  )
}
