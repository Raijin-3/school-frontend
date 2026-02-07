import type {
  FocusGroup,
  FocusGroupTableRow,
  ModuleInsight,
  ModuleStudentSection,
  StudentInsight,
  StrugglingActionType,
} from "./types"

const getScoreTone = (score: number | null | undefined) => {
  if (score === null || score === undefined) {
    return "notStarted" as const
  }
  if (score >= 80) return "strong" as const
  if (score >= 50) return "average" as const
  return "weak"
}

function normalizeStatus(status?: string) {
  return status?.trim().toLowerCase() ?? ""
}

function resolveExerciseStatus(section: ModuleStudentSection) {
  if (section.exercise_status === "Completed") {
    return "Completed"
  }
  if (
    (typeof section.exercise_percent === "number" && section.exercise_percent > 0) ||
    section.exercise_last_attempted_at
  ) {
    return "In progress"
  }
  return section.exercise_status ?? "Not started"
}

function applyExerciseStatusUpdates(modules: ModuleInsight[]) {
  for (const module of modules) {
    const studentRoster = module.students ?? []
    for (const student of studentRoster) {
      const sections = student.sections ?? []
      for (const section of sections) {
        section.exercise_status = resolveExerciseStatus(section)
      }
    }
  }
}

function collectWeakSectionsByStudent(modules: ModuleInsight[]) {
  const weakMap = new Map<string, ModuleStudentSection[]>()
  for (const module of modules) {
    const students = module.students ?? []
    for (const student of students) {
      if (!student.student_id) continue
      const sections = student.sections ?? []
      for (const section of sections) {
        const score = section.section_score
        if (score !== null && score !== undefined && score < 50) {
          const entries = weakMap.get(student.student_id) ?? []
          entries.push(section)
          weakMap.set(student.student_id, entries)
        }
      }
    }
  }
  return weakMap
}

function collectStrongSectionsByStudent(modules: ModuleInsight[]) {
  const strongMap = new Map<string, ModuleStudentSection[]>()
  for (const module of modules) {
    const students = module.students ?? []
    for (const student of students) {
      if (!student.student_id) continue
      const sections = student.sections ?? []
      for (const section of sections) {
        const score = section.section_score
        if (score !== null && score !== undefined && score >= 80) {
          const entries = strongMap.get(student.student_id) ?? []
          entries.push(section)
          strongMap.set(student.student_id, entries)
        }
      }
    }
  }
  return strongMap
}

function collectInProgressSectionsByStudent(modules: ModuleInsight[]) {
  const pendingMap = new Map<string, ModuleStudentSection[]>()
  for (const module of modules) {
    const students = module.students ?? []
    for (const student of students) {
      if (!student.student_id) continue
      for (const section of student.sections ?? []) {
        const adaptiveStatus = normalizeStatus(section.adaptive_status)
        const exerciseStatus = normalizeStatus(section.exercise_status)
        const adaptiveHasPercent = typeof section.adaptive_percent === "number"
        const exerciseHasPercent =
          typeof section.exercise_percent === "number" || Boolean(section.exercise_last_attempted_at)
        const isAdaptiveInProgress = adaptiveStatus === "in progress" && adaptiveHasPercent
        const isExerciseInProgress = exerciseStatus === "in progress" && exerciseHasPercent
        if (!isAdaptiveInProgress && !isExerciseInProgress) continue
        const entries = pendingMap.get(student.student_id) ?? []
        entries.push(section)
        pendingMap.set(student.student_id, entries)
      }
    }
  }
  return pendingMap
}

function formatWeakSections(
  weakSections: { section_title?: string; section_score: number | null }[],
) {
  return weakSections
    .slice(0, 3)
    .map((section) => {
      const title = section.section_title ?? "Section"
      const score =
        section.section_score !== null && section.section_score !== undefined
          ? `${section.section_score}%`
          : "--"
      return `${title} ${score}`
    })
    .join(" Â· ")
}

