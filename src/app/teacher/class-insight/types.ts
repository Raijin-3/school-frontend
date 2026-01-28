export type ClassOption = {
  id: string
  name: string
  year: string
  lastAccessedLabel?: string
}

export type ClassGroup = {
  label: string
  items: ClassOption[]
}

export type SubjectOption = {
  id: string
  name: string
  grade?: string
}

export type StrengthSummary = {
  strong: number
  average: number
  weak: number
  notStarted: number
}

export type MasteryTile = {
  id: string
  topic: string
  mastery: number
  progress: number
  struggling: number
  color: "green" | "amber" | "rose"
  students: ModuleStudentBreakdown[]
  strengthSummary: StrengthSummary
}
  strong: number
  average: number
  weak: number
  notStarted: number
}

export type ModuleStudentSection = {
  section_id: string
  section_title: string
  adaptive_percent: number | null
  exercise_percent: number | null
  section_score: number | null
  completed: boolean
  exercise_hint_count?: number | null
  exercise_hints?: {
    exercise_id: string
    title?: string | null
    hints: number
  }[]
  adaptive_status: "Completed" | "In progress"
  exercise_status: "Completed" | "In progress"
}

export type AiUsageSegment = {
  label: string
  value: number
  range: string
  tone: "green" | "amber" | "rose"
}

export type AiHighlight = {
  name: string
  hints: number
  topic: string
  student_id?: string
  detail?: string
}

export type StudentAiUsage = {
  student_id: string
  student_name: string
  hints: number
  detail?: string
}

export type FocusItem = {
  name: string
  detail: string
  tag: string
}

export type FocusGroup = {
  title: string
  description: string
  items: FocusItem[]
  actions: string[]
}

export type SuggestedAction = {
  title: string
  description: string
  due: string
}

export type QuickStat = {
  label: string
  value: string
  sublabel?: string
}

export type StudentInsight = {
  student_id: string
  student_name: string
  hints: number
  adaptive_quiz_percent: number | null
  exercise_percent: number | null
  overall_average: number | null
}

export type ModuleInsight = {
  module_id: string
  module_title: string
  adaptive_quiz_percent: number | null
  exercise_percent: number | null
  overall_average: number | null
  student_count: number
  section_count: number
  struggling_count: number
  students: ModuleStudentBreakdown[]
}

export type ModuleStudentBreakdown = {
  student_id: string
  student_name: string
  hints: number
  adaptive_quiz_percent: number | null
  exercise_percent: number | null
  module_completion_percent: number
  module_score: number | null
  sections: ModuleStudentSection[]
}
