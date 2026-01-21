"use client"

import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Sparkles, Flame, Trophy, TrendingUp, ChevronLeft, ChevronRight, X, Snowflake } from "lucide-react"
import { useGamification } from "@/components/gamification"
import {
  getGamificationLevelProgress,
  getLevelFromXp,
  type LevelProgress,
} from "@/lib/gamification-levels"
import { useUserSummary, type UserSummary } from "@/hooks/use-user-summary"
import { toast } from "@/lib/toast"
import { getFreezeAllowanceForTier } from "@/components/gamification/tier-benefits"
import {
  DAILY_LOGIN_REWARD_EVENT,
  type DailyLoginRewardCelebration,
  type DailyLoginRewardEventDetail,
  acknowledgeDailyLoginRewardCelebration,
  getDailyLoginRewardCelebration,
} from "@/lib/log-daily-login"
import { triggerXpCelebration } from "@/lib/xp-celebration"

interface DashboardHeroProps {
  displayName: string
  leaderboardPosition: number
  leaderboardEntries?: {
    rank: number
    name: string
    xp: number
    trend?: "up" | "down" | "steady"
    userId?: string
  }[]
  streakCalendar?: { date: string; present?: boolean | null; isFuture?: boolean }[]
  userId?: string
}

interface DashboardSummaryProviderProps {
  children: ReactNode
  summaryDefaults: UserSummary
  fallbackStreak: number
}

type DashboardSummaryValue = {
  summary: UserSummary
  xp: number
  level: number
  tier: string
  rank: number | null
  levelProgressPercent: number
  xpToNext: number
  streakDays: number
}

const DashboardSummaryContext = createContext<DashboardSummaryValue | null>(null)

const MONTH_WINDOW = 6
const MIN_MONTH_OFFSET = -MONTH_WINDOW
const MAX_MONTH_OFFSET = MONTH_WINDOW
const MS_IN_DAY = 86_400_000
const DATE_LOCALE = "en-US"
const DATE_TIMEZONE = "UTC"
const numberFormatter = new Intl.NumberFormat(DATE_LOCALE)

type StreakMilestone = {
  value: number
  title: string
  message: string
  gradientClass: string
  accentClass: string
  flameClass: string
  toastTitle: string
  toastDescription: string
}

const STREAK_MILESTONES: StreakMilestone[] = [
  {
    value: 7,
    title: "Weekly Blaze Achieved",
    message: "7-day streak! You're unstoppable.",
    gradientClass: "from-orange-500 to-rose-500",
    accentClass: "text-amber-50",
    flameClass: "text-white",
    toastTitle: "🔥 Weekly Blaze!",
    toastDescription: "Seven days of consistent learning. Keep the flame alive!",
  },
  {
    value: 30,
    title: "Legendary Ember Unlocked",
    message: "30 days in a row — you're a legend.",
    gradientClass: "from-purple-600 to-indigo-500",
    accentClass: "text-indigo-50",
    flameClass: "text-yellow-100",
    toastTitle: "👑 Legendary Streak!",
    toastDescription: "Thirty days non-stop. Enjoy bonus motivation and XP boosts.",
  },
]

type CelebrationConfig = {
  type: "daily" | "milestone"
  title: string
  message: string
  gradientClass: string
  accentClass: string
  flameClass: string
}

export function DashboardSummaryProvider({
  children,
  summaryDefaults,
  fallbackStreak,
}: DashboardSummaryProviderProps) {
  const summary = useUserSummary(summaryDefaults)
  const { stats } = useGamification()

  const gamificationXp =
    typeof stats?.total_points === "number" && Number.isFinite(stats.total_points)
      ? stats.total_points
      : null
  const summaryXp =
    typeof summary.xp === "number" && Number.isFinite(summary.xp)
      ? summary.xp
      : summaryDefaults.xp
  const xp = Math.max(0, gamificationXp ?? summaryXp ?? 0)

  const gamificationLevel =
    typeof stats?.current_level === "number" && stats.current_level > 0
      ? stats.current_level
      : null
  const summaryLevel =
    typeof summary.level === "number" && summary.level > 0
      ? summary.level
      : typeof summaryDefaults.level === "number" && summaryDefaults.level > 0
        ? summaryDefaults.level
        : null
  const derivedLevel = getLevelFromXp(xp)
  const level = gamificationLevel ?? summaryLevel ?? derivedLevel
  const tier = summary.tier || summaryDefaults.tier
  const rank =
    typeof summary.rank === "number"
      ? summary.rank
      : summaryDefaults.rank ?? null
  const fallbackStreakDays =
    typeof fallbackStreak === "number" && Number.isFinite(fallbackStreak)
      ? fallbackStreak
      : 0
  const streakDaysFromStats =
    typeof stats?.current_streak === "number" && Number.isFinite(stats.current_streak)
      ? stats.current_streak
      : null
  const streakDays = Math.max(streakDaysFromStats ?? 0, fallbackStreakDays)

  const levelProgress = getGamificationLevelProgress(level, xp)
  const xpToNext = Math.max(
    0,
    levelProgress.neededForNextLevel - levelProgress.currentLevelPoints,
  )

  const value: DashboardSummaryValue = {
    summary,
    xp,
    level,
    tier,
    rank,
    levelProgress,
    xpToNext,
    streakDays,
  }

  return (
    <DashboardSummaryContext.Provider value={value}>
      {children}
    </DashboardSummaryContext.Provider>
  )
}

