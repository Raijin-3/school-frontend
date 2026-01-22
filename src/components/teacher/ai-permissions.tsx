"use client"

import { useMemo, useState } from "react"
import { ShieldCheck, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

type ToolKey =
  | "aiHint"
  | "aiAdaptiveQuiz"
  | "aiExercise"
  | "aiSubmission"
  | "playground"

const TOOLS: Array<{ key: ToolKey; label: string; description: string }> = [
  { key: "aiHint", label: "AI Hint", description: "Guided hints during practice." },
  { key: "aiAdaptiveQuiz", label: "AI Adaptive Quiz", description: "Adaptive checks on mastery." },
  { key: "aiExercise", label: "AI Exercise", description: "Generate exercises on demand." },
  { key: "aiSubmission", label: "AI Submission", description: "Evaluate submissions with feedback." },
  { key: "playground", label: "Playground", description: "Open sandbox for exploration." },
]

type AiPermissionsCardProps = {
  onBack?: () => void
  onCreate?: (tools: LessonToolConfig) => void
  isSubmitting?: boolean
}

export type LessonToolConfig = {
  aiHint: boolean
  aiAdaptiveQuiz: boolean
  aiExercise: boolean
  aiSubmission: boolean
  playground: boolean
}

export function AiPermissionsCard({ onBack, onCreate, isSubmitting }: AiPermissionsCardProps) {
  const [enabledTools, setEnabledTools] = useState<ToolKey[]>([
    "aiHint",
    "aiAdaptiveQuiz",
  ])

  const enabledLookup = useMemo(
    () => new Set(enabledTools),
    [enabledTools]
  )

  const toggle = (key: ToolKey) => {
    setEnabledTools((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    )
  }

  const buildConfig = (): LessonToolConfig => ({
    aiHint: enabledLookup.has("aiHint"),
    aiAdaptiveQuiz: enabledLookup.has("aiAdaptiveQuiz"),
    aiExercise: enabledLookup.has("aiExercise"),
    aiSubmission: enabledLookup.has("aiSubmission"),
    playground: enabledLookup.has("playground"),
  })

  return (
    <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-slate-900 bg-white p-6 shadow-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        Step 2: Choose AI Tools
      </div>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Lesson Enhancements</h2>
      <p className="mt-1 text-sm text-slate-600">Toggle the AI tools you want active for this lesson.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {TOOLS.map((tool) => {
          const isActive = enabledLookup.has(tool.key)
          return (
            <button
              key={tool.key}
              type="button"
              onClick={() => toggle(tool.key)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                isActive
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                {tool.label}
              </div>
              <div className="mt-1 text-xs text-slate-600">{tool.description}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-xl border-slate-200 text-sm"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="button"
          className="h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
          onClick={() => onCreate?.(buildConfig())}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create lesson"}
        </Button>
      </div>
    </div>
  )
}
