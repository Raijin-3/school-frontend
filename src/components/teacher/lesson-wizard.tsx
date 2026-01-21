"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Flag, ShieldCheck, Users2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LessonSetupWizard } from "@/components/teacher/lesson-setup"
import { AiPermissionsCard } from "@/components/teacher/ai-permissions"

type WizardStep = 1 | 2 | 3

export function LessonWizard() {
  const [step, setStep] = useState<WizardStep>(1)
  const router = useRouter()

  const startSession = () => {
    const id = `CLS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    router.push(`/teacher/session?sessionId=${id}`)
  }

  return (
    <div className="space-y-5">
      {step === 1 && <LessonSetupWizard onContinue={() => setStep(2)} />}
      {step === 2 && (
        <AiPermissionsCard onBack={() => setStep(1)} onContinue={() => setStep(3)} />
      )}
      {step === 3 && (
        <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-slate-900 bg-white p-6 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-100">
            <Flag className="h-3.5 w-3.5 text-emerald-600" />
            Step 3: Start Session
          </div>
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Start Classroom AI Session</h2>
          <p className="mt-1 text-sm text-slate-600">
            Launch a live session for this class. Students join using the session code.
          </p>

          <div className="mt-4 space-y-2 text-sm text-slate-700">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Scope locks to lesson context and permissions
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Users2 className="h-4 w-4 text-emerald-600" />
              Student access stays within this session
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl border-slate-200 text-sm"
              onClick={() => setStep(2)}
            >
              Back
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={startSession}
            >
              Start Classroom AI Session
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
