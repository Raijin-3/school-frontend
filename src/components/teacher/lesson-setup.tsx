"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ClipboardList, Sparkles } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const SUBJECTS = ["Math", "Science", "English", "History", "Computer Science"]
const GRADES = ["Year 6", "Year 7", "Year 8", "Year 9", "Year 10"]
const DEFAULT_OBJECTIVES = [
  "Identify equivalent fractions",
  "Use visual models to explain fraction relationships",
  "Simplify fractions with common factors",
  "Compare fractions using benchmarks",
]

type LessonSetupWizardProps = {
  onContinue?: () => void
}

export function LessonSetupWizard({ onContinue }: LessonSetupWizardProps) {
  const [subject, setSubject] = useState<string>("")
  const [grade, setGrade] = useState<string>("")
  const [lessonTitle, setLessonTitle] = useState<string>("Fractions - Equivalent Fractions")
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([
    DEFAULT_OBJECTIVES[0],
    DEFAULT_OBJECTIVES[1],
  ])
  const [customObjective, setCustomObjective] = useState<string>("")
  const [customObjectives, setCustomObjectives] = useState<string[]>([])

  const objectives = useMemo(
    () => [...DEFAULT_OBJECTIVES, ...customObjectives],
    [customObjectives]
  )

  const isComplete =
    Boolean(subject) &&
    Boolean(grade) &&
    lessonTitle.trim().length > 0 &&
    selectedObjectives.length > 0

  const toggleObjective = (value: string) => {
    setSelectedObjectives((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    )
  }

  const addCustomObjective = () => {
    const trimmed = customObjective.trim()
    if (!trimmed) return
    if (!customObjectives.includes(trimmed)) {
      setCustomObjectives((prev) => [...prev, trimmed])
      setSelectedObjectives((prev) => [...prev, trimmed])
    }
    setCustomObjective("")
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
          <div className="font-semibold text-slate-900">1 of 3</div>
          Guided wizard
        </div>
      </div>

      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-2 w-1/3 rounded-full bg-gradient-to-r from-slate-900 to-emerald-500" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
              <SelectValue placeholder="Select subject" />
            </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Class / Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white shadow-xs">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
              <SelectContent>
                {GRADES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">Lesson / Unit</Label>
          <Input
            className="h-11 rounded-xl border-slate-200 bg-white shadow-xs"
            value={lessonTitle}
            onChange={(event) => setLessonTitle(event.target.value)}
            placeholder="Fractions - Equivalent Fractions"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-700">Objectives</Label>
            <span className="text-xs text-slate-500">Select at least one</span>
          </div>

          <div className="space-y-2">
            {objectives.map((objective) => {
              const isChecked = selectedObjectives.includes(objective)
              return (
                <label
                  key={objective}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                    isChecked
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={isChecked}
                    onChange={() => toggleObjective(objective)}
                  />
                  <span>{objective}</span>
                </label>
              )
            })}
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
            <Label className="text-xs font-semibold text-slate-600">Add custom objective (optional)</Label>
            <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                className="h-10 flex-1 rounded-xl border-slate-200 bg-white text-sm shadow-xs"
                placeholder="e.g., Use number lines to compare fractions"
                value={customObjective}
                onChange={(event) => setCustomObjective(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-slate-200 text-sm"
                onClick={addCustomObjective}
              >
                Add objective
              </Button>
            </div>
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
              onContinue?.()
            }
          }}
        >
          Continue to Lesson Builder
        </Button>
      </div>
    </div>
  )
}
