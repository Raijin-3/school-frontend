import { triggerXpCelebration } from "./xp-celebration";

export const GAMIFICATION_PROGRESS_EVENT = "jarvis-gamification-progress";

type GamificationProgressDetail = {
  userId?: string | null;
  totalXp?: number;
  currentLevel?: number;
  xpAwarded?: number;
};

function broadcastGamificationProgress(detail: GamificationProgressDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(GAMIFICATION_PROGRESS_EVENT, { detail }),
  );
}

async function syncGamificationStats(userId?: string | null) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const res = await fetch(
      `/api/gamification/stats?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return;
    const stats = await res.json();
    broadcastGamificationProgress({
      userId,
      totalXp:
        typeof stats.total_points === "number" ? stats.total_points : undefined,
      currentLevel:
        typeof stats.current_level === "number"
          ? stats.current_level
          : undefined,
    });
  } catch {
    // best-effort sync
  }
}

// Client-side helpers use Next Route Handlers under /api/gamification
// to securely talk to the backend with SSR token forwarding.

export interface ActivityData {
  userId: string;
  activityType: string;
  referenceId?: string;
  referenceType?: string;
  durationMinutes?: number;
}

export interface AssessmentResult {
  score: number;
  maxScore: number;
  timeSpent: number;
  completed: boolean;
}

export type GamificationDifficulty = "easy" | "medium" | "hard";
export type GamificationQuestionType = "quiz" | "practice";

export interface QuestionAttemptPayload {
  questionId: string;
  questionType: GamificationQuestionType;
  difficulty: GamificationDifficulty;
  isCorrect: boolean;
}

export interface RecordQuestionAttemptOptions {
  suppressCelebration?: boolean;
}

let cachedBrowserSupabase: any | null = null;

async function getBrowserSupabaseClient() {
  if (cachedBrowserSupabase) {
    return cachedBrowserSupabase;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const mod = await import("./supabase-browser");
    cachedBrowserSupabase = mod.supabaseBrowser();
    return cachedBrowserSupabase;
  } catch (error) {
    console.error("Failed to initialize Supabase browser client for gamification:", error);
    return null;
  }
}

async function getClientAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const supabase = await getBrowserSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Unable to read Supabase session for gamification:", error.message);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (error) {
    console.warn("Unexpected error fetching Supabase auth token for gamification:", error);
    return null;
  }
}

/**
 * Records a user activity and triggers gamification events
 */
export async function recordActivity(data: ActivityData): Promise<void> {
  try {
    await fetch("/api/gamification/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: data.userId,
        activityType: data.activityType,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        durationMinutes: data.durationMinutes,
      }),
    });
    await syncGamificationStats(data.userId);
  } catch (error) {
    console.error("Failed to record activity:", error);
    // Don't throw - gamification should not break the main flow
  }
}

/**
 * Records assessment completion with appropriate gamification rewards
 */
export async function recordAssessmentCompletion(
  userId: string,
  assessmentId: string,
  result: AssessmentResult
): Promise<void> {
  try {
    // Record quiz completion activity
    await recordActivity({
      userId,
      activityType: 'quiz_completed',
      referenceId: assessmentId,
      referenceType: 'assessment',
      durationMinutes: Math.ceil(result.timeSpent / 60)
    });

    // Award perfect score bonus if applicable
    if (result.completed && result.score === result.maxScore) {
      await recordActivity({
        userId,
        activityType: 'perfect_score',
        referenceId: assessmentId,
        referenceType: 'assessment'
      });
    }
  } catch (error) {
    console.error('Failed to record assessment completion:', error);
  }
}

/**
 * Records course or section progress
 */
export async function recordCourseProgress(
  userId: string,
  courseId: string,
  sectionId: string,
  progressType: 'started' | 'section_completed' | 'completed',
  durationMinutes?: number
): Promise<void> {
  try {
    const activityMap = {
      'started': 'course_started',
      'section_completed': 'section_completed', 
      'completed': 'course_completed'
    };

    await recordActivity({
      userId,
      activityType: activityMap[progressType],
      referenceId: progressType === 'section_completed' ? sectionId : courseId,
      referenceType: progressType === 'section_completed' ? 'section' : 'course',
      durationMinutes
    });
  } catch (error) {
    console.error('Failed to record course progress:', error);
  }
}

/**
 * Records lecture or content viewing
 */
export async function recordContentViewing(
  userId: string,
  contentId: string,
  contentType: 'lecture' | 'practice' | 'reading',
  durationMinutes: number
): Promise<void> {
  try {
    await recordActivity({
      userId,
      activityType: 'lecture_viewed',
      referenceId: contentId,
      referenceType: contentType,
      durationMinutes
    });
  } catch (error) {
    console.error('Failed to record content viewing:', error);
  }
}

/**
 * Records login activity for streak tracking
 */
export async function recordLogin(userId: string): Promise<void> {
  try {
    await recordActivity({
      userId,
      activityType: 'login'
    });
  } catch (error) {
    console.error('Failed to record login:', error);
  }
}

/**
 * Triggers gamification calculation for dynamic challenges based on user behavior
 */
export async function triggerChallengeUpdate(userId: string): Promise<void> {
  try {
    // Use a dedicated Next route that calls the backend refresh endpoint
    await fetch('/api/gamification/challenges/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch (error) {
    console.error('Failed to trigger challenge update:', error);
  }
}

/**
 * Sends a question attempt to the backend gamification service.
 */
export async function recordQuestionAttempt(
  payload: QuestionAttemptPayload,
  options?: RecordQuestionAttemptOptions,
): Promise<void> {
  try {
    const authToken = await getClientAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch("/api/gamification/question-attempt", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const text = res.status === 204 ? null : await res.text();
    if (!res.ok) {
      if (text && text.includes("Active gamification config row not found")) {
        return;
      }
      throw new Error(
        text || `Gamification question attempt failed (${res.status})`,
      );
    }
    if (text) {
      console.log("[gamification] question-attempt response:", text);
    } else {
      console.log("[gamification] question-attempt response: empty");
    }
    const shouldCelebrate = !options?.suppressCelebration;
    let xpAwardedFromResponse: number | undefined;
    if (text) {
      try {
        const data = JSON.parse(text);
        console.log("[gamification] question-attempt parsed:", data);
        if (typeof data?.xpAwarded === "number") {
          xpAwardedFromResponse = data.xpAwarded;
        }
        if (data?.userProgress) {
          broadcastGamificationProgress({
            userId: data.userProgress.userId,
            totalXp: data.userProgress.totalXp,
            currentLevel: data.userProgress.currentLevel,
            xpAwarded: data.xpAwarded,
          });
        }
      } catch {
        // ignore parse errors
      }
    }
    if (
      shouldCelebrate &&
      typeof xpAwardedFromResponse === "number" &&
      xpAwardedFromResponse > 0
    ) {
      triggerXpCelebration({ amount: xpAwardedFromResponse });
    }
  } catch (error) {
    console.error("Failed to record question attempt:", error);
  }
}

export async function recordIdentifiedQuestionXp(
  exerciseId: string,
): Promise<void> {
  if (!exerciseId) {
    return;
  }

  try {
    const authToken = await getClientAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const res = await fetch("/api/gamification/identified-question", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ exerciseId }),
    });
    const text = res.status === 204 ? null : await res.text();
    if (!res.ok) {
      throw new Error(
        text || `Gamification identified question reward failed (${res.status})`,
      );
    }

    let xpAwardedFromResponse: number | undefined;
    let parsedData: any = null;
    if (text) {
      try {
        parsedData = JSON.parse(text);
        if (typeof parsedData?.xpAwarded === "number") {
          xpAwardedFromResponse = parsedData.xpAwarded;
        }
        if (parsedData?.userProgress) {
          broadcastGamificationProgress({
            userId: parsedData.userProgress.userId,
            totalXp: parsedData.userProgress.totalXp,
            currentLevel: parsedData.userProgress.currentLevel,
            xpAwarded: parsedData.xpAwarded,
          });
        }
      } catch {
        // ignore parse errors
      }
    }
    if (
      typeof xpAwardedFromResponse === "number" &&
      xpAwardedFromResponse > 0
    ) {
      triggerXpCelebration({ amount: xpAwardedFromResponse });
      const recordedUserId = parsedData?.userProgress?.userId;
      if (recordedUserId) {
        recordActivity({
          userId: recordedUserId,
          activityType: "identified_question",
          referenceId: exerciseId,
          referenceType: "practice_exercise_identified_question",
        }).catch((activityError) => {
          console.error(
            "Failed to record identified question activity:",
            activityError,
          );
        });
      }
    }
  } catch (error) {
    console.error("Failed to record identified question reward:", error);
  }
}

/**
 * Marks a lecture as completed for XP once the user watches enough of it.
 */
export async function recordLectureCompletion(
  lectureId: string,
): Promise<void> {
  if (!lectureId) return;
  try {
    const authToken = await getClientAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch("/api/gamification/lecture-complete", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ lectureId }),
    });
    const text = res.status === 204 ? null : await res.text();
    if (!res.ok) {
      throw new Error(
        text || `Gamification lecture completion failed (${res.status})`,
      );
    }
    let xpAwardedFromResponse: number | undefined;
    if (text) {
      try {
        const data = JSON.parse(text);
        if (typeof data?.xpAwarded === "number") {
          xpAwardedFromResponse = data.xpAwarded;
        }
        if (data?.userProgress) {
          broadcastGamificationProgress({
            userId: data.userProgress.userId,
            totalXp: data.userProgress.totalXp,
            currentLevel: data.userProgress.currentLevel,
            xpAwarded: data.xpAwarded,
          });
        }
      } catch {
        // ignore parse errors
      }
    }
    if (typeof xpAwardedFromResponse === "number" && xpAwardedFromResponse > 0) {
      triggerXpCelebration({ amount: xpAwardedFromResponse });
    }
  } catch (error) {
    console.error("Failed to record lecture completion:", error);
    throw error;
  }
}

/**
 * Client-side helper to extract user ID from session/auth
 */
export function getCurrentUserId(): string | null {
  // This would typically extract from your auth system
  // For now, return a test user ID
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentUserId') || 'test-user-123';
  }
  return null;
}

/**
 * Initialize gamification tracking for a session
 */
export async function initializeGamificationSession(): Promise<void> {
  const userId = getCurrentUserId();
  if (userId) {
    await recordLogin(userId);
    await triggerChallengeUpdate(userId);
  }
}
