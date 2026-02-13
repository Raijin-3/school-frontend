"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type ClassRow = {
  id: string
  name?: string | null
  grade_level?: string | null
  section_label?: string | null
  academic_year?: string | null
}

type SubjectRow = {
  id: string
  title?: string | null
  course_id?: string | null
}

type ModuleRow = {
  id: string
  title?: string | null
}

type SectionRow = {
  id: string
  title?: string | null
}

const buildClassLabel = (item: ClassRow) => {
  const parts = []
  if (item.name) parts.push(item.name)
  if (item.grade_level) parts.push(item.grade_level)
  return parts.join(" • ") || "Unnamed class"
}

const safeText = (value?: string | null, fallback = "Unnamed") =>
  value?.trim() || fallback

export type LecturePlanningContext = {
  classId: string
  subjectId: string
  moduleId: string
  sectionId: string
}

type LecturePlanningFormProps = {
  onContextChange?: (context: LecturePlanningContext | null) => void
  onPlanSaved?: () => void
}

export function LecturePlanningForm({
  onContextChange,
  onPlanSaved,
}: LecturePlanningFormProps = {}) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [sections, setSections] = useState<SectionRow[]>([])

  const [classId, setClassId] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [moduleId, setModuleId] = useState("")
  const [sectionId, setSectionId] = useState("")

  const [strugglingConcepts, setStrugglingConcepts] = useState("")
  const [timeAvailableMinutes, setTimeAvailableMinutes] = useState("40")
  const [topicHierarchy, setTopicHierarchy] = useState("")
  const [keyConcepts, setKeyConcepts] = useState("")
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false)

  const [isLoadingClasses, setIsLoadingClasses] = useState(false)
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false)
  const [isLoadingModules, setIsLoadingModules] = useState(false)
  const [isLoadingSections, setIsLoadingSections] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    const loadClasses = async () => {
      setIsLoadingClasses(true)
      try {
        const response = await fetch("/api/teacher/classes", { cache: "no-store" })
        if (!response.ok) {
          const failure = await response.text()
          throw new Error(failure || "Unable to load classes")
        }
        const payload = (await response.json()) as ClassRow[] | null
        if (!active) return
        setClasses(Array.isArray(payload) ? payload : [])
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error loading classes"
        toast.error(message)
      } finally {
        if (active) setIsLoadingClasses(false)
      }
    }
    void loadClasses()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (classId || classes.length !== 1) return
    const onlyClass = classes[0]?.id
    if (!onlyClass) return
    setClassId(onlyClass)
  }, [classes, classId])

  useEffect(() => {
    if (!classId) {
      setSubjects([])
      setSubjectId("")
      setModules([])
      setModuleId("")
      setSections([])
      setSectionId("")
      setIsLoadingSubjects(false)
      return
    }

    let active = true
    const loadSubjects = async () => {
      setIsLoadingSubjects(true)
      try {
        const response = await fetch(`/api/teacher/classes/${classId}/subjects`, {
          cache: "no-store",
        })
        if (!response.ok) {
          const failure = await response.text()
          throw new Error(failure || "Unable to load subjects for this class")
        }
        const payload = (await response.json()) as SubjectRow[] | null
        if (!active) return
        setSubjects(Array.isArray(payload) ? payload : [])
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error loading subjects"
        toast.error(message)
      } finally {
        if (active) setIsLoadingSubjects(false)
      }
    }
    void loadSubjects()
    return () => {
      active = false
    }
  }, [classId])

  useEffect(() => {
    if (subjectId || subjects.length !== 1) return
    const onlySubject = subjects[0]?.id
    if (!onlySubject) return
    setSubjectId(onlySubject)
  }, [subjects, subjectId])

  useEffect(() => {
    if (!subjectId) {
      setModules([])
      setModuleId("")
      setSections([])
      setSectionId("")
      setIsLoadingModules(false)
      return
    }

    let active = true
    const loadModules = async () => {
      setIsLoadingModules(true)
      try {
        const response = await fetch(`/api/teacher/subjects/${subjectId}/modules`, {
          cache: "no-store",
        })
        if (!response.ok) {
          const failure = await response.text()
          throw new Error(failure || "Unable to load modules for this subject")
        }
        const payload = (await response.json()) as ModuleRow[] | null
        if (!active) return
        setModules(Array.isArray(payload) ? payload : [])
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error loading modules"
        toast.error(message)
      } finally {
        if (active) setIsLoadingModules(false)
      }
    }
    void loadModules()
    return () => {
      active = false
    }
  }, [subjectId])

  useEffect(() => {
    if (!moduleId) {
      setSections([])
      setSectionId("")
      setIsLoadingSections(false)
      return
    }

    let active = true
    const loadSections = async () => {
      setIsLoadingSections(true)
      try {
        const response = await fetch(`/api/teacher/modules/${moduleId}/sections`, {
          cache: "no-store",
        })
        if (!response.ok) {
          const failure = await response.text()
          throw new Error(failure || "Unable to load sections for this module")
        }
        const payload = (await response.json()) as SectionRow[] | null
        if (!active) return
        setSections(Array.isArray(payload) ? payload : [])
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error loading sections"
        toast.error(message)
      } finally {
        if (active) setIsLoadingSections(false)
      }
    }
    void loadSections()
    return () => {
      active = false
    }
  }, [moduleId])

  useEffect(() => {
    if (!sectionId) {
      setTopicHierarchy("")
      setKeyConcepts("")
      setIsLoadingHierarchy(false)
      return
    }

    let isActive = true
    const controller = new AbortController()

    const fetchHierarchy = async () => {
      setIsLoadingHierarchy(true)
      try {
        const response = await fetch(
          `/api/teacher/sections/${sectionId}/topic-hierarchy`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        )
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load topic hierarchy")
        }
        if (!isActive) return
        setTopicHierarchy(data?.hierarchy ?? "")
        setKeyConcepts(data?.key_concepts ?? "")
      } catch (error) {
        if (controller.signal.aborted) return
        const message =
          error instanceof Error
            ? error.message
            : "Unable to fetch topic hierarchy"
        toast.error(message)
      } finally {
        if (isActive) {
          setIsLoadingHierarchy(false)
        }
      }
    }

    void fetchHierarchy()

    return () => {
      isActive = false
      controller.abort()
    }
  }, [sectionId])

  useEffect(() => {
    if (!onContextChange) return
    if (classId && subjectId && moduleId && sectionId) {
      onContextChange({
        classId,
        subjectId,
        moduleId,
        sectionId,
      })
    } else {
      onContextChange(null)
    }
  }, [classId, subjectId, moduleId, sectionId, onContextChange])

  const isFormValid = Boolean(classId && subjectId && moduleId && sectionId)

  const handleSave = async () => {
    if (!isFormValid) {
      toast.error("Select a class, subject, module and section before saving.")
      return
    }
    const minutesValue = timeAvailableMinutes.trim()
    const parsedMinutes =
      minutesValue && !Number.isNaN(Number(minutesValue))
        ? Number(minutesValue)
        : null
    if (minutesValue && parsedMinutes === null) {
      toast.error("Enter a valid number for time available.")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        module_id: moduleId,
        section_id: sectionId,
        struggling_concepts: strugglingConcepts.trim(),
        topic_hierarchy_covered_so_far: keyConcepts.trim() || null,
        time_available_minutes: parsedMinutes,
      }

      const response = await fetch("/api/teacher/lecture-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to save lecture plan")
      }

      const data = await response.json()
      console.info("Lecture planning AI response", data.lesson_plan ?? data.ai_response)
      toast.success("The AI-generated lesson plan is now ready. Kindly review the updated plan below.")
      onPlanSaved?.()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save planning snapshot"
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const classHelper = isLoadingClasses
    ? "Refreshing your assigned classes…"
    : classes.length
    ? `Showing ${classes.length} ${classes.length === 1 ? "class" : "classes"} you teach.`
    : "No classes assigned yet. Contact your admin if this seems wrong."

  const subjectHelper = !classId
    ? "Pick a class to load its subjects."
    : isLoadingSubjects
    ? "Loading subjects for this class…"
    : subjects.length
    ? `${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"} available.`
    : "No subjects assigned for this class."

  const moduleHelper = !subjectId
    ? "Choose a subject to load modules."
    : isLoadingModules
    ? "Loading modules…"
    : modules.length
    ? `${modules.length} module${modules.length === 1 ? "" : "s"} found.`
    : "No modules published for this subject."

  const sectionHelper = !moduleId
    ? "Select a module to show sections."
    : isLoadingSections
    ? "Loading sections…"
    : sections.length
    ? `${sections.length} section${sections.length === 1 ? "" : "s"} ready.`
    : "No sections available for this module yet."

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2">
        {/* <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
          Lecture Planning
        </div> */}
        <h2 className="text-2xl font-semibold text-slate-900">Teacher co-pilot</h2>
        <p className="text-sm text-slate-600">
          Pick the class, subject, module, and section you want to focus on. Document the
          what your students are struggling with and how far the topic hierarchy has progressed.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Class</Label>
          <Select
            value={classId}
            onValueChange={(value) => {
              setClassId(value)
              setSubjectId("")
              setModuleId("")
              setSectionId("")
              setModules([])
              setSections([])
              setTopicHierarchy("")
              setKeyConcepts("")
            }}
            disabled={isLoadingClasses}
          >
              <SelectTrigger className="h-11 rounded-xl border border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {buildClassLabel(entry)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{classHelper}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Subject</Label>
          <Select
            value={subjectId}
            onValueChange={(value) => {
              setSubjectId(value)
              setModuleId("")
              setSectionId("")
              setSections([])
              setModules([])
              setTopicHierarchy("")
              setKeyConcepts("")
            }}
            disabled={!classId || isLoadingSubjects}
          >
              <SelectTrigger className="h-11 rounded-xl border border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {safeText(subject.title, subject.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{subjectHelper}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Subject module</Label>
            <Select
            value={moduleId}
            onValueChange={(value) => {
              setModuleId(value)
              setSectionId("")
              setSections([])
              setTopicHierarchy("")
              setKeyConcepts("")
            }}
            disabled={!subjectId || isLoadingModules}
          >
              <SelectTrigger className="h-11 rounded-xl border border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((module) => (
                  <SelectItem key={module.id} value={module.id}>
                    {safeText(module.title, module.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{moduleHelper}</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Module section</Label>
            <Select
              value={sectionId}
              onValueChange={(value) => setSectionId(value)}
              disabled={!moduleId || isLoadingSections}
            >
              <SelectTrigger className="h-11 rounded-xl border border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {safeText(section.title, section.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">{sectionHelper}</p>
          </div>
        </div>

        {sectionId && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">
              Key concepts to be covered (Seperated by semicolon)
            </Label>
            <Textarea
              value={keyConcepts}
              onChange={(event) => setKeyConcepts(event.target.value)}
              placeholder={
                isLoadingHierarchy
                  ? "Loading key concepts for this section…"
                  : "E.g., Place value, Comparing numbers, Rounding"
              }
              rows={2}
            />
            <p className="text-xs text-slate-500">
              Pulled from section topics. Adjust if you want to emphasize specific concepts.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">
            Struggling concepts (optional)
          </Label>
          <Textarea
            value={strugglingConcepts}
            onChange={(event) => setStrugglingConcepts(event.target.value)}
            placeholder="List concepts, keywords, or misconceptions the students are grappling with."
            rows={3}
          />
          <p className="text-xs text-slate-500">
            Jot down anything that seems unclear to learners. Separate by commas or newlines.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Time available (minutes)</Label>
          <input
            type="number"
            min={0}
            step={1}
            value={timeAvailableMinutes}
            onChange={(event) => setTimeAvailableMinutes(event.target.value)}
            placeholder="e.g., 45"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-xs focus:border-slate-300 focus:outline-none"
          />
          <p className="text-xs text-slate-500">
            Estimate how many minutes are left in the session so the lesson builder can pace the plan.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-slate-500">
            Save this snapshot to reuse it inside the lesson builder or share with co-teachers.
          </p>
          <Button
            onClick={handleSave}
            disabled={!isFormValid || isSaving}
            className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <span className="inline-flex items-center gap-2">
              {isSaving && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />
              )}
              {isSaving
                ? "AI is generating a lecture plan. Please wait…"
                : "Save planning snapshot"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
