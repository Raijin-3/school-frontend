"use client"

import { Activity, ClipboardList } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LessonWizard } from "@/components/teacher/lesson-wizard"
import { ActiveSessionView } from "@/components/teacher/active-session-view"

export function TeacherWorkbenchTabs() {
  return (
    <div className="space-y-3">
      <Tabs defaultValue="lesson" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-white/80 p-2 shadow-sm">
          <TabsTrigger
            value="lesson"
            className="flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 data-[state=active]:text-emerald-700"
          >
            <ClipboardList className="h-4 w-4" />
            Lesson Setup
          </TabsTrigger>
          <TabsTrigger
            value="session"
            className="flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold text-slate-700 data-[state=active]:text-emerald-700"
          >
            <Activity className="h-4 w-4" />
            Active Session
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lesson" className="mt-3">
          <LessonWizard />
        </TabsContent>
        <TabsContent value="session" className="mt-3">
          <ActiveSessionView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
