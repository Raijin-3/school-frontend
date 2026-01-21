import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { UnifiedHeader } from "./unified-header"

export async function HeaderProvider() {
  let user = null
  let userProfile = null

  try {
    const sb = supabaseServer()
    const { data: { user: supabaseUser } } = await sb.auth.getUser()
    user = supabaseUser

    if (user) {
      try {
        const profileResponse = await apiGet<any>("/v1/profile")
        userProfile = normalizeProfile(profileResponse)
      } catch {
        // Profile fetch failed, continue without profile data
      }
      try {
        const gamificationStats = await apiGet<{
          total_points?: number
          current_level?: number
        }>(`/v1/gamification/stats/${user.id}`)
        if (gamificationStats) {
          const enriched = {
            ...(userProfile ?? {}),
            xp:
              typeof gamificationStats.total_points === "number"
                ? gamificationStats.total_points
                : userProfile?.xp,
            level:
              typeof gamificationStats.current_level === "number"
                ? gamificationStats.current_level
                : userProfile?.level,
          }
          userProfile = normalizeProfile(enriched)
        }
      } catch {
        // Gamification stats fetch failed; skip it
      }
    }
  } catch (error) {
    console.error("Error in HeaderProvider:", error)
    // During static generation or when Supabase is unavailable, 
    // continue with null user
  }

  return <UnifiedHeader user={user} userProfile={userProfile} />
}

function normalizeProfile(profile: Record<string, any> | null | undefined) {
  if (!profile) return null
  const xp =
    typeof profile.xp === "number"
      ? profile.xp
      : typeof profile.total_points === "number"
      ? profile.total_points
      : typeof profile.points === "number"
      ? profile.points
      : undefined
  const level =
    typeof profile.level === "number"
      ? profile.level
      : typeof profile.current_level === "number"
      ? profile.current_level
      : undefined
  return {
    ...profile,
    xp,
    level,
  }
}
