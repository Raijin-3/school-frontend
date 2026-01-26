import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabase-server"
import { getBearerTokenFromRequest } from "@/lib/server/supabase-session"
import {
  getGamificationLevelProgress,
  getLevelFromXp,
} from "@/lib/gamification-levels"

type DashboardResponse = {
  role?: string
  leaderboardPosition?: number
  stats?: {
    xp?: number
    level?: number
    tier?: string
    levelProgressPercent?: number
    currentStreak?: number
    longestStreak?: number
  }
  user?: { displayName?: string }
}

type ParentSummaryPayload = {
  name: string
  xp: number
  level: number
  levelProgressPercent: number
  tier: string
  role: string
  rank: number | null
  assignedCourseCount: number
  currentStreak: number
  longestStreak: number
}

const DEFAULT_SUMMARY: ParentSummaryPayload = {
  name: "Student",
  xp: 0,
  level: 1,
  levelProgressPercent: 0,
  tier: "Bronze",
  role: "student",
  rank: null,
  assignedCourseCount: 0,
  currentStreak: 0,
  longestStreak: 0,
}

export async function GET(req: Request) {
  try {
    const bearerToken = await getBearerTokenFromRequest(req)
    if (!bearerToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      )
    }

    const url = new URL(req.url)
    const childId = url.searchParams.get("child_id")?.trim()
    if (!childId) {
      return NextResponse.json(
        { error: "child_id is required" },
        { status: 400 },
      )
    }

    const API_URL =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:8080"

    const fetchWithToken = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${API_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
        cache: "no-store",
      })
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)
        throw new Error(`API ${path} failed: ${response.status} ${text}`)
      }
      return (await response.json()) as T
    }

    const dashboardPromise = fetchWithToken<DashboardResponse>(
      `/v1/dashboard?child_id=${encodeURIComponent(childId)}`,
    )
    const dashboard = await dashboardPromise

    const stats = dashboard?.stats ?? {}
    const xp = Number.isFinite(stats?.xp ?? 0) ? Number(stats.xp) : 0
    const derivedLevel = getLevelFromXp(xp)
    const fallbackProgress = Math.max(
      0,
      Math.min(
        100,
        getGamificationLevelProgress(derivedLevel, xp).progressPercent,
      ),
    )
    const level =
      typeof stats?.level === "number" && Number.isFinite(stats.level)
        ? stats.level
        : derivedLevel
    const levelProgressPercent =
      typeof stats?.levelProgressPercent === "number"
        ? Math.max(0, Math.min(100, stats.levelProgressPercent))
        : fallbackProgress
    const tier = stats?.tier ?? "Bronze"
    const rank =
      typeof dashboard?.leaderboardPosition === "number"
        ? dashboard.leaderboardPosition
        : null
    const role = dashboard?.role ?? "student"
    const name =
      dashboard?.user?.displayName?.trim() ||
      dashboard?.user?.displayName ||
      "Student"
    const supabase = supabaseServer()
    let profileCurrentStreak = 0
    let profileLongestStreak = 0
    try {
      const { data } = await supabase
        .from("profiles")
        .select("current_streak,longest_streak")
        .eq("id", childId)
        .maybeSingle()
      profileCurrentStreak =
        data?.current_streak ??
        data?.currentStreak ??
        profileCurrentStreak
      profileLongestStreak =
        data?.longest_streak ??
        data?.longestStreak ??
        profileLongestStreak
    } catch (profileError) {
      console.warn("Unable to fetch child profile streaks", profileError)
    }
    const currentStreak = Number.isFinite(Number(profileCurrentStreak))
      ? Number(profileCurrentStreak)
      : 0
    const longestStreak = Number.isFinite(Number(profileLongestStreak))
      ? Number(profileLongestStreak)
      : 0

    const summary: ParentSummaryPayload = {
      name,
      xp,
      level,
      levelProgressPercent,
      tier,
      role,
      rank,
      assignedCourseCount: 0,
      currentStreak,
      longestStreak,
    }

    try {
      const sb = supabaseServer()
      const { count, error } = await sb
        .from("user_course_assignments")
        .select("course_id", { count: "exact", head: true })
        .eq("user_id", childId)
      if (!error && typeof count === "number") {
        summary.assignedCourseCount = Math.max(0, count)
      }
    } catch (courseCountError) {
      console.warn("Unable to count child courses", courseCountError)
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error("Failed to load parent summary", error)
    return NextResponse.json(DEFAULT_SUMMARY)
  }
}
