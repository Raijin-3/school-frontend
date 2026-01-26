"use client"

import { BellRing, BookOpen, CalendarDays, MessageSquare, Star } from "lucide-react"
import { createContext, ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

type StatusColor = "Present" | "Absent" | "Holiday" | "Weekend"

export type ChildMetric = {
  subject: string
  completion: number
  focus: string
  topics: { topic: string; completed: number; total: number; confidence: string }[]
  tests: { name: string; score: string; percentile: string; trend: string }[]
  assignments: { title: string; status: string; detail: string; score: string }[]
  modules?: {
    id: string
    title: string
    completion?: number | null
    status?: string | null
    orderIndex?: number | null
  }[]
}

export type ChildAttendance = {
  today: string
  monthlyPercent: number
  summary: { label: string; value: string }[]
  log: { date: string; status: string; note: string }[]
  trendHighlights: string[]
  calendarOverrides: Record<string, StatusColor>
}

export type ChildTeacherNote = {
  name: string
  subject: string
  status: string
  message: string
}

export type ChildCommunication = {
  title: string
  detail: string
  time: string
  icon: ReactNode
}

export type ChildNotification = {
  title: string
  detail: string
  status?: string
  due?: string
  icon?: ReactNode
}

export type ChildData = {
  id: string
  profile: {
    name: string
    grade: string
    roll: string
    teacher: string
    avatar: string
    focus: string
    lastLogin: string
    overall: string
  }
  todaySubjects: { name: string; teacher: string; status: string; mood: string; topic?: string }[]
  alerts: { title: string; detail: string; time: string }[]
  classDetails: {
    advisor: string
    advisorEmail: string
    advisorPhone: string
    schedule: { subject: string; time: string }[]
    sectionNotes: string
    className?: string
    sectionLabel?: string
    subjects?: { id: string; title: string }[]
  }
  focusAreas: string[]
  subjectDetails: ChildMetric[]
  learningSignals: string[]
  performanceSignals: string[]
  performanceSignals: string[]
  strengths: { label: string; detail: string }[]
  weakAreas: { label: string; detail: string }[]
  teacherRemarks: { author: string; role: string; time: string; remark: string }[]
  teacherList: ChildTeacherNote[]
  communications: ChildCommunication[]
  notifications: {
    examUpdates: ChildNotification[]
    homeworkAlerts: ChildNotification[]
    announcements: ChildNotification[]
  }
  attendance: ChildAttendance
}

export type ParentProfile = {
  full_name?: string | null
  role?: string | null
}

type ParentChildClassDetails = {
  class_id: string
  class_name?: string | null
  grade_level?: string | null
  section_label?: string | null
  academic_year?: string | null
  class_teacher?: string | null
  subjects?: ClassSubjectInfo[]
}

type ParentChildProfile = {
  id: string | number
  full_name?: string | null
  education?: string | null
  current_institute?: string | null
  focus_areas?: unknown
  domain?: string | null
  profession?: string | null
  class_details?: ParentChildClassDetails | null
}

type ClassSubjectModule = {
  id: string
  title?: string | null
  orderIndex?: number | null
  completion?: number | null
  progress?: number | null
  status?: string | null
}

type ClassSubjectInfo = {
  id: string
  title: string
  teacher?: string | null
  topic?: string | null
  completion?: number | null
  modules?: ClassSubjectModule[]
}

type ParentChildOption = {
  id: string
  name: string
  grade: string
  remarks: string
}

function normalizeChildId(value: string | number | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const normalized = String(value).trim()
  return normalized ? normalized : undefined
}

function formatFocusArea(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    if (parts.length) {
      return parts.join(", ")
    }
  }
  return undefined
}


function deriveChildGrade(profile: ParentChildProfile) {
  return (
    profile.class_details?.grade_level ??
    profile.class_details?.class_name ??
    profile.education ??
    profile.current_institute ??
    profile.domain ??
    profile.profession ??
    "Student"
  )
}

function deriveChildRemarks(profile: ParentChildProfile) {
  return (
    profile.class_details?.class_teacher ??
    formatFocusArea(profile.focus_areas) ??
    profile.domain ??
    profile.profession ??
    "Focus updates coming soon"
  )
}

function createChildOption(profile: ParentChildProfile): ParentChildOption {
  const childId = normalizeChildId(profile.id) ?? String(profile.id ?? "")
  return {
    id: childId,
    name: profile.full_name?.trim() || "Student",
    grade: deriveChildGrade(profile),
    remarks: deriveChildRemarks(profile),
  }
}

