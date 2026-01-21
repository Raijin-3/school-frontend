"use client";

import { Award } from "lucide-react";
import { useGamification } from "@/components/gamification/gamification-provider";

const badgeDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function RecentBadgesPanel() {
  const { badges, isLoading } = useGamification();
  const topBadges = (Array.isArray(badges) ? badges : []).slice(0, 4);

  return (
    <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-white/80 to-white/60 p-6 backdrop-blur-xl shadow-lg">
      <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Award className="h-5 w-5 text-yellow-500" />
        Recent Badges
      </h3>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-white/60 animate-pulse"
            >
              <div className="w-10 h-10 rounded-full bg-yellow-100" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : topBadges.length === 0 ? (
        <div className="text-sm text-gray-500">
          Earn badges by completing sections, modules, and challenges.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {topBadges.map((badge) => {
            const displayName =
              badge?.badge?.display_name ||
              badge?.badge?.name ||
              badge?.name ||
              badge?.badge_code ||
              "Badge";
            const earnedAt =
              badge?.earned_at ||
              badge?.earnedAt ||
              badge?.created_at ||
              badge?.badge?.earned_at;
            const dateLabel = earnedAt
              ? badgeDateFormatter.format(new Date(earnedAt))
              : "Recent";
            const key = badge?.id || badge?.badge_id || `${displayName}-${dateLabel}`;

            return (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-white/60"
              >
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Award className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-900">
                    {displayName}
                  </div>
                  <div className="text-xs text-gray-500">{dateLabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
