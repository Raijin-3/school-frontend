"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LessonSetupWizard, type LessonSetupSelection } from "@/components/teacher/lesson-setup"
import { AiPermissionsCard, type LessonToolConfig } from "@/components/teacher/ai-permissions"

type WizardStep = 1 | 2

type LessonWizardProps = {
  onContextChange?: (context: { classId: string; subjectId: string } | null) => void
}

export function LessonWizard({ onContextChange }: LessonWizardProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [selection, setSelection] = useState<LessonSetupSelection | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createLesson = async (tools: LessonToolConfig) => {
    if (!selection) {
      toast.error("Complete lesson setup before creating the lesson.")
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/teacher/lesson-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: selection.classId,
          subject_id: selection.subjectId,
          module_id: selection.moduleId,
          section_id: selection.sectionId,
          due_at: selection.dueAt ?? null,
          trigger_type: "manual",
          trigger_config: tools,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }

      toast.success("Lesson created")
      setSelection(null)
      setStep(1)
    } catch (error: any) {
      toast.error(`Failed to create lesson: ${error.message || "Unknown error"}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      {step === 1 && (
        <LessonSetupWizard
          onContinue={(nextSelection) => {
            setSelection(nextSelection)
            setStep(2)
          }}
          onContextChange={onContextChange}
        />
      )}
      {step === 2 && (
        <AiPermissionsCard
          onBack={() => setStep(1)}
          onCreate={createLesson}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  )
}
