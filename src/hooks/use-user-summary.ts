"use client"

import { useEffect, useRef, useState } from "react"
import { GAMIFICATION_PROGRESS_EVENT } from "@/lib/gamification"
import {
  getGamificationLevelProgress,
  getLevelFromXp,
} from "@/lib/gamification-levels"

type GamificationProgressEventDetail = {
  totalXp?: number
  currentLevel?: number
}

export type UserSummary = {
  name: string
  email: string
  tier: string
  xp: number
  level: number
  levelProgressPercent: number
  role: string
  rank: number | null
  assignedCourseCount: number
  avatar?: string
}

function deriveLevelStats(xp: number) {
  const normalizedXp = Number.isFinite(xp) ? Math.max(0, xp) : 0
  const derivedLevel = getLevelFromXp(normalizedXp)
  const progress = getGamificationLevelProgress(
    derivedLevel,
    normalizedXp,
  ).progressPercent
  return {
    derivedLevel,
    derivedProgressPercent: Math.max(0, Math.min(100, progress)),
  }
}

function normalizeSummary(initial: UserSummary): UserSummary {
  const xp = Number.isFinite(initial.xp) ? Math.max(0, initial.xp) : 0
  const { derivedLevel, derivedProgressPercent } = deriveLevelStats(xp)
  return {
    ...initial,
    xp,
    level: derivedLevel,
    levelProgressPercent: derivedProgressPercent,
  }
}

export function useUserSummary(initialSummary: UserSummary) {
  const [summary, setSummary] = useState<UserSummary>(() =>
    normalizeSummary(initialSummary),
  )
  const summaryFetcherRef = useRef<null | (() => Promise<void>)>(null)

  useEffect(() => {
    let cancelled = false
    const loadSummary = async () => {
      try {
        const res = await fetch("/api/user/summary", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (!data || cancelled) return
      setSummary((prev) => {
        const xp =
          typeof data.xp === "number" && Number.isFinite(data.xp)
            ? Math.max(0, data.xp)
            : prev.xp
        const resolvedTier =
          typeof data.tier === "string" ? data.tier : prev.tier
        const resolvedName =
          typeof data.name === "string" && data.name.trim()
            ? data.name
            : prev.name
        const resolvedRole =
          typeof data.role === "string" && data.role.trim()
            ? data.role
            : prev.role
        const { derivedLevel, derivedProgressPercent } = deriveLevelStats(xp)
        const rank =
          typeof data.rank === "number" ? data.rank : prev.rank ?? null
        const assignedCourseCount =
          typeof data.assignedCourseCount === "number"
            ? Math.max(0, Math.round(data.assignedCourseCount))
            : prev.assignedCourseCount
        return {
          ...prev,
          xp,
          level: derivedLevel,
          tier: resolvedTier,
          name: resolvedName,
          role: resolvedRole,
          levelProgressPercent: derivedProgressPercent,
          rank,
          assignedCourseCount,
        }
      })
      } catch {}
    }
    summaryFetcherRef.current = loadSummary
    void loadSummary()
    return () => {
      cancelled = true
      summaryFetcherRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleGamificationProgress = (event: Event) => {
      const detail = (event as CustomEvent<GamificationProgressEventDetail>).detail
      if (!detail) {
        return
      }
      setSummary((prev) => {
        const nextXp =
          typeof detail.totalXp === "number" ? detail.totalXp : prev.xp
        const { derivedLevel, derivedProgressPercent } = deriveLevelStats(nextXp)
        if (
          nextXp === prev.xp &&
          derivedLevel === prev.level &&
          derivedProgressPercent === prev.levelProgressPercent
        ) {
          return prev
        }
        return {
          ...prev,
          xp: nextXp,
          level: derivedLevel,
          levelProgressPercent: derivedProgressPercent,
        }
      })
      summaryFetcherRef.current && summaryFetcherRef.current()
    }
    window.addEventListener(
      GAMIFICATION_PROGRESS_EVENT,
      handleGamificationProgress,
    )
    return () => {
      window.removeEventListener(
        GAMIFICATION_PROGRESS_EVENT,
        handleGamificationProgress,
      )
    }
  }, [])

  return summary
}