function buildFallbackFocusGroups(subjectName: string): FocusGroup[] {
  const subjectLabel = subjectName || "This subject"

  return [
    {
      title: "Stuck Students",
      description: "Low mastery + high Jarvis hints",
      items: [
        {
          name: "Lina Patel",
          detail: `Mastery 42% Â· 7 hints on ${subjectLabel} Fractions`,
          tag: "Last intervention: 4 days ago",
        },
        {
          name: "Jamal Reza",
          detail: `Mastery 48% Â· 6 hints on ${subjectLabel} Word Problems`,
          tag: "Last intervention: 5 days ago",
        },
      ],
      actions: ["Create review plan", "Pull for small group", "Send to AI tutor"],
    },
    {
      title: "Ready for Extension",
      description: "Strong growth, ready to deepen thinking",
      items: [
        {
          name: "Priya Singh",
          detail: `Mastery 88% Â· 2 hints Â· Ready for ${subjectLabel} challenge`,
          tag: "Last intervention: 2 days ago",
        },
        {
          name: "Marcus Ortiz",
          detail: `Mastery 84% Â· 1 hint Â· Seeking ${subjectLabel} stretch goals`,
          tag: "Last intervention: Today",
        },
      ],
      actions: ["Share challenge set", "Invite to showcase", "Pair with peer mentors"],
    },
    {
      title: "Incomplete Objectives",
      description: "Assignments waiting for finish",
      items: [
        {
          name: "Harper Lee",
          detail: `${subjectLabel} practice Â· 64% mastery Â· 3 open tasks`,
          tag: "Last intervention: Last week",
        },
        {
          name: "Asher Blake",
          detail: `${subjectLabel} journal Â· 59% mastery Â· 2 open tasks`,
          tag: "Last intervention: 6 days ago",
        },
      ],
      actions: ["Send reminder", "Assign targeted practice", "Offer micro-check-in"],
    },
  ]
}

