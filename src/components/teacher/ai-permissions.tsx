"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

type PermissionKey = "hints" | "fullAnswers" | "stepByStep" | "beyondLesson"

const PERMISSIONS: Array<{
  key: PermissionKey
  title: string
  description: string
}> = [
  {
    key: "hints",
    title: "Allow hints only",
    description: "Gives nudges without revealing the full answer.",
  },
  {
    key: "fullAnswers",
    title: "Allow full answers",
    description: "Lets the AI provide the final answer when asked.",
  },
  {
    key: "stepByStep",
    title: "Allow step-by-step reasoning",
    description: "Explains how to solve problems in small steps.",
  },
  {
    key: "beyondLesson",
    title: "Allow beyond-lesson questions",
    description: "Permits questions outside the current lesson scope.",
  },
]

type AiPermissionsCardProps = {
  onBack?: () => void
  onContinue?: () => void
}

export function AiPermissionsCard({ onBack, onContinue }: AiPermissionsCardProps) {
  const [settings, setSettings] = useState<Record<PermissionKey, boolean>>({
    hints: true,
    fullAnswers: false,
    stepByStep: true,
    beyondLesson: false,
  })

  const toggle = (key: PermissionKey) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-slate-900 bg-white p-6 shadow-sm">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        Step 2: Define AI Permissions
      </div>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">AI Behavior Settings</h2>
      <p className="mt-1 text-sm text-slate-600">Choose what the AI can and cannot do during this lesson.</p>

      <div className="mt-4 space-y-3">
        {PERMISSIONS.map((permission) => (
          <div
            key={permission.key}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200/70 bg-white px-4 py-3 shadow-xs"
          >
            <div>
              <div className="text-sm font-semibold text-slate-900">{permission.title}</div>
              <div className="text-xs text-slate-600">{permission.description}</div>
            </div>
            <Switch
              checked={settings[permission.key]}
              onCheckedChange={() => toggle(permission.key)}
            />
          </div>
        ))}
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
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
