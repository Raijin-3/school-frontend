"use client"

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
  lesson_assignment_students?:
    | Array<{ count?: number | null }>
    | { count?: number | null }
    | null
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

export function TeacherHomeworkDashboard() {
  const [assignments, setAssignments] = useState<LessonAssignmentRow[]>([])
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [context, setContext] = useState<{ classId: string; subjectId: string } | null>(null)

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
      })),
    [assignments],
  )

  const classId = context?.classId
  const subjectId = context?.subjectId
  const hasSelection = Boolean(classId && subjectId)

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
  }, [classId, subjectId, hasSelection])

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    {item.moduleName && (
                      <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-600">
                        Module: {item.moduleName}
                      </span>
                    )}
                    {/* {item.sectionName && (
                      <span className="rounded-full border border-slate-200/60 bg-white px-2 py-0.5 font-semibold text-slate-600">
                        Section: {item.sectionName}
                      </span>
                    )} */}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>{item.students} students assigned</span>
                    <span>{item.due}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="flex items-start justify-center">
        <div className="w-full">
          <LessonWizard onContextChange={setContext} />
        </div>
      </section>
    </div>
  )
}
