import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { apiGet } from "@/lib/api";

type LeaderboardEntry = {
  user_id: string;
  rank_position: number;
};

export async function GET() {
  try {
  // Check if we have required environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // During static generation, return default values
    return NextResponse.json({
      name: "Learner",
      xp: 1540,
      level: 2,
      tier: "Silver",
      role: "student",
      assignedCourseCount: 0,
    });
  }

    const sb = supabaseServer();
    const [{ data: { user } }, dash] = await Promise.all([
      sb.auth.getUser(),
      apiGet<any>("/v1/dashboard").catch(() => null),
    ]);

    const xp = Number(dash?.stats?.xp ?? 0);
    const level =
      typeof dash?.stats?.level === "number"
        ? Number(dash.stats.level)
        : Math.floor(xp / 1000) + 1;
    const name = (user?.user_metadata?.full_name && String(user.user_metadata.full_name).trim()) || "Learner";
    const tier = String(dash?.stats?.tier || "Silver");
    const levelProgressPercent =
      typeof dash?.stats?.levelProgressPercent === "number"
        ? Number(dash.stats.levelProgressPercent)
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(((xp % 1000) / 1000) * 100),
            ),
          );
    let rank: number | null =
      typeof dash?.stats?.leaderboardPosition === "number"
        ? Number(dash.stats.leaderboardPosition)
        : null;
    let assignedCourseCount = 0

    if (user?.id) {
      try {
        const { count, error } = await sb
          .from("user_course_assignments")
          .select("course_id", { count: "exact", head: true })
          .eq("user_id", user.id)

        if (!error && typeof count === "number") {
          assignedCourseCount = Math.max(0, count)
        }
      } catch (assignedCountError) {
        console.warn("Failed to count assigned courses:", assignedCountError)
      }
    }

    if (user?.id) {
      try {
        const leaderboardEntries =
          (await apiGet<LeaderboardEntry[]>(
            "/v1/gamification/leaderboard/overall_points?limit=100",
          )) ?? [];
        const matchedEntry = leaderboardEntries.find(
          (entry) => entry.user_id === user.id,
        );
        if (matchedEntry) {
          rank = matchedEntry.rank_position;
        }
      } catch (leaderboardError) {
        console.warn("Failed to fetch leaderboard for rank:", leaderboardError);
      }
    }

    // Get user role from profile
    let role = "student"; // default role
    if (user?.id) {
      try {
        // Get user role from backend API
      const profileResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/profile/${user.id}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...(user?.access_token && { 'Authorization': `Bearer ${user.access_token}` }),
            },
            cache: 'no-store',
          }
        );
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          role = profile?.role || "student";
        }
      } catch (error) {
        console.warn("Could not fetch user role:", error);
        // Keep default role as student
      }
    }

    return NextResponse.json({ name, xp, level, tier, role, levelProgressPercent, rank, assignedCourseCount });
  } catch (e: any) {
    console.error("Error in /api/user/summary:", e);
    return NextResponse.json(
      { name: "Learner", xp: 1540, level: 2, tier: "Silver", role: "student", levelProgressPercent: 54, rank: null, assignedCourseCount: 0 },
      { status: 200 },
    );
  }
}