function buildTodaySubjectsFromClass(
  subjects: ClassSubjectInfo[] | undefined,
  classTeacher?: string | null,
  defaultTeacher?: string,
  fallback?: ChildData['todaySubjects'],
): ChildData['todaySubjects'] {
  if (!subjects?.length) {
    return fallback ?? []
  }
  return subjects.map((subject) => {
    const topic = subject.topic?.trim()
    const teacher = subject.teacher ?? classTeacher ?? defaultTeacher ?? "Teacher not assigned"
    const status = topic ? "Topic running" : "Topic pending"
    const mood = topic ? `Current topic: ${topic}` : "Topic pending update"
    return {
      name: subject.title,
      teacher,
      status,
      mood,
      topic: topic ?? undefined,
    }
  })
}

const childPortfolio: ChildData[] = [
  {
    id: "aarav",
    profile: {
      name: "Sample learner",
      grade: "Grade 9 • Section B",
      roll: "Roll No. 27",
      teacher: "Ms. Revathi Rao",
      avatar: "AM",
      focus: "Building fluency in algebraic reasoning",
      lastLogin: "Today • 07:52 AM",
      overall: "On track",
    },
    todaySubjects: [
      { name: "Mathematics", teacher: "Mr. K. Varma", status: "Topic: Rational Numbers", mood: "Ready to participate" },
      { name: "Science", teacher: "Ms. Pooja Iyer", status: "Lab work: Forces & Motion", mood: "Needs material review" },
      { name: "English", teacher: "Ms. Lara Bhattacharya", status: "Class discussion: Emotive language", mood: "Highly engaged" },
    ],
    alerts: [
      { title: "Science project submission due tomorrow", detail: "Upload report and safety log before 5 PM", time: "2h ago" },
      { title: "Weekly assessment out of 25", detail: "Assigned by Ms. Revathi Rao", time: "1 day ago" },
      { title: "Homework reminder", detail: "Complete algebra worksheet 8B", time: "Today • 05:30 AM" },
    ],
    classDetails: {
      advisor: "Ms. Revathi Rao",
      advisorEmail: "revathi.rao@school.edu",
      advisorPhone: "+91 88000 33444",
      className: "Grade 9",
      sectionLabel: "Section B",
      subjects: [
        { id: "math", title: "Mathematics" },
        { id: "science", title: "Science" },
        { id: "english", title: "English" },
      ],
      schedule: [
        { subject: "Mathematics", time: "08:30 - 09:20" },
        { subject: "Science", time: "09:30 - 10:20" },
        { subject: "English", time: "10:30 - 11:20" },
      ],
      sectionNotes: "Group project presentation on Friday; the learner is coordinating peer reviews for the group.",
    },
    focusAreas: [
      "Developing faster fluency with rational number operations",
      "Applying lab observations when solving story problems",
      "Expanding descriptive writing vocabulary",
    ],
    subjectDetails: [
      {
        subject: "Mathematics",
        completion: 78,
        focus: "Rational numbers & algebra",
        topics: [
          { topic: "Algebraic Expressions", completed: 6, total: 8, confidence: "Strong" },
          { topic: "Linear Equations", completed: 5, total: 6, confidence: "Impressive" },
          { topic: "Number Theory", completed: 4, total: 6, confidence: "Growing" },
        ],
        tests: [
          { name: "Math Hourly Quiz", score: "22/25", percentile: "92nd", trend: "↑ 3 pts" },
          { name: "Algebra Concepts Test", score: "18/20", percentile: "90th", trend: "↑ 1 pt" },
        ],
        assignments: [
          { title: "Geometry worksheet 8B", status: "Reviewed", detail: "Feedback shared", score: "92%" },
          { title: "Daily problem set", status: "Completed", detail: "90% accuracy", score: "90%" },
        ],
      },
    ],
    learningSignals: [
      "Completing practice questions with 92% accuracy in mathematics",
      "Science labs still rely on peer explanations—try recapping aloud",
      "Encourage planning two reflective paragraphs for each English assignment",
    ],
    performanceSignals: [
      "Consistent strengths badges in exploratory labs.",
      "Teacher flagged 2 constructive revisions on last assignment.",
      "Daily trivia participation keeps reasoning speed above 85%.",
    ],
    strengths: [
      { label: "Analytical reasoning", detail: "Confidently solves multi-step math problems with accuracy." },
    ],
    weakAreas: [
      { label: "Revision planning", detail: "Benefit from a dedicated 10-minute nightly review habit." },
      { label: "Timed writing", detail: "Needs practice summarizing observations under time pressure." },
    ],
    teacherRemarks: [
      {
        author: "Ms. Revathi Rao",
        role: "Class teacher",
        time: "Jan 10 • 06:20 PM",
        remark: "The learner leads the reflection circle and shares helpful links for peers.",
      },
    ],
    teacherList: [
      {
        name: "Ms. Revathi Rao",
        subject: "Class teacher • English",
        status: "Responds within 12h",
        message: "Shared weekly reflection report.",
      },
    ],
    communications: [
      { title: "Ms. Revathi Rao", detail: "Praise: the learner led the reflection circle.", time: "Yesterday • 05:50 PM", icon: Star },
    ],
    notifications: {
      examUpdates: [
        {
          title: "Integrated Practice Exam",
          detail: "Download personalized QR set; window opens Jan 20.",
          status: "Accepted",
          due: "Jan 20 • 8:00 AM",
        },
      ],
      homeworkAlerts: [
        {
          title: "Algebra worksheet 9E",
          detail: "Upload scanned answers; teacher will release rubrics after submission.",
          due: "Due today • 5:00 PM",
        },
      ],
      announcements: [
        {
          title: "School assembly",
          detail: "Theme: Celebrating inquiry. Parents invited to watch the live stream.",
          icon: BellRing,
        },
      ],
    },
    attendance: {
      today: "Present",
      monthlyPercent: 96,
      summary: [
        { label: "Present days", value: "22" },
        { label: "Absent days", value: "1" },
        { label: "Late arrivals", value: "0" },
        { label: "Excused", value: "1" },
      ],
      log: [
        { date: "Jan 11", status: "Present", note: "On time, submitted science observations" },
        { date: "Jan 10", status: "Present", note: "Participated in math challenge" },
      ],
      trendHighlights: [
        "96% monthly attendance keeps this learner in the top 12% of the cohort.",
        "Daily arrival time averages 08:28 AM, beating the punctuality goal.",
      ],
      calendarOverrides: {
        "2026-01-09": "Absent",
        "2026-01-26": "Holiday",
        "2026-01-01": "Holiday",
      },
    },
  },
  {
    id: "nisha",
    profile: {
      name: "Learner sample",
      grade: "Grade 7 • Section A",
      roll: "Roll No. 12",
      teacher: "Mr. Dev Sharma",
      avatar: "NM",
      focus: "Experiment documentation",
      lastLogin: "Today • 08:15 AM",
      overall: "Excelling",
    },
    todaySubjects: [
      { name: "Science", teacher: "Ms. Pooja Iyer", status: "Exploring ecosystems", mood: "Curious" },
      { name: "Math", teacher: "Mr. K. Varma", status: "Hands-on fractions lab", mood: "Steady" },
      { name: "Art", teacher: "Ms. Rina Das", status: "Sketchbook critiques", mood: "Creative" },
    ],
    alerts: [
      { title: "Science lab notebook", detail: "Add biodiversity notes before Monday", time: "Today • 09:00 AM" },
      { title: "Math camp practice", detail: "Complete 3 speed drills in workbook", time: "Yesterday • 10:00 PM" },
    ],
    classDetails: {
      advisor: "Mr. Dev Sharma",
      advisorEmail: "dev.sharma@school.edu",
      advisorPhone: "+91 88000 55667",
      className: "Grade 7",
      sectionLabel: "Section A",
      subjects: [
        { id: "science", title: "Science" },
        { id: "math", title: "Mathematics" },
        { id: "art", title: "Art" },
      ],
      schedule: [
        { subject: "Science", time: "08:30 - 09:20" },
        { subject: "Math", time: "09:30 - 10:20" },
      ],
      sectionNotes: "This learner mentors the Science crew; remind to sync with Art pairings.",
    },
    focusAreas: ["Documenting labs nightly", "Timed reasoning drills"],
    subjectDetails: [
      {
        subject: "Science",
        completion: 82,
        focus: "Ecosystems & ecosystems critiques",
        topics: [
          { topic: "Ecosystem Mapping", completed: 7, total: 8, confidence: "Strong" },
        ],
        tests: [
          { name: "Science Lab Quiz", score: "19/20", percentile: "96th", trend: "↑ 2 pts" },
        ],
        assignments: [
          { title: "Biodiversity log", status: "Reviewed", detail: "Great field sketches", score: "95%" },
        ],
      },
    ],
    learningSignals: ["Science narration uses richer vocabulary than last month."],
    performanceSignals: [
      "Zero tardies in the current month keeps punctuality streak strong.",
      "Labs show an 18% improvement in observation detail.",
    ],
    strengths: [{ label: "Experiment documentation", detail: "Notes are detailed and neatly organized." }],
    weakAreas: [{ label: "Fraction fluency", detail: "Practice with number lines and quick drills." }],
    teacherRemarks: [{ author: "Mr. Dev Sharma", role: "Science/Mentor", time: "Jan 08 • 07:10 AM", remark: "Guided peers through the greenhouse lab." }],
    teacherList: [
      { name: "Ms. Pooja Iyer", subject: "Science", status: "Shared extra reading", message: "Check the biodiversity article he recommended." },
    ],
    communications: [
      { title: "Ms. Pooja Iyer", detail: "Appreciated this learner for lab curiosity.", time: "Today • 06:20 PM", icon: MessageSquare },
    ],
    notifications: {
      examUpdates: [
        { title: "Midterm snapshot", detail: "Expect summarizer on Jan 25.", status: "Scheduled", due: "Jan 25 • 9:00 AM" },
      ],
      homeworkAlerts: [
        { title: "Science journal", detail: "Add insect observation comparison.", due: "Due tomorrow • 6:00 PM" },
      ],
      announcements: [
        { title: "Library reopening", detail: "AI research corner ready; bring badges.", icon: BookOpen },
      ],
    },
    attendance: {
      today: "Present",
      monthlyPercent: 98,
      summary: [
        { label: "Present days", value: "24" },
        { label: "Absent days", value: "0" },
        { label: "Late arrivals", value: "0" },
        { label: "Excused", value: "0" },
      ],
      log: [
        { date: "Jan 11", status: "Present", note: "Explained notebook details" },
        { date: "Jan 10", status: "Present", note: "Led fraction warm-up" },
      ],
      trendHighlights: ["98% attendance keeps her in the top 5%", "No tardies this week."],
      calendarOverrides: {
        "2026-01-01": "Holiday",
        "2026-01-26": "Holiday",
      },
    },
  },
]

