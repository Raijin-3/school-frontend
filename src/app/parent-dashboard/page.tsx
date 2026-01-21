"use client"

import { CalendarDays, ChartLine, MessageCircle, Bell, Users, CircleCheck, Award, Target, Trophy } from "lucide-react"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

type ParentMenuSection = {
  title: string
  icon: (typeof Users)
  accent: string
  items: string[]
  href?: string
}

const parentMenuSections: ParentMenuSection[] = [
  {
    title: "My Child",
    icon: Users,
    accent: "from-indigo-500 to-purple-500",
    items: ["Basic details", "Class & section", "Class teacher info", "Recent attendance log"],
    href: "/parent-dashboard/my-child",
  },
  {
    title: "Academic Progress",
    icon: ChartLine,
    accent: "from-emerald-500 to-teal-500",
    items: ["Subject-wise report", "Topic completion", "Test scores", "Assignment status"],
    href: "/parent-dashboard/academic-progress",
  },
  {
    title: "Performance Insights",
    icon: Award,
    accent: "from-amber-500 to-orange-500",
    items: ["Strengths", "Weak areas", "Teacher remarks"],
    href: "/parent-dashboard/performance-insights",
  },
  {
    title: "Attendance",
    icon: CalendarDays,
    accent: "from-sky-500 to-blue-600",
    items: ["Daily attendance", "Monthly summary"],
    href: "/parent-dashboard/attendance",
  },
  {
    title: "Teacher Communication",
    icon: MessageCircle,
    accent: "from-fuchsia-500 to-pink-500",
    items: ["Subject teacher list", "Messages & announcements"],
    href: "/parent-dashboard/teacher-communication",
  },
  {
    title: "Notifications",
    icon: Bell,
    accent: "from-rose-500 to-red-500",
    items: ["Exam updates", "Homework alerts", "School announcements"],
    href: "/parent-dashboard/notifications",
  },
]

const parentActions = [
  {
    label: "My Child profile",
    description: "Full child details & teacher updates",
    href: "/parent-dashboard/my-child",
    icon: Users,
    gradientFrom: "from-indigo-500",
    gradientTo: "to-purple-500",
  },
]

