"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, ClipboardList, Sparkles } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type ClassRow = {
  id: string
  name: string
}

type SubjectRow = {
  id: string
  title: string
  course_id: string
}

type ModuleRow = {
  id: string
  title: string
  subject_id: string
}

type SectionRow = {
  id: string
  title: string
  module_id: string
}

export type LessonSetupSelection = {
  classId: string
  subjectId: string
  moduleId: string
  sectionId: string
  dueAt?: string | null
}

type LessonSetupWizardProps = {
  onContinue?: (selection: LessonSetupSelection) => void
}

export function LessonSetupWizard({ onContinue }: LessonSetupWizardProps) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [sections, setSections] = useState<SectionRow[]>([])
  const [classId, setClassId] = useState<string>("")
  const [subjectId, setSubjectId] = useState<string>("")
  const [moduleId, setModuleId] = useState<string>("")
  const [sectionId, setSectionId] = useState<string>("")
  const [dueAt, setDueAt] = useState<string>("")

  const isComplete = Boolean(classId && subjectId && moduleId && sectionId)

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const res = await fetch("/api/teacher/classes")
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text)
        }
        const data = await res.json()
        setClasses(data || [])
      } catch (error: any) {
        toast.error(`Failed to load classes: ${error.message || "Unknown error"}`)
      }
    }
    loadClasses()
  }, [])

  useEffect(() => {
    if (!classId) {
      setSubjects([])
      setSubjectId("")
      setModules([])
      setModuleId("")
      setSections([])
      setSectionId("")
      return
    }

    const loadSubjects = async () => {
      try {
        const res = await fetch(`/api/teacher/classes/${classId}/subjects`)
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text)
        }
        const data = await res.json()
        setSubjects(data || [])
      } catch (error: any) {
        toast.error(`Failed to load subjects: ${error.message || "Unknown error"}`)
      }
    }

    loadSubjects()
  }, [classId])

  useEffect(() => {
    if (!subjectId) {
      setModules([])
      setModuleId("")
      setSections([])
      setSectionId("")
      return
    }

    const loadModules = async () => {
      try {
        const res = await fetch(`/api/teacher/subjects/${subjectId}/modules`)
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text)
        }
        const data = await res.json()
        setModules(data || [])
      } catch (error: any) {
        toast.error(`Failed to load modules: ${error.message || "Unknown error"}`)
      }
    }

    loadModules()
  }, [subjectId])

  useEffect(() => {
    if (!moduleId) {
      setSections([])
      setSectionId("")
      return
    }

    const loadSections = async () => {
      try {
        const res = await fetch(`/api/teacher/modules/${moduleId}/sections`)
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text)
        }
        const data = await res.json()
        setSections(data || [])
      } catch (error: any) {
        toast.error(`Failed to load sections: ${error.message || "Unknown error"}`)
      }
    }

    loadSections()
  }, [moduleId])

  return (
    <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-slate-900 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            <ClipboardList className="h-3.5 w-3.5" />
            Lesson Setup
          </div>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Step 1: Select Context</h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete the required details before moving to the next step.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs text-slate-600">
          <div className="font-semibold text-slate-900">1 of 2</div>
          Guided wizard
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-2 w-1/2 rounded-full bg-gradient-to-r from-slate-900 to-emerald-500" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
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
              }}
            >
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Subject</Label>
            <Select
              value={subjectId}
              onValueChange={(value) => {
                setSubjectId(value)
                setModuleId("")
                setSectionId("")
              }}
              disabled={!classId}
            >
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Module</Label>
            <Select
              value={moduleId}
              onValueChange={(value) => {
                setModuleId(value)
                setSectionId("")
              }}
              disabled={!subjectId}
            >
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((module) => (
                  <SelectItem key={module.id} value={module.id}>
                    {module.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Section</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={!moduleId}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Due date</Label>
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-xs focus:border-slate-300 focus:outline-none"
            />
            <p className="text-xs text-slate-500">Optional. Leave blank for no due date.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          The next step unlocks AI lesson building and materials.
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className={`h-4 w-4 ${isComplete ? "text-emerald-600" : "text-slate-300"}`} />
          {isComplete ? "All required fields completed." : "Complete all required fields to continue."}
        </div>
        <Button
          type="button"
          className="h-11 rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          disabled={!isComplete}
          onClick={() => {
            if (isComplete) {
              onContinue?.({ classId, subjectId, moduleId, sectionId, dueAt: dueAt || null })
            }
          }}
        >
          Continue to Lesson Builder
        </Button>
      </div>
    </div>
  )
}
