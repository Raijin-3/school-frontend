"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, ClipboardList, Sparkles, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  keyconcept?: string[] | null
}

const KEY_CONCEPT_EXAMPLES = [
  "Limits & continuity",
  "Solving linear equations",
  "Photosynthesis overview",
  "Probability & chance",
  "Writing argumentative claims",
]
const CREATE_SECTION_VALUE = "__create_new_section__"

function normalizeKeyConcepts(value?: SectionRow["keyconcept"] | string | null): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  if (typeof value === "string") {
    return value
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }
  return []
}

function buildSectionTitlePrefix(sectionTitle?: string) {
  const trimmed = sectionTitle?.trim()
  return trimmed ? `${trimmed} - ` : ""
}

function buildDisplayKeyConcepts(prefix: string, concepts: string[]) {
  const body = concepts.join("; ")
  if (!prefix) return body
  if (!body) return prefix
  return `${prefix}${body}`
}

function ensurePrefixedWithSectionTitle(value: string, sectionTitle?: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return ""
  const prefix = buildSectionTitlePrefix(sectionTitle)
  if (!prefix) return trimmedValue
  return trimmedValue.startsWith(prefix) ? trimmedValue : `${prefix}${trimmedValue}`
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
  onContextChange?: (context: { classId: string; subjectId: string } | null) => void
  assignedSectionIds?: string[]
}

