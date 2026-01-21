"use client"

import { BellRing, BookOpen, CalendarDays, MessageSquare, Star } from "lucide-react"
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react"

type StatusColor = "Present" | "Absent" | "Holiday" | "Weekend"

export type ChildMetric = {
  subject: string
  completion: number
  focus: string
  topics: { topic: string; completed: number; total: number; confidence: string }[]
  tests: { name: string; score: string; percentile: string; trend: string }[]
  assignments: { title: string; status: string; detail: string; score: string }[]
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
  todaySubjects: { name: string; teacher: string; status: string; mood: string }[]
  alerts: { title: string; detail: string; time: string }[]
  classDetails: {
    advisor: string
    advisorEmail: string
    advisorPhone: string
    schedule: { subject: string; time: string }[]
    sectionNotes: string
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

const childPortfolio: ChildData[] = [
  {
    id: "aarav",
    profile: {
      name: "Aarav Mehta",
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
      schedule: [
        { subject: "Mathematics", time: "08:30 - 09:20" },
        { subject: "Science", time: "09:30 - 10:20" },
        { subject: "English", time: "10:30 - 11:20" },
      ],
      sectionNotes: "Group project presentation on Friday. Aarav is doing peer reviews for his group.",
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
      { author: "Ms. Revathi Rao", role: "Class teacher", time: "Jan 10 • 06:20 PM", remark: "Aarav leads the reflection circle and shares useful links for peers." },
    ],
    teacherList: [
      { name: "Ms. Revathi Rao", subject: "Class teacher • English", status: "Responds within 12h", message: "Shared weekly reflection report." },
    ],
    communications: [
      { title: "Ms. Revathi Rao", detail: "Praise: Aarav leads reflection circle.", time: "Yesterday • 05:50 PM", icon: Star },
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
        "96% monthly attendance keeps Aarav top 12% of the cohort.",
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
      name: "Nisha Mehta",
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
      schedule: [
        { subject: "Science", time: "08:30 - 09:20" },
        { subject: "Math", time: "09:30 - 10:20" },
      ],
      sectionNotes: "Nisha mentors the Science crew; remind to sync with Art pairings.",
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
      { title: "Ms. Pooja Iyer", detail: "Appreciated Nisha for lab curiosity.", time: "Today • 06:20 PM", icon: MessageSquare },
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
    }
  | undefined
>(undefined)

export function ParentDashboardProvider({ children }: { children: ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState(childPortfolio[0].id)
  useEffect(() => {
    const stored = window.localStorage.getItem("selected-parent-child")
    if (stored && childPortfolio.some((child) => child.id === stored)) {
      setSelectedChildId(stored)
    }
  }, [])
  const childData = useMemo(
    () => childPortfolio.find((item) => item.id === selectedChildId) ?? childPortfolio[0],
    [selectedChildId],
  )
  const childOptions = useMemo(
    () =>
      childPortfolio.map((child) => ({
        id: child.id,
        name: child.profile.name,
        grade: child.profile.grade,
        remarks: child.profile.focus,
      })),
    [],
  )

  useEffect(() => {
    window.localStorage.setItem("selected-parent-child", selectedChildId)
  }, [selectedChildId])

  return (
    <ParentDashboardContext.Provider
      value={{
        selectedChildId,
        setSelectedChildId,
        children: childOptions,
        childData,
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
