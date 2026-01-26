export type AdaptiveSessionSummary = {
  sessionId: string
  mainTopic?: string | null
  status?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  questionCount: number
  answeredQuestions: number
  correctAnswers: number
  scorePercent: number
  passed: boolean
}

export type PracticeExerciseSummary = {
  id: string
  title: string
  description?: string | null
  status?: string | null
  difficulty?: string | null
  type?: string | null
  createdAt?: string | null
  questionCount: number
  completedQuestions: number
  latestVerdict?: string | null
  latestSubmissionAt?: string | null
  latestScore?: number | null
  hasAttempt: boolean
  attemptedQuestion?: {
    id?: string | null
    text?: string | null
    verdict?: string | null
    isCorrect?: boolean | null
    statusLabel?: string | null
    submittedAt?: string | null
    score?: number | null
  }
  attemptedQuestions: number
  displayStatus: string
  correctQuestionCount: number
  scorePercent?: number | null
}

export type ModuleSectionAttempt = {
  id: string
  title: string
  order_index?: number | null
  status?: string | null
  sectionStatus?: {
    sectionId: string
    adaptiveCompleted: boolean
    adaptiveScorePercent?: number | null
    exerciseSatisfied: boolean
    wrongExerciseQuestions: number
  } | null
  adaptiveSessions?: AdaptiveSessionSummary[]
  practiceExercises?: PracticeExerciseSummary[]
}

export type SectionScoreSummary = {
  totalQuestions: number
  totalCorrect: number
  scorePercent: number | null
  strength: string
}

export function deriveSectionScoreSummary(section: ModuleSectionAttempt): SectionScoreSummary {
  const adaptiveSessions = section.adaptiveSessions ?? []
  const adaptiveTotalQuestions = adaptiveSessions.reduce((sum, session) => sum + (session.questionCount ?? 0), 0)
  const adaptiveCorrectAnswers = adaptiveSessions.reduce((sum, session) => sum + (session.correctAnswers ?? 0), 0)
  const practiceExercises = section.practiceExercises ?? []
  const practiceTotalQuestions = practiceExercises.reduce((sum, exercise) => sum + (exercise.questionCount ?? 0), 0)
  const practiceCorrectAnswers = practiceExercises.reduce((sum, exercise) => sum + (exercise.correctQuestionCount ?? 0), 0)

  const totalQuestions = adaptiveTotalQuestions + practiceTotalQuestions
  const totalCorrect = adaptiveCorrectAnswers + practiceCorrectAnswers
  const scorePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null

  let strength: string
  if (scorePercent === null) {
    strength = "Not started yet"
  } else if (scorePercent >= 85) {
    strength = "Mastered this section"
  } else if (scorePercent >= 70) {
    strength = "Growing strength"
  } else {
    strength = "Needs more practice"
  }

  return { totalQuestions, totalCorrect, scorePercent, strength }
}

export function getPracticeExerciseScorePercent(
  exercise: PracticeExerciseSummary,
): number | null {
  const totalQuestions = Math.max(0, exercise.questionCount ?? 0)
  if (totalQuestions === 0) {
    return null
  }
  const correct = Math.max(0, exercise.correctQuestionCount ?? 0)
  return Math.round((correct / totalQuestions) * 100)
}
