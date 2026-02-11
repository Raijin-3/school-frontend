"use client"

import { Bell } from "lucide-react"
import { type ChildNotification, useParentDashboardContext } from "@/components/parent/parent-dashboard-context"
import { formatNotificationTime } from "@/lib/notification-utils"

export default function NotificationsPage() {
  const { childData } = useParentDashboardContext()
  const { notifications } = childData

  const getNotificationKey = (notification: ChildNotification, index: number) => {
    if (notification.id) {
      return notification.id
    }
    const fallbackParts = [
      notification.title,
      notification.due,
      notification.timestamp,
      notification.detail,
    ]
      .filter(Boolean)
      .join("-")
    return `${fallbackParts || "notification"}-${index}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-4 lg:py-4">
        <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl shadow-slate-200/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Parent Panel • Notifications
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Exam alerts, homework nudges & school news</h1>
              <p className="mt-1 text-sm text-slate-500">
                Recent notifications aggregated from teachers and school leaders.
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-2 text-sm font-semibold text-indigo-600">
              Synced moments ago
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Exam updates</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Critical</span>
          </div>
          <div className="mt-5 space-y-3">
            {notifications.examUpdates.map((item, index) => (
              <article
                key={getNotificationKey(item, index)}
                className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <span className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600">{item.status ?? "New"}</span>
                </div>
                {item.due && <p className="text-xs uppercase tracking-wider text-slate-500">{item.due}</p>}
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Homework alerts</h2>
            <span className="text-xs uppercase tracking-wider text-slate-500">Stay ahead</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {notifications.homeworkAlerts.map((alert, index) => (
              <article
                key={getNotificationKey(alert, index)}
                className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/90 p-4 text-sm text-slate-600"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500">
                  <span>{alert.title}</span>
                  <span className="font-semibold text-slate-700">{alert.due ?? "Soon"}</span>
                </div>
                <p>{alert.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/70 bg-gradient-to-br from-indigo-600 to-slate-900 p-6 text-white shadow-xl shadow-indigo-500/40 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Teacher announcements</h2>
            <span className="text-xs uppercase tracking-wider text-white/70">Important</span>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            {notifications.announcements.map((announcement, index) => {
              const announcementDateLabel = formatNotificationTime(
                announcement.timestamp ?? announcement.metadata?.classTiming ?? undefined,
              )
              return (
                <article
                  key={getNotificationKey(announcement, index)}
                  className="flex items-start gap-4 rounded-2xl border border-white/30 bg-white/10 p-4"
                >
                  <div className="mt-0.5 text-white/80">
                    {announcement.icon ? (
                      <announcement.icon className="h-6 w-6" />
                    ) : (
                      <Bell className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-xm">{announcement.title}</p>
                    <p className="text-xm text-white/70">{announcement.detail}</p>
                    {announcementDateLabel && (
                      <p className="text-[0.65rem] uppercase tracking-wider text-white/60">
                        {announcementDateLabel}
                      </p>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
