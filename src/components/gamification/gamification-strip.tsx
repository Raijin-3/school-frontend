"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Star, Trophy, Crown, Target } from 'lucide-react';
import { useGamification } from './gamification-provider';
import { Card } from '@/components/ui/card';
import { getLevelFromXp } from '@/lib/gamification-levels';
import {
  DAILY_LOGIN_REWARD_EVENT,
  type DailyLoginRewardCelebration,
  type DailyLoginRewardEventDetail,
  getDailyLoginRewardCelebration,
} from '@/lib/log-daily-login';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface GamificationStripProps {
  onContinueLearning?: () => void;
  compact?: boolean;
}

export function GamificationStrip({ onContinueLearning, compact = false }: GamificationStripProps) {
  const { stats, achievements, isLoading } = useGamification();
  const [userId, setUserId] = useState<string | null>(null);
  const [loginReward, setLoginReward] = useState<DailyLoginRewardCelebration | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevAchievementsCountRef = useRef(achievements?.length ?? 0);

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseBrowser();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setUserId(data.session?.user?.id ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !userId) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const syncReward = (candidate?: DailyLoginRewardCelebration | null) => {
      const normalized =
        candidate &&
        candidate.date === todayIso &&
        !candidate.acknowledged
          ? candidate
          : null;
      setLoginReward(normalized);
    };

    syncReward(getDailyLoginRewardCelebration(userId));

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DailyLoginRewardEventDetail>).detail;
      if (!detail || detail.userId !== userId) return;
      syncReward(detail.reward);
    };

    window.addEventListener(
      DAILY_LOGIN_REWARD_EVENT,
      handler as EventListener,
    );
    return () => {
      window.removeEventListener(
        DAILY_LOGIN_REWARD_EVENT,
        handler as EventListener,
      );
    };
  }, [userId]);

  const achievementNames = achievements?.map(
    (achievement) =>
      achievement.achievement.display_name ||
      achievement.achievement.name ||
      'Achievement',
  ) ?? [];

  useEffect(() => {
    const currentCount = achievements?.length ?? 0;
    if (currentCount > prevAchievementsCountRef.current) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 4000);
      prevAchievementsCountRef.current = currentCount;
      return () => {
        clearTimeout(timer);
      };
    }
    prevAchievementsCountRef.current = currentCount;
  }, [achievements]);

  // Achievement confetti generation temporarily disabled.
  // const confettiPieces = useMemo(
  //   () =>
  //     Array.from({ length: 30 }, (_, index) => {
  //       const colors = ['#F97316', '#38BDF8', '#A855F7', '#F43F5E', '#22C55E'];
  //       return {
  //         id: index,
  //         left: `${Math.random() * 100}%`,
  //         delay: `${Math.random()}s`,
  //         duration: `${1.75 + Math.random()}s`,
  //         color: colors[index % colors.length],
  //       };
  //     }),
  //   [showCelebration],
  // );

  if (isLoading) {
    return (
      <Card className="rounded-xl border border-border bg-white/70 p-4 md:p-6 backdrop-blur animate-pulse">
        <div className="h-16 bg-gray-200 rounded"></div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="rounded-xl border border-border bg-white/70 p-4 md:p-6 backdrop-blur">
        <div className="text-center text-muted-foreground">
          Start learning to see your progress!
        </div>
      </Card>
    );
  }

  const totalPoints =
    typeof stats.total_points === 'number' && Number.isFinite(stats.total_points)
      ? stats.total_points
      : 0;
  const displayLevel = getLevelFromXp(totalPoints);
  const showDailyReward = Boolean(loginReward);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-white/70 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium">Level {displayLevel}</span>
        </div>
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium">{totalPoints} XP</span>
        </div>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium">{stats.current_streak} day streak</span>
        </div>
        {showDailyReward && (
          <div className="ml-auto rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 animate-bounce">
            +{loginReward?.xpAwarded} XP today
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Achievement confetti temporarily disabled
      {showCelebration && (
        <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/40">
          <div className="relative z-10 rounded-3xl border border-white/60 bg-white/90 px-8 py-6 text-center text-lg font-semibold text-slate-900 shadow-2xl">
            <p>Achievement Unlocked!</p>
            <p className="text-sm font-normal text-slate-500">Keep up the momentum!</p>
          </div>
          {confettiPieces.map((piece) => (
            <span
              key={`confetti-${piece.id}`}
              className="confetti-piece absolute top-0 h-3 w-3 rounded-full"
              style={{
                left: piece.left,
                backgroundColor: piece.color,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
              }}
            />
          ))}
          <style jsx>{`
            .confetti-piece {
              animation: confetti-fall linear forwards;
            }
            @keyframes confetti-fall {
              0% {
                transform: translateY(-50px) rotate(0deg);
                opacity: 1;
              }
              100% {
                transform: translateY(110vh) rotate(360deg);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      )}
      */}
      <Card className="rounded-xl border border-border bg-white/70 p-4 md:p-6 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-purple-500" />
              <h2 className="text-lg font-semibold">Level {displayLevel}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep up your great learning momentum!
            </p>

          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div
              className={`relative flex items-center gap-2 ${
                showDailyReward
                  ? 'rounded-xl border border-orange-200/80 bg-orange-50/60 px-3 py-2 shadow-sm shadow-orange-100'
                  : ''
              }`}
            >
              <Flame className="h-5 w-5 text-orange-500" />
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">
                  {stats.current_streak} days
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Current streak
                  {showDailyReward && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-600 animate-pulse">
                      +1 today
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`relative flex items-center gap-2 ${
                showDailyReward
                  ? 'rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 shadow-sm shadow-emerald-100'
                  : ''
              }`}
            >
              <Star className="h-5 w-5 text-yellow-500" />
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">
                  {totalPoints} XP
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Total points
                  {showDailyReward && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 animate-bounce">
                      +{loginReward?.xpAwarded} XP
                    </span>
                  )}
                </div>
              </div>
              {showDailyReward && (
                <span className="absolute -top-3 right-0 text-[11px] font-semibold text-emerald-600">
                  Daily login bonus
                </span>
              )}
            </div>
            <div className="group relative">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-blue-500" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-foreground">
                    {stats.achievements_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Achievements</div>
                </div>
              </div>
              {achievementNames.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 bottom-full z-10 w-48 -translate-x-1/2 rounded-lg border border-border bg-white/90 p-3 text-xs shadow-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <p className="font-semibold text-neutral-900">Recent achievements</p>
                  <ul className="mt-2 space-y-1">
                    {achievementNames.slice(0, 5).map((name, index) => (
                      <li key={name + index} className="truncate text-muted-foreground">
                        {name}
                      </li>
                    ))}
                    {achievementNames.length > 5 && (
                      <li className="text-[11px] text-foreground">and more...</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-green-500" />
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground">
                  {stats.longest_streak}
                </div>
                <div className="text-xs text-muted-foreground">Best streak</div>
              </div>
            </div>
            
            {onContinueLearning && (
              <button
                onClick={onContinueLearning}
                className="rounded-md bg-[hsl(var(--brand))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Continue learning
              </button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
