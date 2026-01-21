"use client";

import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

const getApiBase = () => {
  const configured =
    process.env.NODE_ENV === "production"
      ? ""
      : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  return configured.replace(/\/$/, "");
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const normalizeScope = (value: string | null | undefined) =>
  (value || 'local')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

let cachedServerScope: string | null = null;
const getServerScope = () => {
  if (cachedServerScope) return cachedServerScope;
  if (typeof window === 'undefined') {
    cachedServerScope = normalizeScope(process.env.NEXT_PUBLIC_API_URL);
    return cachedServerScope;
  }
  const origin =
    process.env.NODE_ENV === 'production'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_API_URL || window.location.origin;
  cachedServerScope = normalizeScope(origin);
  return cachedServerScope;
};

const scopedStorageKey = (namespace: string, userId: string) =>
  `${namespace}.${getServerScope()}.${userId}`;

const storageKey = (userId: string) =>
  scopedStorageKey('jarvis.daily-login-ping', userId);
const rewardStorageKey = (userId: string) =>
  scopedStorageKey('jarvis.daily-login-reward', userId);

export interface DailyLoginRewardCelebration {
  date: string;
  xpAwarded: number;
  streakCount?: number;
  streakAction?: string;
  acknowledged?: boolean;
}

export interface DailyLoginRewardEventDetail {
  userId: string;
  reward: DailyLoginRewardCelebration | null;
}

export const DAILY_LOGIN_REWARD_EVENT = "jarvis:daily-login-reward";

const dispatchRewardEvent = (
  userId: string,
  reward: DailyLoginRewardCelebration | null,
) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DailyLoginRewardEventDetail>(DAILY_LOGIN_REWARD_EVENT, {
      detail: { userId, reward },
    }),
  );
};

const persistRewardState = (
  userId: string,
  reward: DailyLoginRewardCelebration | null,
) => {
  if (typeof window === "undefined") return;
  const key = rewardStorageKey(userId);
  if (reward) {
    window.localStorage.setItem(key, JSON.stringify(reward));
  } else {
    window.localStorage.removeItem(key);
  }
  dispatchRewardEvent(userId, reward);
};

export const getDailyLoginRewardCelebration = (
  userId: string,
): DailyLoginRewardCelebration | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(rewardStorageKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DailyLoginRewardCelebration;
  } catch {
    return null;
  }
};

export const acknowledgeDailyLoginRewardCelebration = (userId: string) => {
  const reward = getDailyLoginRewardCelebration(userId);
  if (!reward) return;
  if (reward.acknowledged) {
    dispatchRewardEvent(userId, reward);
    return;
  }
  persistRewardState(userId, { ...reward, acknowledged: true });
};

const hasLoggedToday = (userId: string, today: string) => {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(storageKey(userId));
  return value === today || value === `pending:${today}`;
};

const markPending = (userId: string, today: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), `pending:${today}`);
};

const markLogged = (userId: string, today: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), today);
};

const clearFlag = (userId: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(userId));
};

export async function logDailyLoginActivity(
  providedSession?: Session | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = supabaseBrowser();
  const session =
    providedSession ??
    (
      await supabase.auth.getSession()
    ).data.session;

  const token = session?.access_token;
  const userId = session?.user?.id;
  if (!token || !userId) return;

  const today = getTodayKey();
  if (hasLoggedToday(userId, today)) {
    return;
  }

  markPending(userId, today);

  try {
    const response = await fetch(`${getApiBase()}/v1/gamification/activity/${userId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ activityType: "login" }),
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(responseText || "Failed to record login activity");
    }
    markLogged(userId, today);

    let activityResult: any = null;
    if (responseText) {
      try {
        activityResult = JSON.parse(responseText);
      } catch {
        activityResult = null;
      }
    }

    if (activityResult?.loginReward?.awarded && userId) {
      const xpAwarded =
        typeof activityResult.loginReward.amount === "number"
          ? activityResult.loginReward.amount
          : 5;
      const streakCount =
        typeof activityResult.loginReward.streakCount === "number"
          ? activityResult.loginReward.streakCount
          : typeof activityResult.streak?.current_count === "number"
            ? activityResult.streak.current_count
            : undefined;
      const streakAction =
        activityResult.loginReward.streakAction ??
        activityResult.streak?.action;

      persistRewardState(userId, {
        date: today,
        xpAwarded,
        streakCount,
        streakAction,
        acknowledged: false,
      });
    }
  } catch (error) {
    clearFlag(userId);
    console.warn("[logDailyLoginActivity] failed:", error);
  }
}