const ParentDashboardContext = createContext<
  | {
      selectedChildId: string
      setSelectedChildId: (id: string) => void
      children: { id: string; name: string; grade: string; remarks: string }[]
      childData: ChildData
      parentProfile: ParentProfile | null
    }
  | undefined
>(undefined)

export function ParentDashboardProvider({ children }: { children: ReactNode }) {
  const demoChildOptions = useMemo(
    () =>
      childPortfolio.map((child) => ({
        id: normalizeChildId(child.id) ?? child.id,
        name: child.profile.name,
        grade: child.profile.grade,
        remarks: child.profile.focus,
      })),
    [],
  )
  const [selectedChildId, setSelectedChildId] = useState(() => {
    const fallback = demoChildOptions[0]?.id ?? childPortfolio[0].id
    if (typeof window === "undefined") {
      return fallback
    }
    return window.localStorage.getItem("selected-parent-child") ?? fallback
  })
  const [parentChildren, setParentChildren] = useState<ParentChildProfile[]>([])
  const [parentProfile, setParentProfile] = useState<ParentProfile | null>(null)
  const childOptions = useMemo(
    () =>
      parentChildren.length > 0
        ? parentChildren.map(createChildOption)
        : demoChildOptions,
    [parentChildren, demoChildOptions],
  )
  const childData = useMemo(() => {
    const template = childPortfolio.find((item) => item.id === selectedChildId) ?? childPortfolio[0]
    const matchingChild = parentChildren.find(
      (child) => normalizeChildId(child.id) === selectedChildId,
    )
    if (!matchingChild) {
      return template
    }
    const classInfo = matchingChild.class_details
    const templateSubjectDetails = template.subjectDetails
    const subjectMetrics =
      classInfo?.subjects?.map((subject, index) => {
        const fallback = templateSubjectDetails[index] ?? templateSubjectDetails[0]
        const modules = subject.modules?.map((module) => ({
          id: module.id,
          title: module.title ?? module.id,
          completion: module.completion ?? null,
          progress: module.progress ?? module.completion ?? null,
          status: module.status ?? null,
          orderIndex: module.orderIndex ?? (module as any).order_index ?? null,
        }))
        return {
          subject: subject.title ?? fallback.subject,
          completion: subject.completion ?? fallback.completion,
          focus: subject.topic ?? fallback.focus,
          topics: fallback.topics,
          tests: fallback.tests,
          assignments: fallback.assignments,
          modules,
        }
      }) ?? []
    const mergedSubjectDetails =
      subjectMetrics.length > 0 ? subjectMetrics : templateSubjectDetails
    return {
      ...template,
      profile: {
        ...template.profile,
        name: matchingChild.full_name ?? template.profile.name,
        grade: classInfo?.grade_level ?? template.profile.grade,
        teacher: classInfo?.class_teacher ?? template.profile.teacher,
      },
      classDetails: {
        ...template.classDetails,
        className: classInfo?.class_name ?? template.classDetails.className,
        sectionLabel: classInfo?.section_label ?? template.classDetails.sectionLabel,
        advisor: classInfo?.class_teacher ?? template.classDetails.advisor,
        subjects: classInfo?.subjects ?? template.classDetails.subjects,
      },
      todaySubjects: buildTodaySubjectsFromClass(
        classInfo?.subjects ?? template.classDetails.subjects,
        classInfo?.class_teacher,
        template.profile.teacher,
        template.todaySubjects,
      ),
      subjectDetails: mergedSubjectDetails,
    }
  }, [selectedChildId, parentChildren])

  const hasSyncedSelection = useRef(false)

  useLayoutEffect(() => {
    if (parentChildren.length === 0) return
    hasSyncedSelection.current = false
  }, [parentChildren.length])

  useLayoutEffect(() => {
    if (hasSyncedSelection.current || childOptions.length === 0) return
    const stored = window.localStorage.getItem("selected-parent-child")
    if (stored && childOptions.some((child) => child.id === stored)) {
      if (stored !== selectedChildId) {
        setSelectedChildId(stored)
      }
      hasSyncedSelection.current = true
      return
    }
    if (!childOptions.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(childOptions[0].id)
    }
    hasSyncedSelection.current = true
  }, [childOptions, selectedChildId])

  useEffect(() => {
    if (
      childOptions.length > 0 &&
      !childOptions.some((child) => child.id === selectedChildId)
    ) {
      setSelectedChildId(childOptions[0].id)
    }
  }, [childOptions, selectedChildId])

  useEffect(() => {
    if (!selectedChildId) return
    window.localStorage.setItem("selected-parent-child", selectedChildId)
  }, [selectedChildId])

  useEffect(() => {
    const controller = new AbortController()
    const loadChildren = async () => {
      try {
        const res = await fetch("/api/parent/children", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          if (res.status === 404) {
            console.warn("Parent children endpoint not found yet; falling back to demo data.")
            return
          }
          const text = await res.text().catch(() => res.statusText)
          throw new Error(text || "Failed to fetch children")
        }
        const payload = await res.json()
        const rawChildren = Array.isArray(payload?.children)
          ? payload.children
          : Array.isArray(payload)
            ? payload
            : []
        const normalized = rawChildren
          .filter((child): child is ParentChildProfile => Boolean(child?.id))
          .map((child) => ({
            ...child,
            class_details:
              child.class_details && typeof child.class_details === "object"
                ? child.class_details
                : null,
          }))
        if (!controller.signal.aborted) {
          setParentChildren(normalized)
        }
      } catch (error: unknown) {
        if ((error as any)?.name !== "AbortError") {
          console.error("Failed to load parent children:", error)
        }
      }
    }

    loadChildren()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error("Failed to fetch parent profile")
        }
        const data = await res.json()
        setParentProfile(data)
      } catch (error: unknown) {
        if ((error as any)?.name !== "AbortError") {
          console.error("Failed to load parent profile:", error)
        }
      }
    }

    loadProfile()
    return () => controller.abort()
  }, [])

  return (
    <ParentDashboardContext.Provider
      value={{
        selectedChildId,
        setSelectedChildId,
        children: childOptions,
        childData,
        parentProfile,
      }}
    >
      {children}
    </ParentDashboardContext.Provider>
  )
}

export function useParentDashboardContext() {
  const context = useContext(ParentDashboardContext)
  if (!context) {
    throw new Error("useParentDashboardContext must be used within ParentDashboardProvider")
  }
  return context
}
