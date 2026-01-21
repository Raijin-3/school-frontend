import { redirect } from "next/navigation"
import { FirstAssessmentRedirector } from "@/components/first-assessment-redirector"
import { apiGet } from "@/lib/api"
import { supabaseServer } from "@/lib/supabase-server"
import { Sidebar } from "./sidebar"
import { MobileSidebar } from "./mobile-sidebar"
import { BookOpen, Trophy, Target, Calendar, Brain, Clock, BarChart3 } from "lucide-react"
import { GamificationProvider, GamificationStrip, RecentBadgesPanel } from "@/components/gamification"
import { getGamificationLevelProgress, getLevelFromXp } from "@/lib/gamification-levels"
import { DashboardHero, DashboardSummaryProvider } from "./dashboard-hero"

type DashboardData = {
  role?: string
  user: { id: string; displayName: string }
  stats?: { xp: number; streakDays: number; tier: "Bronze" | "Silver" | "Gold" | "Platinum" }
  weeklyXp?: { week: string; XP: number }[]
  completion?: { name: string; value: number }[]
  nextActions?: { label: string; href: string }[]
  recommendations?: { title: string; tag: string }[]
  panels?: string[]
  leaderboardPosition?: number
  leaderboardEntries?: { rank: number; name: string; xp: number; trend?: "up" | "down" | "steady"; userId?: string }[]
  xpLeaderboard?: { name: string; xp: number }[]
  streakCalendar?: { date: string; present?: boolean; lastActivityAt?: string | null; isFuture?: boolean }[]
  badges?: { name: string; earnedAt?: string }[]
  history?: { date: string; action: string; xp?: number }[]
  learningProgress?: {
    subject_id?: string | null
    subject_title?: string | null
    module_count?: number | null
    average_percentage?: number | string | null
    completed_modules?: number | null
    course_title?: string | null
  }[]
}

const MONTH_WINDOW = 6
const MS_IN_DAY = 86400000
const DATE_LOCALE = "en-US"
const DATE_TIMEZONE = "IST"

type SupabaseServerClient = ReturnType<typeof supabaseServer>

type LearningProgressCard = {
  id: string
  name: string
  value: number
  totalModules: number
  completedModules: number
  courseTitle?: string
}

type ModuleStatusRow = {
  module_id?: string | number | null
  progress?: number | string | null
  subject_id?: string | number | null
  course_id?: string | number | null
}

type ModuleRow = {
  id?: string | number | null
  title?: string | null
  subject_id?: string | number | null
  slug?: string | null
}

type SubjectRow = {
  id?: string | number | null
  title?: string | null
  course_id?: string | number | null
}

type CourseRow = {
  id?: string | number | null
  title?: string | null
}

type CourseAssignmentRow = {
  course_id?: string | number | null
}

type QuickAction = {
  label: string
  description: string
  gradientFrom: string
  gradientTo: string
  overlayFrom: string
  icon: typeof BookOpen
  href?: string
  disabled?: boolean
}

const quickActions: QuickAction[] = [
  {
    label: "My Courses",
    description: "Continue learning",
    gradientFrom: "from-blue-500",
    gradientTo: "to-blue-600",
    overlayFrom: "from-blue-400/20",
    icon: BookOpen,
    href: "/curriculum",
  },
  {
    label: "Take Exam",
    description: "Test your skills",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-emerald-600",
    overlayFrom: "from-emerald-400/20",
    icon: Trophy,
    href: "/assessment",
    disabled: true,
  },
  {
    label: "Class Schedule",
    description: "View timetable",
    gradientFrom: "from-purple-500",
    gradientTo: "to-purple-600",
    overlayFrom: "from-purple-400/20",
    icon: Calendar,
    href: "/schedule",
    disabled: true,
  },
  {
    label: "Daily Trivia",
    description: "Brain training",
    gradientFrom: "from-amber-500",
    gradientTo: "to-amber-600",
    overlayFrom: "from-amber-400/20",
    icon: Brain,
    href: "/logical-reasoning",
    disabled: true,
  },
]

const activityDateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: DATE_TIMEZONE,
})

const generateFallbackStreakCalendar = (
  presentDays: number,
  monthsBefore = MONTH_WINDOW,
  monthsAfter = MONTH_WINDOW,
) => {
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - monthsBefore, 1))
  const end = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + monthsAfter + 1, 0))
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_IN_DAY) + 1
  const todayIndex = Math.round((todayUtc.getTime() - start.getTime()) / MS_IN_DAY)
  const earliestPresentIndex = Math.max(0, todayIndex - Math.min(presentDays, totalDays) + 1)

  return Array.from({ length: totalDays }).map((_, index) => {
    const day = new Date(start.getTime() + index * MS_IN_DAY)
    const iso = day.toISOString().split("T")[0]
    const isFuture = index > todayIndex
    const present = !isFuture && index >= earliestPresentIndex && index <= todayIndex
    return { date: iso, present, isFuture }
  })
}

export default async function DashboardPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  // Check user onboarding flow
  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  
  // For new student accounts with onboarding false, redirect to profile
  if (!profile?.onboarding_completed) {
    // Always redirect to profile first for new students
    redirect("/profile")
  }

  // If onboarding is completed, user stays on dashboard

  // Client-side one-time redirect to assessment after profile completion
  const shouldCheckFirstAssessment = !profile?.assessment_completed_at

  let data: DashboardData
  try {
    data = await apiGet<DashboardData>("/v1/dashboard")
  } catch {
    data = {
      role: 'student',
      user: { id: user.id, displayName: user.email?.split("@")[0] ?? "Learner" },
      stats: { xp: 1540, streakDays: 7, tier: "Silver" },
      weeklyXp: [
        { week: '2025-08-18', XP: 120 },
        { week: '2025-08-25', XP: 200 },
        { week: '2025-09-01', XP: 180 },
        { week: '2025-09-08', XP: 240 },
      ],
      completion: [
        { name: 'Core Lessons', value: 78 },
        { name: 'Practice Exercises', value: 65 },
        { name: 'Projects', value: 42 },
      ],
      nextActions: [
        { label: 'Complete SQL Advanced Module', href: '/curriculum' },
        { label: 'Take Data Visualization Assessment', href: '/assessment' },
        { label: 'Join Today\'s Live Session', href: '/schedule' },
        { label: 'Solve Daily Coding Challenge', href: '/logical-reasoning' },
      ],
      recommendations: [
        { title: 'Advanced SQL Window Functions', tag: 'SQL • Intermediate • 45 mins' },
        { title: 'Python Data Analysis Bootcamp', tag: 'Python • Beginner • 2 hours' },
        { title: 'Business Intelligence Case Study', tag: 'Project • Advanced • 1.5 hours' },
        { title: 'Statistical Testing in R', tag: 'Statistics • Intermediate • 30 mins' },
      ],
      leaderboardPosition: 8,
      badges: [
        { name: 'SQL Ninja', earnedAt: '2025-01-05' },
        { name: 'Data Visualization Pro', earnedAt: '2025-01-03' },
        { name: 'Weekly Warrior', earnedAt: '2025-01-01' },
        { name: 'Problem Solver', earnedAt: '2024-12-28' },
        { name: 'Team Player', earnedAt: '2024-12-25' },
      ],
      leaderboardEntries: [
        { rank: 1, name: "Avery Chen", xp: 2840, trend: "up", userId: "mock-1" },
        { rank: 2, name: "Mateo Singh", xp: 2615, trend: "steady", userId: "mock-2" },
        { rank: 3, name: "Sara Rios", xp: 2400, trend: "down", userId: "mock-3" },
        { rank: 4, name: "Liam Patel", xp: 2260, trend: "up", userId: "mock-4" },
        { rank: 5, name: "Noah Kim", xp: 2195, trend: "steady", userId: "mock-5" },
      ],
      xpLeaderboard: [
        { name: "Avery", xp: 2840 },
        { name: "Mateo", xp: 2615 },
        { name: "Sara", xp: 2400 },
        { name: "Liam", xp: 2260 },
        { name: "Noah", xp: 2195 },
        { name: "Priya", xp: 2100 },
      ],
      streakCalendar: generateFallbackStreakCalendar(4),
      history: [
        { date: new Date().toISOString(), action: 'Completed Advanced Joins Module', xp: 50 },
        { date: new Date(Date.now() - 3600000).toISOString(), action: 'Earned badge: SQL Ninja', xp: 100 },
        { date: new Date(Date.now() - 86400000).toISOString(), action: 'Solved Daily Trivia Challenge', xp: 30 },
        { date: new Date(Date.now() - 2*86400000).toISOString(), action: 'Attended Live Session: Data Analytics', xp: 25 },
        { date: new Date(Date.now() - 3*86400000).toISOString(), action: 'Completed Python Basics Assessment', xp: 75 },
      ],
    }
  }

  const rawRole = data.role ?? 'student'
  const role = rawRole.toLowerCase()
  if (role === 'admin') redirect('/admin')
  if (role === 'teacher') redirect('/teacher')

  // Resolve display name dynamically: API -> Supabase metadata -> email -> fallback
  const displayName = (
    data.user?.displayName?.trim() ||
    (user?.user_metadata?.full_name && String(user.user_metadata.full_name).trim()) ||
    (user?.user_metadata?.name && String(user.user_metadata.name).trim()) ||
    (user?.user_metadata?.display_name && String(user.user_metadata.display_name).trim()) ||
    (user?.email ? user.email.split("@")[0] : undefined) ||
    "Learner"
  )
  const stats = data.stats ?? { xp: 0, streakDays: 0, tier: "Bronze" as const }
  const xp = stats.xp ?? 0
  const streakDays = stats.streakDays ?? 0
  const tier = stats.tier ?? "Bronze"
  const leaderboardPosition = typeof data.leaderboardPosition === 'number' ? data.leaderboardPosition : 0
  const history = Array.isArray(data.history) ? data.history : []
  const leaderboardEntries = Array.isArray(data.leaderboardEntries) ? data.leaderboardEntries : []
  const sortedLeaderboardEntries = leaderboardEntries
    .slice()
    .sort(
      (a, b) =>
        (typeof b?.xp === "number" ? b.xp : 0) - (typeof a?.xp === "number" ? a.xp : 0),
    )
  const topLeaderboardEntries = sortedLeaderboardEntries.slice(0, 10)
  const rawStreakCalendar = Array.isArray(data.streakCalendar) ? data.streakCalendar : []
  const streakCalendar =
    rawStreakCalendar.length > 0
      ? rawStreakCalendar
      : generateFallbackStreakCalendar(streakDays)

  let learningProgress = await fetchLearningProgressSummary(sb, user.id)
  if (!learningProgress.length) {
    const fallbackProgress = mapDashboardProgressFromApi(data.learningProgress)
    if (fallbackProgress.length) {
      learningProgress = fallbackProgress
    }
  }
  // console.log("Learning progress data:", learningProgress)

  const level = getLevelFromXp(xp)
  const levelProgress = getGamificationLevelProgress(level, xp)
  const progressPercent = levelProgress.progressPercent
  const xpToNext = Math.max(0, levelProgress.neededForNextLevel - levelProgress.currentLevelPoints)

  // User data for sidebar
  const sidebarUser = {
    name: displayName,
    email: data.user?.email || 'learner@example.com',
    tier,
    xp,
    level,
    levelProgressPercent: Math.max(0, Math.min(100, progressPercent)),
    role: rawRole,
    rank: leaderboardPosition > 0 ? leaderboardPosition : null,
    assignedCourseCount: 0,
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      <FirstAssessmentRedirector shouldCheck={shouldCheckFirstAssessment} />
      <MobileSidebar active="/dashboard" user={sidebarUser} />
      <div className="lg:flex lg:gap-6 max-w-screen-2xl mx-auto p-4 md:p-6">
        <Sidebar active="/dashboard" user={sidebarUser} />

        <GamificationProvider userId={user.id}>
          <DashboardSummaryProvider
            summaryDefaults={sidebarUser}
            fallbackStreak={streakDays}
          >
          <section className="flex-1">
            {/* Dynamic Gamification Strip (live stats) */}
            <div className="mb-6">
              <GamificationStrip />
            </div>
              <DashboardHero
                displayName={displayName}
                leaderboardPosition={leaderboardPosition}
                leaderboardEntries={topLeaderboardEntries}
                streakCalendar={streakCalendar}
                userId={user.id}
              />

            {/* Enhanced Quick Actions */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Target className="h-6 w-6 text-indigo-500" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((action) => {
                  const Icon = action.icon
                  const gradientClasses = `bg-gradient-to-br ${action.gradientFrom} ${action.gradientTo}`
                  const overlayClasses = `absolute inset-0 bg-gradient-to-br ${action.overlayFrom} to-transparent`
                  const baseClasses =
                    "group relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-all"
 
                  return action.disabled ? (
                    <div
                      key={action.label}
                      className={`${baseClasses} ${gradientClasses} opacity-70 cursor-not-allowed pointer-events-none`}
                    >
                      <div className={overlayClasses}></div>
                      <div className="relative">
                        <Icon className="h-8 w-8 mb-3" />
                        <h3 className="font-semibold text-lg mb-1">{action.label}</h3>
                        <p className="text-white/80 text-sm">{action.description}</p>
                        <span className="mt-4 inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700">
                          Coming soon
                        </span>
                      </div>
                    </div>
                  ) : (
                    <a
                      key={action.label}
                      href={action.href}
                      className={`${baseClasses} ${gradientClasses} hover:shadow-2xl hover:scale-105`}
                    >
                      <div className={overlayClasses}></div>
                      <div className="relative">
                        <Icon className="h-8 w-8 mb-3" />
                        <h3 className="font-semibold text-lg mb-1">{action.label}</h3>
                        <p className="text-white/80 text-sm">{action.description}</p>
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>

            {/* Progress Overview */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-emerald-500" />
                Learning Progress
              </h2>
              {learningProgress.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-emerald-200/70 bg-white/70 p-6 text-center text-gray-600">
                  Start your first lesson to see learning progress here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {learningProgress.map((item) => {
                    // console.log(item);
                    const encouragement = getProgressEncouragement(item.value)
                    const percentage = Math.min(100, Math.max(0, item.value))
                    const completionLabel =
                      item.totalModules > 0
                        ? `${item.completedModules}/${item.totalModules} modules complete`
                        : encouragement

                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-gray-900">{item.name}</h3>
                            {item.courseTitle && (
                              <p className="text-xs text-gray-500">{item.courseTitle}</p>
                            )}
                          </div>
                          <span className="text-2xl font-bold text-indigo-600">{percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <div className="mt-3 text-sm text-gray-700">{completionLabel}</div>
                        <div className="text-xs text-gray-500">{encouragement}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
  
            {/* Badges & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Badges */}
              <RecentBadgesPanel />
  
              {/* Recent Activity */}
              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Recent Activity
                </h3>
                <div className="space-y-4">
                  {history.slice(0, 4).map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-white/60">
                      <div>
                        <div className="font-medium text-sm text-gray-900">{item.action}</div>
                        <div className="text-xs text-gray-500">
                          {activityDateTimeFormatter.format(new Date(item.date))}
                        </div>
                      </div>
                      <div className="text-right">
                        {item.xp && item.xp > 0 && (
                          <div className="text-sm font-medium text-indigo-600">+{item.xp} XP</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
  
          </section>
          </DashboardSummaryProvider>
        </GamificationProvider>
      </div>
    </div>
  )
}

function clampDashboardProgressValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 0) return 0
    if (value >= 100) return 100
    return Math.round(value)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return clampDashboardProgressValue(numeric)
    }
  }
  return 0
}

async function fetchLearningProgressSummary(
  sb: SupabaseServerClient,
  userId: string,
): Promise<LearningProgressCard[]> {
  const assignedProgress = await buildLearningProgressFromAssignedCourses(sb, userId)
  if (assignedProgress.length > 0) {
    return assignedProgress
  }
  return buildLearningProgressFromStatus(sb, userId)
}

async function buildLearningProgressFromAssignedCourses(
  sb: SupabaseServerClient,
  userId: string,
): Promise<LearningProgressCard[]> {
  const { data: assignments, error: assignmentsError } = await sb
    .from("user_course_assignments")
    .select("course_id")
    .eq("user_id", userId)

    console.log("Course assignments for user:", { assignments, assignmentsError })

  if (assignmentsError) {
    console.warn("Failed to load assigned courses for dashboard:", assignmentsError.message)
    return []
  }

  const courseIds = Array.from(
    new Set(
      (assignments ?? [])
        .map((assignment) =>
          assignment?.course_id ? String(assignment.course_id) : null,
        )
        .filter((id): id is string => Boolean(id)),
    ),
  )

  if (!courseIds.length) {
    return []
  }

  const { data: courseRows, error: courseError } = await sb
    .from("courses")
    .select("id, title")
    .in("id", courseIds)

  if (courseError) {
    console.warn("Failed to load courses for learning progress:", courseError.message)
    return []
  }

  console.log("Fetched courses for learning progress:", { courseRows, courseError })

  const { data: subjectRows, error: subjectError } = await sb
    .from("subjects")
    .select("id, title, course_id")
    .in("course_id", courseIds)

  console.log("Fetched subjects for learning progress:", { subjectRows, subjectError })

  if (subjectError) {
    console.warn("Failed to load subjects for learning progress:", subjectError.message)
    return []
  }

  const subjectIds = Array.from(
    new Set(
      (subjectRows ?? [])
        .map((subject) => (subject?.id ? String(subject.id) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  )

  if (!subjectIds.length) {
    return []
  }

  console.log("Subject IDs for learning progress:", subjectIds)

  const { data: moduleRows, error: moduleError } = await sb
    .from("modules")
    .select("id, title, subject_id")
    .in("subject_id", subjectIds)

  console.log("Fetched modules for learning progress:", { moduleRows, moduleError })

  if (moduleError) {
    console.warn("Failed to load modules for learning progress:", moduleError.message)
    return []
  }

  const moduleIds = Array.from(
    new Set(
      (moduleRows ?? [])
        .map((module) => (module?.id ? String(module.id) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  )

  if (!moduleIds.length) {
    return []
  }

  const { data: statusRows, error: statusError } = await sb
    .from("user_module_status")
    .select("module_id, progress")
    .eq("user_id", userId)
    .in("module_id", moduleIds)

    console.log("Fetched module statuses for learning progress:", { statusRows, statusError })

  if (statusError) {
    console.warn("Failed to load user_module_status for dashboard:", statusError.message)
    return []
  }

  const moduleProgressMap = new Map<string, number>()
  ;(statusRows ?? []).forEach((status) => {
    const moduleId = status?.module_id ? String(status.module_id) : null
    if (!moduleId) {
      return
    }
    moduleProgressMap.set(
      moduleId,
      clampDashboardProgressValue(status?.progress ?? null),
    )
  })

  const subjectModuleMap = new Map<string, { id: string; title?: string | null }[]>()
  ;(moduleRows ?? []).forEach((module) => {
    const moduleId =
      module?.id !== undefined && module?.id !== null ? String(module.id) : null
    const subjectId =
      module?.subject_id !== undefined && module?.subject_id !== null
        ? String(module.subject_id)
        : null
    if (!moduleId || !subjectId) {
      return
    }
    const list = subjectModuleMap.get(subjectId) ?? []
    if (!list.some((entry) => entry.id === moduleId)) {
      list.push({ id: moduleId, title: module?.title ?? undefined })
    }
    subjectModuleMap.set(subjectId, list)
  })

  const subjectLookup = new Map(
    (subjectRows ?? []).map((subject) => [String(subject.id), subject]),
  )
  const courseLookup = new Map(
    (courseRows ?? []).map((course) => [String(course.id), course]),
  )

  const cards: LearningProgressCard[] = []
  subjectModuleMap.forEach((modules, subjectId) => {
    const subject = subjectLookup.get(subjectId)
    if (!subject) {
      return
    }
    const moduleCount = modules.length
    if (moduleCount === 0) {
      return
    }
    const totalProgress = modules.reduce((sum, module) => {
      const progress = moduleProgressMap.get(module.id) ?? 0
      return sum + progress
    }, 0)
    const completedModules = modules.reduce((count, module) => {
      const progress = moduleProgressMap.get(module.id) ?? 0
      return progress >= 100 ? count + 1 : count
    }, 0)
    const averageProgress = moduleCount > 0 ? Math.round(totalProgress / moduleCount) : 0
    const courseId =
      subject?.course_id !== undefined && subject?.course_id !== null
        ? String(subject.course_id)
        : null
    const course = courseId ? courseLookup.get(courseId) : undefined

    cards.push({
      id: subjectId,
      name: subject.title ?? "Subject",
      courseTitle: course?.title ?? undefined,
      value: averageProgress,
      totalModules: moduleCount,
      completedModules,
    })
  })

  return cards.sort((a, b) => b.value - a.value)
}

async function buildLearningProgressFromStatus(
  sb: SupabaseServerClient,
  userId: string,
): Promise<LearningProgressCard[]> {
  let statusRows: ModuleStatusRow[] | null = null
  let statusError: { code?: string; message: string } | null = null

  const statusResponse = await sb
    .from("user_module_status")
    .select("module_id, progress, subject_id, course_id")
    .eq("user_id", userId)

  statusRows = statusResponse.data ?? null
  statusError = statusResponse.error

  if (statusError?.code === "42703") {
    const fallbackResponse = await sb
      .from("user_module_status")
      .select("module_id, progress")
      .eq("user_id", userId)
    statusRows = fallbackResponse.data ?? null
    statusError = fallbackResponse.error
  }

  // console.log("Initial user_module_status fetch:", { statusRows, statusError })

  // we need to add subject name to above modules
  if (statusError) {
    console.warn("Failed to load user_module_status for dashboard:", statusError.message)
    return []
  }

  const normalizedStatusRows = Array.isArray(statusRows) ? statusRows : []

  const moduleIds = Array.from(
    new Set(
      normalizedStatusRows
        .map((row) => (row?.module_id ? String(row.module_id) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  )

  if (!moduleIds.length) {
    return []
  }

  // console.log("Module IDs to fetch:", moduleIds)

  const { data: moduleRows, error: moduleError } = await sb
    .from("modules")
    .select("id, title, subject_id")
    .in("id", moduleIds)

  // console.log("Fetched modules for learning progress:", { moduleRows, moduleError })

  if (moduleError) {
    console.warn("Failed to load modules for learning progress:", moduleError.message)
    return []
  }

  const moduleLookup = new Map<string, ModuleRow>()
  const collectedModules: ModuleRow[] = []
  const registerModuleRow = (module?: ModuleRow | null) => {
    if (!module) return
    collectedModules.push(module)
    const moduleId =
      module?.id !== undefined && module?.id !== null ? String(module.id) : null
    const slug =
      typeof module?.slug === "string" && module.slug.trim().length > 0
        ? module.slug
        : null
    if (moduleId) {
      moduleLookup.set(moduleId, module)
    }
    if (slug) {
      moduleLookup.set(slug, module)
    }
  }
  ;(moduleRows || []).forEach((module) => registerModuleRow(module))

  const missingModuleIds = moduleIds.filter((id) => !moduleLookup.has(id))
  const slugCandidates = Array.from(
    new Set(
      missingModuleIds.filter(
        (id) => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  )
  if (slugCandidates.length) {
    const { data: slugModuleRows, error: slugModuleError } = await sb
      .from("modules")
      .select("id, title, subject_id, slug")
      .in("slug", slugCandidates)
    if (slugModuleError) {
      console.warn(
        "Failed to resolve slug-based modules for learning progress:",
        slugModuleError.message,
      )
    } else {
      ;(slugModuleRows || []).forEach((module) => registerModuleRow(module))
    }
  }

  const subjectIdsFromStatus = new Set(
    normalizedStatusRows
      .map((row) => (row?.subject_id ? String(row.subject_id) : null))
      .filter((id): id is string => Boolean(id)),
  )

  const subjectIds = Array.from(
    new Set(
      [
        ...subjectIdsFromStatus,
        ...(collectedModules
          .map((module) => (module?.subject_id ? String(module.subject_id) : null))
          .filter((id): id is string => Boolean(id))),
      ],
    ),
  )

  let subjectRows:
    | { id: string; title?: string | null; course_id?: string | null }[]
    | undefined
  if (subjectIds.length) {
    const { data, error } = await sb
      .from("subjects")
      .select("id, title, course_id")
      .in("id", subjectIds)
    if (error) {
      console.warn("Failed to load subjects for learning progress:", error.message)
    } else {
      subjectRows = data ?? []
    }
  }

  const subjectLookup = new Map(
    (subjectRows || []).map((subject) => [String(subject.id), subject]),
  )

  let subjectModuleRows:
    | { id?: string | number | null; title?: string | null; subject_id?: string | number | null }[]
    | undefined
  if (subjectIds.length) {
    const { data, error } = await sb
      .from("modules")
      .select("id, subject_id, title")
      .in("subject_id", subjectIds)
    if (error) {
      console.warn("Failed to load subject modules for learning progress:", error.message)
    } else {
      subjectModuleRows = data ?? []
    }
  }

  const subjectModuleMap = new Map<
    string,
    { id: string; title?: string | null }[]
  >()
  ;(subjectModuleRows || []).forEach((module) => {
    const subjectId = module?.subject_id ? String(module.subject_id) : null
    const moduleId =
      module?.id !== undefined && module?.id !== null
        ? String(module.id)
        : null
    if (!subjectId || !moduleId) return
    const list = subjectModuleMap.get(subjectId) ?? []
    list.push({ id: moduleId, title: module?.title ?? undefined })
    subjectModuleMap.set(subjectId, list)
  })

  const courseIdsFromStatus = new Set(
    normalizedStatusRows
      .map((row) => (row?.course_id ? String(row.course_id) : null))
      .filter((id): id is string => Boolean(id)),
  )

  const courseIds = Array.from(
    new Set(
      [
        ...courseIdsFromStatus,
        ...((subjectRows || [])
          .map((subject) => (subject?.course_id ? String(subject.course_id) : null))
          .filter((id): id is string => Boolean(id))),
      ],
    ),
  )

  let courseRows: { id: string; title?: string | null }[] | undefined
  if (courseIds.length) {
    const { data, error } = await sb
      .from("courses")
      .select("id, title")
      .in("id", courseIds)
    if (error) {
      console.warn("Failed to load courses for learning progress:", error.message)
    } else {
      courseRows = data ?? []
    }
  }

  const courseLookup = new Map(
    (courseRows || []).map((course) => [String(course.id), course]),
  )

  const moduleProgressMap = new Map<string, number>()
  normalizedStatusRows.forEach((status) => {
    const moduleId = status?.module_id ? String(status.module_id) : null
    if (!moduleId) return
    const normalized = clampDashboardProgressValue(status?.progress ?? null)
    moduleProgressMap.set(moduleId, normalized)
  })

  // Build subject-based progress summary
  const subjectProgressMap = new Map<
    string,
    {
      subjectId: string
      subjectTitle: string
      courseTitle?: string
      totalProgress: number
      moduleCount: number
      completedModules: number
      moduleIds: Set<string>
    }
  >()

  // First pass: Group modules by subject and calculate progress
  normalizedStatusRows.forEach((status) => {
    const moduleId = status?.module_id ? String(status.module_id) : null
    if (!moduleId) return

    const module = moduleLookup.get(moduleId)
    const subjectIdFromStatus = status?.subject_id ? String(status.subject_id) : null
    const subjectId =
      subjectIdFromStatus || (module?.subject_id ? String(module.subject_id) : null)

    if (!subjectId) return

    const subject = subjectLookup.get(subjectId)
    if (!subject) return

    const courseId = subject?.course_id ? String(subject.course_id) : null
    const course = courseId ? courseLookup.get(courseId) : undefined

    const normalizedProgress = moduleProgressMap.get(moduleId) ?? 0

    if (!subjectProgressMap.has(subjectId)) {
      subjectProgressMap.set(subjectId, {
        subjectId: subjectId,
        subjectTitle: subject.title ?? "Subject",
        courseTitle: course?.title ?? undefined,
        totalProgress: 0,
        moduleCount: 0,
        completedModules: 0,
        moduleIds: new Set()
      })
    }

    const subjectEntry = subjectProgressMap.get(subjectId)!
    subjectEntry.totalProgress += normalizedProgress
    subjectEntry.moduleCount += 1
    subjectEntry.moduleIds.add(moduleId)

    if (normalizedProgress >= 100) {
      subjectEntry.completedModules += 1
    }
  })

  // Convert to the expected LearningProgressCard format
  return Array.from(subjectProgressMap.values())
    .map((entry) => ({
      id: entry.subjectId,
      name: entry.subjectTitle,
      courseTitle: entry.courseTitle,
      value: entry.moduleCount > 0 ? Math.round(entry.totalProgress / entry.moduleCount) : 0,
      totalModules: entry.moduleCount,
      completedModules: entry.completedModules,
    }))
    .sort((a, b) => b.value - a.value)
}
function getProgressEncouragement(value: number): string {
  if (value >= 80) return "Almost there!"
  if (value >= 50) return "Great progress!"
  if (value > 0) return "Keep going!"
  return "Let's get started!"
}

function mapDashboardProgressFromApi(
  source?: DashboardData["learningProgress"],
): LearningProgressCard[] {
  if (!Array.isArray(source) || source.length === 0) {
    return []
  }

  return source
    .map((entry, index) => {
      if (!entry) return null
      const name =
        (typeof entry.subject_title === "string" && entry.subject_title.trim().length > 0
          ? entry.subject_title.trim()
          : undefined) ||
        (typeof entry.subject_id === "string" && entry.subject_id.trim().length > 0
          ? entry.subject_id.trim()
          : undefined) ||
        `Subject ${index + 1}`

      const totalModulesRaw =
        typeof entry.module_count === "number" && Number.isFinite(entry.module_count)
          ? entry.module_count
          : Number(entry.module_count ?? 0)
      const totalModules =
        Number.isFinite(totalModulesRaw) && totalModulesRaw > 0
          ? Math.round(totalModulesRaw)
          : 0

      const percent = clampDashboardProgressValue(entry.average_percentage ?? 0)

      const completedFromApi =
        typeof entry.completed_modules === "number" && Number.isFinite(entry.completed_modules)
          ? entry.completed_modules
          : Math.round((totalModules * percent) / 100)
      const completedModules =
        totalModules > 0
          ? Math.max(0, Math.min(totalModules, completedFromApi))
          : Math.max(0, completedFromApi)

      const courseTitle =
        typeof entry.course_title === "string" && entry.course_title.trim().length > 0
          ? entry.course_title.trim()
          : undefined

      const id =
        (typeof entry.subject_id === "string" && entry.subject_id.trim().length > 0
          ? entry.subject_id.trim()
          : undefined) ||
        `${name}-${index}`

      return {
        id,
        name,
        value: percent,
        totalModules,
        completedModules,
        courseTitle,
      }
    })
    .filter((card): card is LearningProgressCard => Boolean(card?.id && card?.name))
}
