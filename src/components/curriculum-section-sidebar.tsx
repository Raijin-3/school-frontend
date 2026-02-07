"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { getNotificationMessage, NotificationPayload } from "@/lib/notification-message"

export type CurriculumSidebarNotification = NotificationPayload & {
  id: string
  section_id?: string | null
  created_at?: string | null
}

export function CurriculumSectionSidebar({
  courseId,
  subjectId,
  sectionId,
  modules,
  notifications,
}: {
  courseId: string
  subjectId: string
  sectionId: string
  modules: Array<{
    id: string
    title: string
    sections?: Array<{ id: string; title: string }>
    slug?: string
  }>
  notifications: CurriculumSidebarNotification[]
}) {
  const [activeTab, setActiveTab] = useState("content")
  const hasNotifications = notifications.length > 0

  const sectionTitles = useMemo(() => {
    const map: Record<string, string> = {}
    for (const module of modules) {
      for (const section of module.sections || []) {
        map[section.id] = section.title
      }
    }
    return map
  }, [modules])

  const orderedModules = modules
  const sectionNotifications = notifications.filter((notif) => notif.section_id === sectionId)
  const otherNotifications = notifications.filter((notif) => notif.section_id !== sectionId)

  return (
    <div className="rounded-xl border border-border bg-white/70 p-4 backdrop-blur md:sticky md:top-16 md:h-[calc(100dvh-8rem)] md:overflow-auto">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>Course content</span>
        {hasNotifications && (
          <button
            type="button"
            className={`text-xs font-semibold uppercase tracking-widest text-indigo-600`}
            onClick={() => setActiveTab("notifications")}
          >
            View notifications
          </button>
        )}
      </div>
      <div className="mt-3">
        <div className="flex gap-2 border-b border-border text-xs font-semibold uppercase tracking-[0.2em]">
          <button
            type="button"
            className={`px-3 py-1 ${activeTab === "content" ? "border-b-2 border-indigo-500 text-indigo-600" : "text-gray-500"}`}
            onClick={() => setActiveTab("content")}
          >
            Lessons
          </button>
          {hasNotifications && (
            <button
              type="button"
              className={`px-3 py-1 ${activeTab === "notifications" ? "border-b-2 border-indigo-500 text-indigo-600" : "text-gray-500"}`}
              onClick={() => setActiveTab("notifications")}
            >
              Notification by teacher
            </button>
          )}
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {activeTab === "content" && (
            <div className="space-y-2">
              {orderedModules.map((m, mi) => (
                <details key={m.id || mi} className="border border-border rounded-md" open={mi === 0}>
                  <summary className="px-3 py-2 font-medium cursor-pointer select-none">{m.title}</summary>
                  <div className="px-3 pb-2 space-y-1">
                    {(m.sections || []).map((s) => (
                      <Link
                        key={s.id}
                        href={`/curriculum/${courseId}/${subjectId}/${s.id}/lecture`}
                        className={`block rounded px-2 py-1 text-xs hover:bg-black/5 ${s.id === sectionId ? "bg-black/5" : ""}`}
                      >
                        {s.title}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
          {activeTab === "notifications" && (
            <div className="space-y-3">
              {sectionNotifications.length === 0 && otherNotifications.length === 0 && (
                <p className="text-xs text-gray-500">No notifications yet.</p>
              )}
              {[...sectionNotifications, ...otherNotifications].map((notif) => (
                <div key={notif.id} className="border border-dashed border-gray-200 rounded-lg p-3 bg-white/70">
                  <p className="text-xs font-semibold text-gray-900">
                    {notif.action_label ?? "Teacher update"}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {getNotificationMessage(notif as any) || ""}
                  </p>
                  {notif.section_id && (
                    <p className="text-[10px] uppercase text-gray-400 mt-2">
                      Section: {sectionTitles[notif.section_id] ?? notif.section_id}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {notif.created_at ? new Date(notif.created_at).toLocaleString() : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
