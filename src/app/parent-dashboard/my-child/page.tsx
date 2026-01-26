"use client"

import {
  CalendarDays,
  ClipboardList,
  MessageCircle,
  ShieldCheck,
} from "lucide-react"
import { useParentDashboardContext } from "@/components/parent/parent-dashboard-context"

export default function MyChildPage() {
  const { childData } = useParentDashboardContext()
  const { profile, classDetails, focusAreas, strengths, teacherList, communications, attendance } = childData
  const attendanceLog = attendance.log
  const classLabel = [classDetails.className, classDetails.sectionLabel].filter(Boolean).join(" • ")
  const classTeacherName = classDetails.advisor ?? profile.teacher ?? "Teacher not assigned yet"
  const enrolledSubjects =
    classDetails.subjects?.length
      ? classDetails.subjects.map((subject, index) => ({
          id:
            subject.id ??
            subject.title ??
            `${subject.teacher ?? "subject"}-${index}`,
          title: subject.title ?? "Subject",
          topic: subject.topic,
          teacher: subject.teacher ?? classTeacherName,
          completion: subject.completion,
        }))
      : childData.todaySubjects.map((subject) => ({
          id: subject.name,
          title: subject.name,
          topic: subject.topic ?? subject.status,
          teacher: subject.teacher ?? classTeacherName,
        }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 lg:py-14">
        <header className="rounded-3xl border border-white/60 bg-gradient-to-br from-indigo-500 via-purple-500 to-emerald-500 p-6 text-white shadow-2xl shadow-indigo-500/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                Parent Panel • My Child
              </p>
              <h1 className="mt-2 text-3xl font-bold">{profile.name}</h1>
              <p className="mt-1 text-sm text-white/80">
                Fresh insights every time the class syncs. This page aggregates all verified details teachers share.
              </p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold">
              Latest review • {profile.lastLogin}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Basic details</p>
                <h2 className="text-xl font-bold text-slate-900">{classLabel || profile.grade}</h2>
              </div>
              <div className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">{profile.overall}</div>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-600">
              <DetailRow label="Name" value={profile.name} />
              <DetailRow label="Roll" value={profile.roll ?? "Pending"} />
              <DetailRow
                label="Class & section"
                value={classLabel || "Waiting for section assignment"}
              />
              <DetailRow label="Homeroom teacher" value={classTeacherName} />
            </dl>
            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-500">
              Focus
              <p className="mt-1 text-sm font-semibold text-slate-700">{focusAreas[0]}</p>
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-200/60">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              Enrolled subjects
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {enrolledSubjects.map((subject) => (
                <div key={subject.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800">{subject.title}</p>
                      <p className="text-xs text-slate-500">
                        {subject.teacher}
                      </p>
                    </div>
                    {typeof subject.completion === "number" ? (
                      <span className="text-xs text-emerald-600">{subject.completion}% complete</span>
                    ) : (
                      <span className="text-xs text-slate-500">{subject.topic ? "Live topic" : "Awaiting topic"}</span>
                    )}
                  </div>
                  {subject.topic && (
                    <p className="mt-2 text-xs text-slate-500">Topic: {subject.topic}</p>
                  )}
                </div>
              ))}
            </div>
            {classDetails.schedule.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-100 bg-white/80 p-3 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">Today&apos;s schedule</p>
                <div className="mt-2 flex flex-col gap-2">
                  {classDetails.schedule.map((lesson) => (
                    <div key={lesson.subject} className="flex items-center justify-between text-xs">
                      <span>{lesson.subject}</span>
                      <span className="text-slate-400">{lesson.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-5 text-xs text-slate-500">{classDetails.sectionNotes}</p>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-lg shadow-slate-200/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Class teacher info</p>
                <h2 className="text-lg font-bold text-slate-900">{classTeacherName}</h2>
                <p className="text-xs text-slate-500">{classDetails.academicYear ?? "Class advisor"}</p>
              </div>
              <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Responds within 12h
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <DetailRow label="Email" value={classDetails.advisorEmail ?? "Not shared yet"} />
              <DetailRow label="Phone" value={classDetails.advisorPhone ?? "Not shared yet"} />
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-indigo-600">
              <MessageCircle className="h-4 w-4" />
              <span>Use the teacher channel for quick updates (read-only)</span>
            </div>
          </article>
        </section>


        <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot</p>
              <h2 className="text-xl font-bold text-slate-900">Academic & wellbeing overview</h2>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Verified by school</span>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <StatCard label="Strengths" value={strengths.map((item) => item.label).join(", ")} icon={<ShieldCheck className="h-4 w-4 text-emerald-500" />} />
            <StatCard label="Focus areas" value={focusAreas.join(", ")} icon={<ClipboardList className="h-4 w-4 text-amber-500" />} />
            <StatCard label="Parent reminders" value={communications[0]?.detail ?? "Connected soon"} icon={<MessageCircle className="h-4 w-4 text-indigo-500" />} />
          </div>
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance</p>
            <div className="mt-3 grid gap-4 md:grid-cols-4">
              {attendance.summary.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-600">
                  <p className="text-2xl font-bold text-slate-900">{item.value}</p>
                  <p className="mt-1 text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-3xl border border-slate-100 bg-white/90 p-4 text-sm text-slate-600 shadow-sm">
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>Recent attendance log</span>
                <span className="font-normal text-green-600">Trusted</span>
              </div>
              <ul className="mt-3 space-y-3">
                {attendanceLog.map((entry) => (
                  <li key={entry.date} className="flex items-start justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{entry.date}</p>
                      <p className="text-xs text-slate-500">{entry.note}</p>
                    </div>
                    <span className={`text-xs font-semibold ${entry.status === "Present" ? "text-emerald-600" : "text-rose-500"}`}>{entry.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Teacher communication</h3>
              <span className="text-xs uppercase tracking-wide text-slate-500">Read-only</span>
            </div>
            <div className="mt-4 space-y-4">
              {teacherList.map((teacher) => (
                <div key={teacher.name} className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{teacher.name}</p>
                      <p className="text-xs text-slate-500">{teacher.subject}</p>
                    </div>
                    <button className="inline-flex items-center gap-1 rounded-full border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600">Message</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{teacher.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teacher feed</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {communications.map((note) => (
                  <li key={note.title} className="space-y-1 border-b border-slate-200/70 pb-3 last:border-0 last:pb-0">
                    <p className="font-semibold text-slate-900">{note.title}</p>
                    <p className="text-xs text-slate-500">{note.detail}</p>
                    <p className="text-xs font-semibold text-indigo-600">{note.time}</p>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-slate-200/80">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Parent notes</h3>
              <span className="text-xs uppercase tracking-wide text-slate-500">Tips</span>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {focusAreas.map((note) => (
                <li key={note} className="flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                  {note}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-2">
                <MessageCircle className="h-3 w-3" />
                Updates sync weekly
              </span>
              <span className="flex items-center gap-2">
                <ClipboardList className="h-3 w-3" />
                Call if urgent
              </span>
            </div>
          </article>
        </section>
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
      <div className="rounded-2xl bg-slate-50 p-3 text-slate-500">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  )
}