export function LessonSetupWizard({
  onContinue,
  onContextChange,
  assignedSectionIds,
}: LessonSetupWizardProps) {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [sections, setSections] = useState<SectionRow[]>([])
  const [classId, setClassId] = useState<string>("")
  const [subjectId, setSubjectId] = useState<string>("")
  const [moduleId, setModuleId] = useState<string>("")
  const [sectionId, setSectionId] = useState<string>("")
  const [dueAt, setDueAt] = useState<string>("")
  const [sectionMode, setSectionMode] = useState<"existing" | "custom">("existing")
  const [customSectionName, setCustomSectionName] = useState<string>("")
  const [isCreatingSection, setIsCreatingSection] = useState<boolean>(false)
  const [isSectionListOpen, setIsSectionListOpen] = useState(false)
  const [deletingSectionIds, setDeletingSectionIds] = useState<Set<string>>(new Set())
  const [sectionKeyConceptInput, setSectionKeyConceptInput] = useState<string>("")
  const [isSavingKeyConcept, setIsSavingKeyConcept] = useState(false)

  const trimmedCustomSectionName = customSectionName.trim()
  const hasCustomSectionName = trimmedCustomSectionName.length > 0
  const hasValidSectionSelection =
    (sectionMode === "existing" && Boolean(sectionId)) ||
    (sectionMode === "custom" && hasCustomSectionName)
  const assignedSectionIdsSet = useMemo(
    () => new Set(assignedSectionIds ?? []),
    [assignedSectionIds],
  )
  const isSectionAlreadyAssigned =
    sectionMode === "existing" &&
    sectionId &&
    assignedSectionIdsSet.has(sectionId)
  const isComplete =
    Boolean(classId && subjectId && moduleId && hasValidSectionSelection) &&
    !isSectionAlreadyAssigned
  const activeModuleTitle =
    modules.find((module) => module.id === moduleId)?.title ?? "Selected module"

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

  useEffect(() => {
    setIsSectionListOpen(false)
  }, [moduleId])

  useEffect(() => {
    if (!onContextChange) return
    if (classId && subjectId) {
      onContextChange({
        classId,
        subjectId,
        moduleId: moduleId || undefined,
      })
    } else {
      onContextChange(null)
    }
  }, [classId, subjectId, moduleId, onContextChange])

  useEffect(() => {
    if (sectionMode !== "existing" || !sectionId) {
      setSectionKeyConceptInput("")
      return
    }
    const section = sections.find((item) => item.id === sectionId)
    const fallbackValues = normalizeKeyConcepts(section?.keyconcept)
    const prefix = buildSectionTitlePrefix(section?.title)
    let fallbackDisplay = fallbackValues.join("; ")
    if (fallbackDisplay && prefix && !fallbackDisplay.startsWith(prefix)) {
      fallbackDisplay = buildDisplayKeyConcepts(prefix, fallbackValues)
    }
    setSectionKeyConceptInput(fallbackDisplay)

    let isActive = true
    const loadKeyConcepts = async () => {
      try {
        const response = await fetch(`/api/teacher/sections/${sectionId}/keyconcept`)
        if (!response.ok) {
          const error = await response.text()
          throw new Error(error || "Failed to load key concepts")
        }
        const payload = (await response.json()) as {
          keyconcept?: string[] | string | null
        }
        const values = normalizeKeyConcepts(payload?.keyconcept ?? [])
        if (isActive) {
          let display = values.join("; ")
          if (display && prefix && !display.startsWith(prefix)) {
            display = buildDisplayKeyConcepts(prefix, values)
          }
          setSectionKeyConceptInput(display)
        }
      } catch (error) {
        console.error("Failed to fetch key concepts for section:", error)
      }
    }
    loadKeyConcepts()
    return () => {
      isActive = false
    }
  }, [sectionId, sectionMode, sections])

  const enterCustomMode = () => {
    setSectionMode("custom")
    setSectionId("")
    setCustomSectionName("")
    setSectionKeyConceptInput("")
  }

  const exitCustomMode = () => {
    setSectionMode("existing")
    setCustomSectionName("")
    setSectionKeyConceptInput("")
  }

  const createSection = async (title: string): Promise<SectionRow | null> => {
    if (!moduleId) {
      toast.error("Select a module before adding a section.")
      return null
    }
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      toast.error("Enter a key concept or section name.")
      return null
    }
    setCustomSectionName(normalizedTitle)
    const existing = sections.find(
      (section) =>
        section.title?.trim().toLowerCase() === normalizedTitle.toLowerCase(),
    )
    if (existing) {
      setSectionId(existing.id)
      return existing
    }
    setIsCreatingSection(true)
    try {
      const response = await fetch(
        `/api/teacher/modules/${moduleId}/sections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: normalizedTitle }),
        },
      )
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || "Failed to create section")
      }
      const createdSection = (await response.json()) as SectionRow
      setSections((prev) => [
        createdSection,
        ...prev.filter((section) => section.id !== createdSection.id),
      ])
      setSectionId(createdSection.id)
      setSectionMode("existing")
      setCustomSectionName("")
      toast.success(`Section "${createdSection.title}" has been saved.`)
      return createdSection
    } catch (error: any) {
      toast.error(
        `Failed to create section: ${error?.message || "Unknown error"}`,
      )
      return null
    } finally {
      setIsCreatingSection(false)
    }
  }

  const handleCreateSectionFromInput = () => {
    if (!hasCustomSectionName) {
      toast.error("Enter a key concept or section name.")
      return
    }
    void createSection(trimmedCustomSectionName)
  }

  const handleQuickExample = (example: string) => {
    setCustomSectionName(example)
    void createSection(example)
  }

  const markSectionDeleting = (sectionIdToUpdate: string, deleting: boolean) => {
    setDeletingSectionIds((prev) => {
      const next = new Set(prev)
      if (deleting) {
        next.add(sectionIdToUpdate)
      } else {
        next.delete(sectionIdToUpdate)
      }
      return next
    })
  }

  const handleDeleteSection = async (section: SectionRow) => {
    if (!moduleId || deletingSectionIds.has(section.id)) return
    if (!confirm(`Delete section "${section.title}"? This cannot be undone.`)) {
      return
    }
    markSectionDeleting(section.id, true)
    try {
      const response = await fetch(
        `/api/teacher/modules/${moduleId}/sections/${section.id}`,
        {
          method: "DELETE",
        },
      )
      if (!response.ok) {
        const errorText = (await response.text()) || "Failed to delete section"
        throw new Error(errorText)
      }
      setSections((prev) => prev.filter((item) => item.id !== section.id))
      if (sectionId === section.id) {
        setSectionId("")
        setSectionMode("existing")
      }
      toast.success(`Section "${section.title}" deleted`)
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete section")
    } finally {
      markSectionDeleting(section.id, false)
    }
  }

  const renderExampleButtons = () => (
    <div className="flex flex-wrap gap-2">
      {KEY_CONCEPT_EXAMPLES.map((example) => (
        <Button
          key={example}
          variant="outline"
          size="sm"
          className="rounded-full px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
          onClick={() => handleQuickExample(example)}
          disabled={!moduleId || isCreatingSection}
        >
          {example}
        </Button>
      ))}
    </div>
  )

  const handleSaveKeyConcepts = async () => {
    if (!moduleId || !sectionId) return
    const section = sections.find((item) => item.id === sectionId)
    const finalValue = ensurePrefixedWithSectionTitle(
      sectionKeyConceptInput,
      section?.title,
    )
    const values = finalValue ? [finalValue] : [] // store as single entry
    setIsSavingKeyConcept(true)
    try {
      const response = await fetch(
        `/api/teacher/modules/${moduleId}/sections/${sectionId}/key-concept`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyconcept: values }),
        },
      )
      if (!response.ok) {
        const errorText = (await response.text()) || "Failed to save key concepts"
        throw new Error(errorText)
      }
      setSections((prev) =>
        prev.map((section) =>
          section.id === sectionId ? { ...section, keyconcept: values } : section,
        ),
      )
      toast.success("Key concepts saved")
    } catch (error: any) {
      toast.error(error?.message || "Failed to save key concepts")
    } finally {
      setIsSavingKeyConcept(false)
    }
  }

  const handleContinue = async () => {
    if (!classId || !subjectId || !moduleId) return
    let resolvedSectionId = sectionId
    if (sectionMode === "custom" && !resolvedSectionId && hasCustomSectionName) {
      const created = await createSection(trimmedCustomSectionName)
      if (!created?.id) {
        return
      }
      resolvedSectionId = created.id
    }

    if (!resolvedSectionId) return
    if (
      sectionMode === "existing" &&
      assignedSectionIdsSet.has(resolvedSectionId)
    ) {
      toast.error(
        "This section already has a lesson assigned for the selected class and subject.",
      )
      return
    }
    onContinue?.({
      classId,
      subjectId,
      moduleId,
      sectionId: resolvedSectionId,
      dueAt: dueAt || null,
    })
  }

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
                setCustomSectionName("")
                setSectionMode("existing")
                setSectionKeyConceptInput("")
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
                setCustomSectionName("")
                setSectionMode("existing")
                setSectionKeyConceptInput("")
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
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold text-slate-700">Module</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSectionListOpen(true)}
              disabled={!moduleId}
              className="rounded-full px-3 tracking-wide text-slate-600"
            >
              All sections
            </Button>
          </div>
            <Select
              value={moduleId}
              onValueChange={(value) => {
                setModuleId(value)
                setSectionId("")
                setCustomSectionName("")
                setSectionMode("existing")
                setSectionKeyConceptInput("")
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
            <Label className="text-sm font-semibold text-slate-700">
              Key concept or section
            </Label>
            {sectionMode === "existing" ? (
              <>
                <Select
                  value={sectionId}
                  onValueChange={(value) => {
                    if (value === CREATE_SECTION_VALUE) {
                      enterCustomMode()
                      return
                    }
                    setSectionId(value)
                    setSectionMode("existing")
                    setCustomSectionName("")
                  }}
                  disabled={!moduleId}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.title}
                      </SelectItem>
                    ))}
                    {/* {moduleId && (
                      <SelectItem
                        value={CREATE_SECTION_VALUE}
                        className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        + Type new key concept
                      </SelectItem>
                    )} */}
                  </SelectContent>
                </Select>
                {isSectionAlreadyAssigned && (
                  <p className="text-xs text-rose-500">
                    This section already has a lesson assigned for the selected class and subject.
                  </p>
                )}
                {!moduleId ? (
                  <p className="text-xs text-slate-500">
                    Select a module to list key concepts.
                  </p>
                ) : sections.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-500">
                    <p>
                      No sections yet for this module. Use "+ Type new key concept" or tap a suggestion below to create one.
                    </p>
                    <div className="mt-3">{renderExampleButtons()}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="relative space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white p-1 text-slate-500 transition hover:text-slate-700"
                  onClick={() => {
                    exitCustomMode()
                  }}
                  aria-label="Show existing sections"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <input
                  type="text"
                  value={customSectionName}
                  onChange={(event) => {
                    setCustomSectionName(event.target.value)
                    setSectionId("")
                  }}
                  disabled={!moduleId}
                  placeholder="e.g., Limits & continuity"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-xs focus:border-slate-300 focus:outline-none disabled:cursor-not-allowed"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-slate-500">
                    Example: {KEY_CONCEPT_EXAMPLES[0]}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-2xl px-4 text-xs font-semibold uppercase tracking-wide"
                    onClick={handleCreateSectionFromInput}
                    disabled={
                      !moduleId || !hasCustomSectionName || isCreatingSection
                    }
                  >
                    Save key concept
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Tap an example below to build a section instantly.
                </p>
                {renderExampleButtons()}
                {!moduleId && (
                  <p className="text-xs text-rose-500">
                    Select a module to record a new key concept.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 keyconp">
            {moduleId && sectionId && sectionMode === "existing" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Key Concept
                </Label>
                <textarea
                  value={sectionKeyConceptInput}
                  onChange={(event) => setSectionKeyConceptInput(event.target.value)}
                  disabled={!sectionId || !moduleId || isSavingKeyConcept}
                  placeholder="Enter key concepts and separate each with a semicolon."
                  className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-xs focus:border-slate-300 focus:outline-none disabled:cursor-not-allowed"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-2xl px-4 text-xs font-semibold uppercase tracking-wide"
                    onClick={handleSaveKeyConcepts}
                    disabled={!sectionId || !moduleId || isSavingKeyConcept}
                  >
                    {isSavingKeyConcept ? "Saving key concepts…" : "Save key concepts"}
                  </Button>
                  <p className="text-xs text-slate-500">
                    Separate each key concept with a semicolon.
                  </p>
                </div>
              </div>
            )}
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
          disabled={!isComplete || isCreatingSection}
          onClick={handleContinue}
        >
          Continue to Lesson Builder
        </Button>
      </div>

      <Dialog open={isSectionListOpen} onOpenChange={setIsSectionListOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{activeModuleTitle} sections</DialogTitle>
            <DialogDescription>
              Review or remove sections for the module you selected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {sections.length === 0 ? (
              <p className="text-sm text-slate-500">
                No sections have been created for this module yet.
              </p>
            ) : (
              sections.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600"
                >
                  <span className="font-medium text-slate-900">{section.title}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSection(section)}
                    disabled={deletingSectionIds.has(section.id)}
                  >
                    {deletingSectionIds.has(section.id) ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsSectionListOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