export function buildFocusGroupsFromStudents(
  students: StudentInsight[],
  modules: ModuleInsight[],
  subjectName: string,
): FocusGroup[] {
  if (!students.length) {
    return buildFallbackFocusGroups(subjectName)
  }

  const safeSubject = subjectName || "This subject"
  const averageValue = (student: StudentInsight) => student.overall_average ?? -1
  const hintCount = (student: StudentInsight) => student.hints ?? 0

  const buildBucket = (
    predicate: (student: StudentInsight) => boolean,
    comparator: (a: StudentInsight, b: StudentInsight) => number,
  ) =>
    [...students]
      .filter(predicate)
      .sort((a, b) => {
        const delta = comparator(a, b)
        if (delta !== 0) return delta
        return hintCount(b) - hintCount(a)
      })
      .slice(0, 3)

  applyExerciseStatusUpdates(modules)
  const weakSectionsByStudent = collectWeakSectionsByStudent(modules)
  const strongSectionsByStudent = collectStrongSectionsByStudent(modules)
  const pendingSectionsByStudent = collectInProgressSectionsByStudent(modules)
  const stuck = buildBucket(
    (student) => getScoreTone(student.overall_average ?? null) === "weak",
    (a, b) => averageValue(a) - averageValue(b),
  )

  const ready = buildBucket(
    (student) => (student.overall_average ?? 0) >= 80,
    (a, b) => averageValue(b) - averageValue(a),
  )

  const incomplete = buildBucket(
    (student) => (pendingSectionsByStudent.get(student.student_id)?.length ?? 0) > 0,
    (a, b) => averageValue(b) - averageValue(a),
  )

  const formatPercentage = (label: string, value: number | null | undefined) =>
    typeof value === "number" ? `${label} ${Math.round(value)}%` : undefined

  const buildFocusItemFromStudent = (student: StudentInsight) => {
    const metrics = [
      formatPercentage("Mastery", student.overall_average),
      formatPercentage("Adaptive", student.adaptive_quiz_percent),
      formatPercentage("Exercises", student.exercise_percent),
    ].filter(Boolean) as string[]

    const detailParts = [safeSubject, ...metrics]
    const detail =
      detailParts.length > 0 ? detailParts.join(" Â· ") : `${student.student_name} performance is still warming up`

    const tag =
      student.hints && student.hints > 0
        ? `${student.hints} Jarvis hint${student.hints === 1 ? "" : "s"}`
        : "Jarvis hints pending"

    return {
      name: student.student_name,
      detail,
      tag,
    }
  }

  const buildItems = (list: StudentInsight[], fallbackLabel: string) =>
    list.length
      ? list.map((student) => buildFocusItemFromStudent(student))
      : [
          {
            name: fallbackLabel,
            detail: `${safeSubject} has no students in this bucket yet.`,
            tag: "Awaiting data",
          },
        ]

  const buildStuckItems = () =>
    stuck.length
      ? stuck.map((student) => {
          const weakSections = weakSectionsByStudent.get(student.student_id) ?? []
          const masteryScore =
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--"
          const detailParts = [`Mastery map ${masteryScore}%`]
          if (weakSections.length) {
            detailParts.push(`Weak sections: ${formatWeakSections(weakSections)}`)
          }
          const detail = detailParts.filter(Boolean).join(" Â· ")
          const tag = weakSections.length
            ? `${weakSections.length} weak section${weakSections.length === 1 ? "" : "s"}`
            : "Jarvis hints pending"
          return {
            name: student.student_name,
            detail,
            tag,
          }
        })
      : [
          {
            name: "No students currently stuck",
            detail: `${safeSubject} has no students in this bucket yet.`,
            tag: "Awaiting data",
          },
        ]

  const buildTableRows = () =>
    stuck.flatMap((student) => {
      const weakSections = weakSectionsByStudent.get(student.student_id) ?? []
      if (weakSections.length) {
        return weakSections.map((section) => ({
          student_id: student.student_id,
          student_name: student.student_name,
          section_title: section.section_title,
          section_score: section.section_score,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: section.section_id,
          module_id: section.module_id ?? null,
          exercise_question_count: section.exercise_question_count ?? null,
          exercise_attempted_questions: section.exercise_attempted_questions ?? null,
          adaptive_status: section.adaptive_status ?? null,
          exercise_status: section.exercise_status ?? null,
          adaptive_last_attempted_at: section.adaptive_last_attempted_at ?? null,
          exercise_last_attempted_at: section.exercise_last_attempted_at ?? null,
        }))
      }
      return [
        {
          student_id: student.student_id,
          student_name: student.student_name,
          section_score: student.overall_average ?? null,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: "overall",
          adaptive_status: student.sections?.[0]?.adaptive_status ?? null,
          exercise_status: student.sections?.[0]?.exercise_status ?? null,
          adaptive_last_attempted_at: student.sections?.[0]?.adaptive_last_attempted_at ?? null,
          exercise_last_attempted_at: student.sections?.[0]?.exercise_last_attempted_at ?? null,
          exercise_question_count: student.sections?.[0]?.exercise_question_count ?? null,
          exercise_attempted_questions: student.sections?.[0]?.exercise_attempted_questions ?? null,
          module_id: student.sections?.[0]?.module_id ?? null,
        },
      ]
    })

  const buildReadyTableRows = () =>
    ready.flatMap((student) => {
      const strongSections = strongSectionsByStudent.get(student.student_id) ?? []
      if (strongSections.length) {
        return strongSections.map((section) => ({
          student_id: student.student_id,
          student_name: student.student_name,
          section_title: section.section_title,
          section_score: section.section_score,
          mastery:
            student.overall_average !== null && student.overall_average !== undefined
              ? Math.round(student.overall_average)
              : "--",
          hints: student.hints ?? 0,
          section_id: section.section_id,
          module_id: section.module_id ?? null,
          exercise_question_count: section.exercise_question_count ?? null,
          exercise_attempted_questions: section.exercise_attempted_questions ?? null,
          adaptive_status: section.adaptive_status ?? null,
          exercise_status: section.exercise_status ?? null,
          adaptive_last_attempted_at: section.adaptive_last_attempted_at ?? null,
          exercise_last_attempted_at: section.exercise_last_attempted_at ?? null,
        }))
      }
      return []
    })

  const buildIncompleteTableRows = () =>
    incomplete.flatMap((student) => {
      const pendingSections = pendingSectionsByStudent.get(student.student_id) ?? []
      return pendingSections.map((section) => ({
        student_id: student.student_id,
        student_name: student.student_name,
        section_title: section.section_title,
        section_score: section.section_score,
        mastery:
          student.overall_average !== null && student.overall_average !== undefined
            ? Math.round(student.overall_average)
            : "--",
        hints: student.hints ?? 0,
        section_id: section.section_id,
        module_id: section.module_id ?? null,
        exercise_question_count: section.exercise_question_count ?? null,
        exercise_attempted_questions: section.exercise_attempted_questions ?? null,
        adaptive_status: section.adaptive_status ?? null,
        exercise_status: section.exercise_status ?? null,
        adaptive_last_attempted_at: section.adaptive_last_attempted_at ?? null,
        exercise_last_attempted_at: section.exercise_last_attempted_at ?? null,
      }))
    })

  return [
    {
      title: "Stuck Students",
      description: "Low mastery + high Jarvis hints",
      items: buildStuckItems(),
      actions: ["Create review plan", "Pull for small group", "Send to AI tutor"],
      strugglingActions: ["concept", "weakness"] as StrugglingActionType[],
      tableRows: buildTableRows(),
    },
    {
      title: "Ready for Extension",
      description: "Strong growth, ready to deepen thinking",
      items: buildItems(ready, "No students ready for extension"),
      actions: ["Share challenge set", "Invite to showcase", "Pair with peer mentors"],
      tableRows: buildReadyTableRows(),
    },
    {
      title: "Incomplete Objectives",
      description: "Assignments waiting for finish",
      items: buildItems(incomplete, "No incomplete objectives"),
      actions: ["Send reminder", "Assign targeted practice", "Offer micro-check-in"],
      tableRows: buildIncompleteTableRows(),
    },
  ]
}
