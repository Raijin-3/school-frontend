import { NextResponse } from "next/server"
import { apiGet } from "@/lib/api"

type DashboardStreakPayload = {
  stats?: {
    xp?: number
    tier?: string
    streakDays?: number
  }
  streakCalendar?: {
    date: string
    present?: boolean
    isFuture?: boolean
    lastActivityAt?: string | null
  }[]
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const childId = url.searchParams.get("child_id")
    const path = childId ? `/v1/dashboard?child_id=${encodeURIComponent(childId)}` : "/v1/dashboard"
    const data = await apiGet<DashboardStreakPayload>(path)
    const payload: DashboardStreakPayload = {
      stats: data?.stats,
      streakCalendar: data?.streakCalendar,
    }
    return NextResponse.json(payload)
  } catch (error) {
    console.error("Failed to load parent streak data", error)
    return NextResponse.json(
      { error: "Unable to load streak information" },
      { status: 500 },
    )
  }
}