export default function ParentDashboardPage() {
  const { childData } = useParentDashboardContext()
  const { profile, todaySubjects, alerts, classDetails, focusAreas, subjectDetails, strengths, weakAreas, teacherRemarks, teacherList, communications, notifications, attendance } = childData
  const subjectProgress = subjectDetails.map((subject) => ({
    subject: subject.subject,
    value: subject.completion,
    focus: subject.focus,
  }))
  const topSubject = subjectDetails[0]
  const topicCompletion = topSubject?.topics ?? []
  const testScores = topSubject?.tests ?? []
  const assignmentStatus = topSubject?.assignments ?? []
  const strengthLabels = strengths.map((item) => item.label)
  const improvementLabels = weakAreas.map((item) => item.label)
  const teacherRemarkTexts = teacherRemarks.map((item) => item.remark)
  const notificationList = [
    ...notifications.examUpdates.map((item) => ({ title: item.title, detail: item.detail, category: "Exam updates" })),
    ...notifications.homeworkAlerts.map((item) => ({ title: item.title, detail: item.detail, category: "Homework alerts" })),
    ...notifications.announcements.map((item) => ({ title: item.title, detail: item.detail, category: "School announcements" })),
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-2xl shadow-slate-200/60 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600/90">
                Parent Panel • Read-only + communication
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
                Track {profile.name}’s learning at a glance
              </h1>
              <p className="mt-1 text-sm text-slate-500 md:text-base">
                Visibility, trust, and timely involvement — everything you need to stay aligned with the classroom and their journey.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-semibold text-indigo-700 shadow-inner">
              <span>Daily check-in</span>
              <span className="text-lg font-bold text-slate-900">Completed</span>
              <span className="text-xs text-slate-500">Latest sync: {profile.lastLogin}</span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-600">Child overview</p>
                <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-semibold text-indigo-700">{profile.avatar}</div>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <DetailRow label="Class" value={profile.grade} />
              <DetailRow label="Roll" value={profile.roll} />
              <DetailRow label="Class Teacher" value={profile.teacher} />
              <DetailRow label="Status" value={profile.overall} valueClass="text-emerald-600" />
            </dl>
            <p className="mt-4 text-sm text-slate-500">{profile.focus}</p>
          </article>

          <article className="rounded-3xl border border-white/60 bg-indigo-950/80 p-5 text-white shadow-lg shadow-slate-900/30 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Today’s subjects</h2>
              <span className="text-xs uppercase tracking-wide text-indigo-200">Live</span>
            </div>
            <div className="mt-4 space-y-4">
              {todaySubjects.map((subject) => (
                <div key={subject.name} className="rounded-2xl border border-white/10 bg-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{subject.name}</h3>
                    <span className="text-xs font-semibold text-indigo-200">{subject.status}</span>
                  </div>
                  <p className="text-sm text-indigo-100">{subject.teacher}</p>
                  <p className="text-xs text-indigo-300">{subject.mood}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Alerts & messages</p>
                <h2 className="text-lg font-bold text-slate-900">Need attention</h2>
              </div>
              <span className="text-xs uppercase tracking-wide text-slate-500">Sync every 4h</span>
            </div>
            <div className="mt-4 space-y-3">
              {alerts.map((alert) => (
                <div key={alert.title} className="rounded-2xl border border-slate-200/60 bg-slate-50/80 p-3">
                  <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                  <p className="text-xs text-slate-500">{alert.detail}</p>
                  <p className="mt-1 text-xs font-semibold text-indigo-600">{alert.time}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Parent menu</p>
              <h2 className="text-2xl font-bold text-slate-900">Everything is organized by intent</h2>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500">Read-only • Trusted</span>
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {parentMenuSections.map((section) => (
              <ParentMenuCard key={section.title} section={section} />
            ))}
            {/* <div className="flex items-center justify-end rounded-3xl border border-dashed border-slate-300 bg-white/80 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-xl">
              <a href="/parent-dashboard/my-child" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow">
                View My Child details
                <span aria-hidden="true">→</span>
              </a>
            </div> */}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Subject-wise progress</h3>
              <span className="text-xs uppercase tracking-wider text-slate-500">Updated today</span>
            </div>
            <div className="mt-5 space-y-5">
              {subjectProgress.map((subject) => (
                <div key={subject.subject}>
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-semibold text-slate-700">{subject.subject}</p>
                    <span className="text-xs text-slate-500">{subject.focus}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style={{ width: `${subject.value}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{subject.value}% completion</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-slate-900">Topic completion & assessments</h3>
            <div className="mt-5 space-y-4 text-sm text-slate-600">
              {topicCompletion.map((topic) => (
                <div key={topic.topic} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{topic.topic}</p>
                      <p className="text-xs text-slate-500">
                        {topic.completed}/{topic.total} modules complete
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{topic.confidence}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${(topic.completed / topic.total) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Test scores</p>
                <div className="mt-2 space-y-2">
                  {testScores.map((test) => (
                    <div key={test.name} className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800">{test.name}</p>
                      <div className="text-xs text-slate-500">
                        {test.score} <span className="text-emerald-600">{test.trend}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Assignment status</p>
                <div className="mt-2 space-y-2">
                  {assignmentStatus.map((assignment) => (
                    <div key={assignment.title} className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{assignment.title}</p>
                        <p className="text-xs text-slate-500">{assignment.detail}</p>
                      </div>
                      <span className="text-xs font-semibold text-indigo-600">{assignment.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Performance insights</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <InsightCard title="Strengths" items={strengthLabels} accent="from-emerald-400 to-teal-500" />
                <InsightCard title="Focus areas" items={improvementLabels} accent="from-amber-400 to-orange-500" />
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-wide text-slate-500">Teacher remarks</p>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {teacherRemarkTexts.map((remark) => (
                    <li key={remark}>{remark}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex-1 rounded-2xl border border-slate-200/80 bg-slate-900/80 p-5 text-white shadow-inner">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Attendance</h3>
                <span className="text-sm text-slate-200">Monthly</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-emerald-300">{attendance.today}</p>
              <p className="text-sm text-slate-200">Today’s status</p>
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-300">
                  <span>Monthly present</span>
                  <span>{attendance.monthlyPercent}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${attendance.monthlyPercent}%` }} />
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                {attendance.summary.map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-slate-200">
                    <p>{item.label}</p>
                    <p className="font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Teacher communication</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live channel</span>
            </div>
            <div className="mt-4 space-y-4">
              {teacherList.map((teacher) => (
                <div key={teacher.name} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-indigo-600" />
                      <div>
                        <p className="font-semibold text-slate-900">{teacher.name}</p>
                        <p className="text-xs text-slate-500">{teacher.subject}</p>
                      </div>
                    </div>
                    <button className="rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600">See updates</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{teacher.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm">
              {communications.map((note) => (
                <div key={note.title} className="space-y-1 border-b border-slate-200/70 pb-3 last:border-0 last:pb-0">
                  <p className="font-semibold text-slate-900">{note.title}</p>
                  <p className="text-xs text-slate-500">{note.detail}</p>
                  <p className="text-xs font-semibold text-indigo-600">{note.time}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Notifications</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">School & exams</span>
            </div>
            <div className="mt-5 space-y-4">
              {notificationList.map((note) => (
                <div key={note.title} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                    <span>{note.category}</span>
                    <span className="text-indigo-600">New</span>
                  </div>
                  <p className="mt-2 font-semibold text-slate-900">{note.title}</p>
                  <p className="text-xs text-slate-500">{note.detail}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  )
}

function ParentMenuCard({ section }: { section: ParentMenuSection }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-200/40 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${section.accent} text-white shadow-md`}>
          <section.icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-500">Tap the card to explore</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-slate-600">
        {section.items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <CircleCheck className="h-3 w-3 text-indigo-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {section.href && (
        <div className="mt-5 flex justify-end">
          <a
            href={section.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex bg-gradient-to-r items-center gap-1 rounded-full border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            View
          </a>
        </div>
      )}
    </div>
  )
}

function InsightCard({
  title,
  items,
  accent,
}: {
  title: string
  items: string[]
  accent: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`h-10 w-10 rounded-2xl bg-gradient-to-br ${accent} text-white flex items-center justify-center font-bold`}>{title[0]}</div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Performance insight</p>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50/90 p-4">
            <p className="font-semibold text-slate-900">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`text-sm font-semibold text-slate-800 ${valueClass ?? ""}`}>{value}</dd>
    </div>
  )
}