function useDashboardSummary() {
  const context = useContext(DashboardSummaryContext)
  if (!context) {
    throw new Error(
      "useDashboardSummary must be used within a DashboardSummaryProvider",
    )
  }
  return context
}

export function DashboardHero({
  displayName,
  leaderboardPosition,
  leaderboardEntries,
  streakCalendar,
  userId,
}: DashboardHeroProps) {
  const { tier, rank, level, streakDays, xp } = useDashboardSummary()
  const [showStreakCelebration, setShowStreakCelebration] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [celebrationConfig, setCelebrationConfig] = useState<CelebrationConfig | null>(null)
  const [loginReward, setLoginReward] = useState<DailyLoginRewardCelebration | null>(null)
  const lastRewardRef = useRef<string | null>(null)
  const freezeTokenAllowance = useMemo(
    () => getFreezeAllowanceForTier(tier, xp),
    [tier, xp],
  )

  const rankDisplay =
    typeof rank === "number" ? rank : leaderboardPosition
  const currentUserId =
    typeof userId === "string" && userId.length > 0 ? userId : null
  const leaderboardData =
    Array.isArray(leaderboardEntries) && leaderboardEntries.length > 0
      ? leaderboardEntries
      : [
          {
            rank: rankDisplay || 1,
            name: displayName,
            xp: 0,
            userId: currentUserId ?? undefined,
          },
        ]
  const hasUserIdMatch = Boolean(
    currentUserId &&
      leaderboardData.some(
        (entry) => entry?.userId && entry.userId === currentUserId,
      ),
  )
  const [monthOffset, setMonthOffset] = useState(0)
  const todayUtc = useMemo(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }, [])
  const todayIso = todayUtc.toISOString().slice(0, 10)
  const yesterdayIso = new Date(todayUtc.getTime() - MS_IN_DAY).toISOString().slice(0, 10)

  const presenceMap = useMemo(() => {
    const timeline =
      Array.isArray(streakCalendar) && streakCalendar.length > 0
        ? streakCalendar
        : generateFallbackCalendar(streakDays)
    const map = new Map<string, { present: boolean; isFuture?: boolean }>()
    timeline.forEach((entry) => {
      const iso = entry?.date?.slice(0, 10)
      if (!iso) return
      map.set(iso, {
        present: Boolean(entry.present),
        isFuture: Boolean(entry.isFuture),
      })
    })
    if (streakDays > 0) {
      const todayIso = todayUtc.toISOString().slice(0, 10)
      const existing = map.get(todayIso)
      if (!existing || !existing.isFuture) {
        map.set(todayIso, { present: true, isFuture: false })
      }
    }
    return map
  }, [streakCalendar, streakDays, todayUtc])

  const visibleMonthDate = useMemo(() => {
    const base = new Date(todayUtc)
    base.setUTCDate(1)
    base.setUTCMonth(base.getUTCMonth() + monthOffset)
    return base
  }, [todayUtc, monthOffset])

  const visibleMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(DATE_LOCALE, {
        month: "long",
        year: "numeric",
        timeZone: DATE_TIMEZONE,
      }).format(visibleMonthDate),
    [visibleMonthDate],
  )

  const visibleDays = useMemo(() => {
    const startOfMonth = new Date(visibleMonthDate)
    const endOfMonth = new Date(
      Date.UTC(
        startOfMonth.getUTCFullYear(),
        startOfMonth.getUTCMonth() + 1,
        0,
      ),
    )
    const startOfCalendar = getStartOfWeek(startOfMonth)
    const endOfCalendar = getEndOfWeek(endOfMonth)
    const days: Array<{
      iso: string
      weekday: string
      monthLabel: string
      dayNumber: number
      isPresent: boolean
      isFuture: boolean
      isToday: boolean
      isCurrentMonth: boolean
      isFrozen?: boolean
    }> = []

    for (
      let ts = startOfCalendar.getTime();
      ts <= endOfCalendar.getTime();
      ts += MS_IN_DAY
    ) {
      const dateObject = new Date(ts)
      const iso = dateObject.toISOString().slice(0, 10)
      const entry = presenceMap.get(iso)
      const isFuture = entry?.isFuture ?? iso > todayIso
      const weekday = dateObject
        .toLocaleDateString(DATE_LOCALE, {
          weekday: "short",
          timeZone: DATE_TIMEZONE,
        })
        .replace(".", "")
        .slice(0, 3)
        .toUpperCase()
      const monthLabel = dateObject.toLocaleDateString(DATE_LOCALE, {
        month: "short",
        timeZone: DATE_TIMEZONE,
      })
      days.push({
        iso,
        weekday,
        monthLabel,
        dayNumber: dateObject.getUTCDate(),
        isPresent: Boolean(entry?.present) && !isFuture,
        isFuture,
        isToday: iso === todayIso,
        isCurrentMonth: dateObject.getUTCMonth() === visibleMonthDate.getUTCMonth(),
      })
    }
    let remainingFreezes = Number.isFinite(freezeTokenAllowance)
      ? Math.max(0, freezeTokenAllowance || 0)
      : Math.max(0, streakDays)
    let streakCoverage = 0
    for (let i = days.length - 1; i >= 0 && streakCoverage < streakDays; i -= 1) {
      const day = days[i]
      if (day.isFuture) continue
      const dayDate = new Date(day.iso)
      if (dayDate > todayUtc) continue
      if (day.isPresent) {
        streakCoverage += 1
        continue
      }
      if (remainingFreezes > 0) {
        day.isFrozen = true
        remainingFreezes -= 1
        streakCoverage += 1
        continue
      }
      break
    }

    return days
  }, [presenceMap, visibleMonthDate, todayIso, todayUtc, freezeTokenAllowance, streakDays])

  const todayEntry = presenceMap.get(todayIso)
  const yesterdayEntry = presenceMap.get(yesterdayIso)
  const isTodayVisible = visibleDays.some((day) => day.isToday)
  const shouldAnimateToday =
    monthOffset === 0 &&
    isTodayVisible &&
    Boolean(todayEntry?.present) &&
    Boolean(yesterdayEntry?.present)
  const celebrationParticles = useMemo(() => Array.from({ length: 12 }, (_, index) => index), [])
  const frozenDaysCount = useMemo(
    () => visibleDays.filter((day) => day.isFrozen && !day.isFuture).length,
    [visibleDays],
  )
  const freezeTokensRemaining = Math.max(
    0,
    freezeTokenAllowance - frozenDaysCount,
  )
  const freezeIndicatorCount = Number.isFinite(freezeTokenAllowance)
    ? freezeTokenAllowance
    : 6
  const freezeBalanceLabel = Number.isFinite(freezeTokenAllowance)
    ? `${freezeTokensRemaining} of ${freezeTokenAllowance} tokens left`
    : "Unlimited streak freeze tokens this month"

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return
    const syncReward = (candidate?: DailyLoginRewardCelebration | null) => {
      const normalized =
        candidate &&
        candidate.date === todayIso &&
        !candidate.acknowledged
          ? candidate
          : null
      setLoginReward(normalized)
      if (normalized) {
        const rewardId = `${normalized.date}:${normalized.xpAwarded}`
        if (lastRewardRef.current !== rewardId) {
          triggerXpCelebration({
            amount: normalized.xpAwarded,
            label: `+${normalized.xpAwarded} XP Daily Login`,
          })
          lastRewardRef.current = rewardId
        }
      } else {
        lastRewardRef.current = null
      }
    }

    syncReward(getDailyLoginRewardCelebration(userId))

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DailyLoginRewardEventDetail>).detail
      if (!detail || detail.userId !== userId) return
      syncReward(detail.reward)
    }

    window.addEventListener(
      DAILY_LOGIN_REWARD_EVENT,
      handler as EventListener,
    )
    return () => {
      window.removeEventListener(
        DAILY_LOGIN_REWARD_EVENT,
        handler as EventListener,
      )
    }
  }, [todayIso, userId, lastRewardRef])

  useEffect(() => {
    if (typeof window === "undefined") return
    const streak = Math.max(0, streakDays || 0)
    if (streak <= 0) return
    const todayKey = new Date().toISOString().slice(0, 10)
    const storageKeyBase = `jarvis.streak-celebration.${todayKey}`
    const storageKey =
      typeof userId === "string" && userId.length > 0
        ? `${storageKeyBase}.${userId}`
        : storageKeyBase
    const stored = window.localStorage.getItem(storageKey)
    if (stored === `${streak}`) return
    window.localStorage.setItem(storageKey, `${streak}`)
    setCelebrationConfig({
      type: "daily",
      title: `${streak} Day Streak`,
      message: "Daily streak on fire!",
      gradientClass: "from-amber-400 to-rose-500",
      accentClass: "text-amber-50",
      flameClass: "text-white",
    })
    setShowStreakCelebration(true)
  }, [streakDays, userId])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!userId) return
    const streak = Math.max(0, streakDays || 0)
    if (streak <= 0) return
    const milestoneKey = `jarvis.streak-milestone.${userId}`
    const lastCelebrated = Number(window.localStorage.getItem(milestoneKey) ?? "0")
    const milestone = STREAK_MILESTONES
      .filter((entry) => streak >= entry.value)
      .sort((a, b) => b.value - a.value)
      .find((entry) => lastCelebrated < entry.value)

    if (!milestone) return

    window.localStorage.setItem(milestoneKey, String(milestone.value))
    setCelebrationConfig({
      type: "milestone",
      title: milestone.title,
      message: milestone.message,
      gradientClass: milestone.gradientClass,
      accentClass: milestone.accentClass,
      flameClass: milestone.flameClass,
    })
    setShowStreakCelebration(true)
    toast.success(milestone.toastTitle, {
      description: milestone.toastDescription,
      duration: 6000,
    })
  }, [streakDays, userId])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!showStreakCelebration) return
    const timeout = window.setTimeout(() => setShowStreakCelebration(false), 5000)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [showStreakCelebration])

  const overlayGradientClass = celebrationConfig?.gradientClass ?? "from-amber-400 to-rose-500"
  const overlayAccentClass = celebrationConfig?.accentClass ?? "text-amber-50"
  const overlayFlameClass = celebrationConfig?.flameClass ?? "text-white"
  const overlayTitle = celebrationConfig?.title ?? "Streak in Progress"
  const overlayMessage = celebrationConfig?.message ?? "Daily streak on fire!"

  const dismissLoginReward = () => {
    if (userId) {
      acknowledgeDailyLoginRewardCelebration(userId)
    } else {
      setLoginReward(null)
    }
  }

  const loginRewardBanner = loginReward ? (
    <div className="mb-4 rounded-2xl border border-emerald-200/60 bg-gradient-to-r from-emerald-400/90 to-cyan-500/90 p-4 text-white shadow-lg shadow-emerald-400/30">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="h-10 w-10 text-white drop-shadow-lg" />
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/70">
              Daily Login Bonus
            </p>
            <p className="text-2xl font-semibold">
              +{loginReward.xpAwarded} XP unlocked!
            </p>
            <p className="text-sm text-white/80">
              Streak now {loginReward.streakCount ?? streakDays} days —{" "}
              {loginReward.streakAction === "reset"
                ? "fresh start!"
                : "keep the fire going."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissLoginReward}
          className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-emerald-600 shadow-md transition hover:bg-white"
        >
          Keep Going
          <TrendingUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  ) : null

  const celebrationOverlay =
    showStreakCelebration && isMounted && celebrationConfig
      ? createPortal(
          <div className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-b from-amber-200/20 via-transparent to-indigo-200/10 blur-3xl animate-pulse" />
            <div className="relative flex flex-col items-center gap-3 text-white drop-shadow-2xl pointer-events-auto">
              <button
                type="button"
                aria-label="Dismiss streak celebration"
                onClick={() => setShowStreakCelebration(false)}
                className="absolute -top-3 -right-3 rounded-full bg-white/90 text-rose-500 p-1 shadow-md hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
              <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br ${overlayGradientClass} shadow-[0_0_30px_rgba(249,115,22,0.5)] animate-pulse`}>
                {celebrationParticles.map((index) => {
                  const angle = (index / celebrationParticles.length) * 360
                  return (
                    <span
                      key={index}
                      className="absolute h-2 w-2 rounded-full bg-white/80 animate-ping"
                      style={{
                        transform: `rotate(${angle}deg) translateY(-95px)`,
                        animationDelay: `${index * 120}ms`,
                      }}
                    />
                  )
                })}
                <div className="relative flex flex-col items-center gap-1">
                  <Flame className={`h-8 w-8 ${overlayFlameClass} animate-pulse`} />
                  <div className="text-5xl font-black tracking-tight animate-bounce">
                    {streakDays}
                  </div>
                  <div className="text-sm uppercase tracking-[0.3em] text-white/90">
                    Days
                  </div>
                </div>
              </div>
              {celebrationConfig.type === "milestone" && (
                <span className="text-xs uppercase tracking-[0.35em] text-white/80">
                  {overlayTitle}
                </span>
              )}
              <div className={`text-xl font-semibold drop-shadow-lg animate-bounce text-center px-4 py-1 rounded-full bg-black/30 ${overlayAccentClass}`}>
                {overlayMessage}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      {celebrationOverlay}
      {loginRewardBanner}
      <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-8 backdrop-blur-xl shadow-xl mb-8">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-emerald-500/5"></div>
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-indigo-200/30 to-purple-200/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-emerald-200/20 to-cyan-200/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 px-4 py-2 text-sm font-medium text-indigo-700">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            AI-Powered Learning Dashboard
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full border text-sm font-medium ${getTierBadgeClasses(tier)}`}
            >
              {tier} Tier
            </div>
        
          </div>
        </div>

        <h1 className="text-4xl font-bold leading-tight text-gray-900 mb-3">
          Welcome back,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            {displayName}
          </span>
          !
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          Ready to continue your analytics journey? Let's make today count!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1">
            <div className="h-full rounded-xl bg-white/70 border border-white/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                  <Trophy className="h-4 w-4 text-indigo-500" /> Leaderboard
                </div>
                <span className="text-xs text-gray-500">Xp</span>
              </div>
              <div className="space-y-3">
                {leaderboardData.map((entry) => {
                  console.log("Entry:", entry);
                  const isCurrentUser =
                    (currentUserId && entry.userId === currentUserId) ||
                    (!hasUserIdMatch &&
                      typeof rankDisplay === "number" &&
                      entry.rank === rankDisplay)
                  return (
                    <div
                      key={entry.userId ?? `${entry.rank}-${entry.name}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full font-semibold ${getRankBadgeClasses(
                            entry.rank,
                          )}`}
                        >
                          {entry.rank}
                        </span>
                        <div>
                          <div className="font-medium text-gray-900">
                            {entry.name}
                          </div>
                          <div
                            className={`text-xs ${
                              isCurrentUser
                                ? "text-indigo-500 font-semibold"
                                : "text-gray-500"
                            }`}
                          >
                            {isCurrentUser ? "You" : "Top learner"}
                          </div>
                        </div>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {entry.xp}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <div className="h-full rounded-xl bg-white/70 border border-white/60 p-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <Flame className="h-4 w-4 text-orange-500" />
                    Daily Streak Calendar
                  </div>
                  <div className="text-sm text-gray-500">
                    Current streak:{" "}
                    <span className="font-semibold text-emerald-600">
                      {streakDays} days
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    View up to 6 months back or ahead
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMonthOffset((prev) =>
                          Math.max(prev - 1, MIN_MONTH_OFFSET),
                        )
                      }
                      disabled={monthOffset <= MIN_MONTH_OFFSET}
                      className="rounded-full border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold text-gray-700">
                      {visibleMonthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMonthOffset((prev) =>
                          Math.min(prev + 1, MAX_MONTH_OFFSET),
                        )
                      }
                      disabled={monthOffset >= MAX_MONTH_OFFSET}
                      className="rounded-full border border-gray-200 p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/80 to-white px-4 py-3 text-xs text-sky-900 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                      <Snowflake className="h-4 w-4 text-sky-500" />
                      Streak Freeze
                    </span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: freezeIndicatorCount }, (_, index) => {
                        const spent = index < frozenDaysCount
                        return (
                          <span
                            key={index}
                            className={`h-4 w-4 rounded-full border ${spent ? "bg-sky-400 border-sky-500" : "bg-white border-sky-200"}`}
                          ></span>
                        )
                      })}
                    </div>
                    <span className="font-semibold text-sky-700">
                      {freezeBalanceLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sky-700">
                    Snowy days mark auto-freeze protection—your {tier} tier includes{" "}
                    {Number.isFinite(freezeTokenAllowance) ? freezeTokenAllowance : "unlimited"}{" "}
                    token{Number.isFinite(freezeTokenAllowance) && freezeTokenAllowance === 1 ? "" : "s"} each month to pause without losing progress.
                  </p>
                </div>
              </div>
              <div className="mt-4 -mx-3 sm:mx-0 overflow-x-auto">
                <div className="inline-grid min-w-[520px] grid-cols-7 gap-2 px-3 sm:px-0 sm:min-w-0 sm:w-full sm:gap-3">
                  {visibleDays.map((day) => (
                    <div
                      key={day.iso}
                      className="text-center flex flex-col items-center gap-1 text-[10px] sm:text-xs"
                    >
                      <span
                        className={`font-semibold tracking-wide ${
                          day.isCurrentMonth ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {day.weekday}
                      </span>
                      <div
                        className={`relative w-12 h-14 sm:w-14 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition transform overflow-hidden ${
                          day.isFuture
                            ? "bg-slate-50 border-slate-200 text-slate-400"
                            : day.isPresent
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : day.isFrozen
                            ? "bg-gradient-to-br from-sky-50 via-white to-slate-50 border-sky-200 text-sky-700 shadow-[0_0_12px_rgba(125,211,252,0.35)]"
                            : "bg-rose-50 border-rose-200 text-rose-500"
                        } ${day.isCurrentMonth ? "" : "opacity-60"} ${
                          shouldAnimateToday && day.isToday
                            ? "animate-pulse shadow-lg shadow-emerald-200 scale-105"
                            : ""
                        }`}
                        title={
                          day.isFuture
                            ? "Upcoming"
                            : day.isPresent
                            ? "Completed"
                            : day.isFrozen
                            ? "Frozen rest day"
                            : "Missed"
                        }
                      >
                        {day.isFrozen && (
                          <>
                            <Snowflake className="absolute left-1 top-1 h-3 w-3 text-sky-400 opacity-70" />
                            <Snowflake className="absolute right-1 bottom-1 h-3 w-3 text-sky-300 opacity-60" />
                          </>
                        )}
                        <span className="text-[10px] sm:text-[11px] font-semibold">
                          {day.monthLabel}
                        </span>
                        <span className="text-base sm:text-lg font-bold leading-none">
                          {day.dayNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400"></span>
                  Present
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-3 w-3 rounded-full bg-rose-400"></span>
                  Missed
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-3 w-3 rounded-full bg-sky-400"></span>
                  Frozen rest day
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-3 w-3 rounded-full bg-slate-300"></span>
                  Upcoming
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

function getTierBadgeClasses(tier: string) {
  switch (tier.toLowerCase()) {
    case "gold":
      return "text-yellow-600 bg-yellow-100 border-yellow-200"
    case "silver":
      return "text-gray-600 bg-gray-100 border-gray-200"
    default:
      return "text-amber-600 bg-amber-100 border-amber-200"
  }
}

function getRankBadgeClasses(rank: number) {
  if (rank === 1) {
    return "bg-amber-100 text-amber-700"
  }
  if (rank === 2) {
    return "bg-slate-100 text-slate-700"
  }
  if (rank === 3) {
    return "bg-orange-100 text-orange-700"
  }
  return "bg-indigo-50 text-indigo-700"
}

function getStartOfWeek(date: Date) {
  const clone = new Date(date)
  clone.setUTCHours(0, 0, 0, 0)
  const day = clone.getUTCDay()
  const diff = (day + 6) % 7
  clone.setUTCDate(clone.getUTCDate() - diff)
  return clone
}

function getEndOfWeek(date: Date) {
  const start = getStartOfWeek(date)
  const clone = new Date(start)
  clone.setUTCDate(clone.getUTCDate() + 6)
  return clone
}

function generateFallbackCalendar(
  streakDays: number,
  monthsBefore = MONTH_WINDOW,
  monthsAfter = MONTH_WINDOW,
) {
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - monthsBefore, 1))
  const end = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + monthsAfter + 1, 0))
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_IN_DAY) + 1
  const todayIndex = Math.round((todayUtc.getTime() - start.getTime()) / MS_IN_DAY)
  const earliestPresentIndex = Math.max(0, todayIndex - Math.min(streakDays, totalDays) + 1)

  return Array.from({ length: totalDays }).map((_, index) => {
    const iso = new Date(start.getTime() + index * MS_IN_DAY).toISOString().slice(0, 10)
    const isFuture = index > todayIndex
    const present =
      !isFuture && index >= earliestPresentIndex && index <= todayIndex
    return { date: iso, present, isFuture }
  })
}
