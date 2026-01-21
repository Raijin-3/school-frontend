"use client";

import { Card } from "@/components/ui/card";
import { useGamification } from "./gamification-provider";
import { cn } from "@/lib/utils";

type TierId = "bronze" | "silver" | "gold";

type TierDetail = {
  id: TierId;
  icon: string;
  label: string;
  xpRange: string;
  summary: string;
  benefits: string[];
  freezeAllowance: number;
  accent: string;
};

const TIER_DETAILS: TierDetail[] = [
  {
    id: "bronze",
    icon: "🥉",
    label: "Bronze",
    xpRange: "< 15,000 XP",
    summary:
      "Entry tier that builds consistent study habits without overwhelming new learners.",
    benefits: [
      "Full access to learning paths & daily challenges",
      "Participation in weekly leaderboard",
      "1 “streak freeze” per month",
    ],
    freezeAllowance: 1,
    accent: "from-amber-100 to-white",
  },
  {
    id: "silver",
    icon: "🥈",
    label: "Silver",
    xpRange: "15,000 – 19,999 XP",
    summary:
      "Career unlock stage with tangible interview prep perks and personalized support.",
    benefits: [
      "1 Mock Interview credit per month",
      "1 Resume Review per quarter",
      "1 Referral opportunity to a hiring partner",
      "Priority email support for doubts",
      "2 “streak freezes” per month",
    ],
    freezeAllowance: 2,
    accent: "from-slate-100 to-white",
  },
  {
    id: "gold",
    icon: "🥇",
    label: "Gold",
    xpRange: "≥ 20,000 XP",
    summary:
      "Elite tier for top learners with high-value mentorship, visibility, and exclusive access.",
    benefits: [
      "Unlimited Mock Interviews",
      "3+ Resume Reviews per quarter",
      "Unlimited referrals to hiring partners",
      "1:1 doubt solving via mentor calls",
      "Priority project feedback",
      "Exclusive Gold badge + early access to new case studies",
    ],
    freezeAllowance: 2,
    accent: "from-yellow-100 to-white",
  },
];

function getTierFromXp(xp: number | undefined | null): TierId {
  if (typeof xp !== "number") return "bronze";
  if (xp < 15_000) return "bronze";
  if (xp < 20_000) return "silver";
  return "gold";
}

export function TierBenefits() {
  const { stats, isLoading } = useGamification();
  if (isLoading && !stats) {
    return (
      <Card className="rounded-2xl border border-white/70 bg-white/80 p-6 md:p-8 backdrop-blur animate-pulse">
        <div className="h-32 bg-white/60 rounded-2xl" />
      </Card>
    );
  }

  const currentTier =
    (typeof stats?.tier === "string"
      ? stats.tier.toLowerCase()
      : undefined) ??
    getTierFromXp(stats?.total_points) ??
    "bronze";

  return (
    <Card className="rounded-2xl border border-white/70 bg-white/80 p-6 md:p-8 backdrop-blur">
      <div className="mb-6 flex flex-col gap-2">
        <p className="text-sm font-semibold text-indigo-600 uppercase tracking-[0.2em]">
          Tier Rewards
        </p>
        <h3 className="text-2xl font-bold text-gray-900">
          Unlock richer perks as you climb tiers
        </h3>
        <p className="text-sm text-gray-600 max-w-2xl">
          XP milestones automatically upgrade your tier. Each tier unlocks
          deeper mentorship benefits, mock interview access, and streak freeze
          tokens that let you keep momentum even on rest days.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TIER_DETAILS.map((tier) => {
          const isCurrent = tier.id === currentTier;
          return (
            <div
              key={tier.id}
              className={cn(
                "rounded-2xl border bg-gradient-to-br p-5 flex flex-col gap-4",
                tier.accent,
                isCurrent
                  ? "border-indigo-300 shadow-xl shadow-indigo-100"
                  : "border-white/60",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-3xl" aria-hidden>
                  {tier.icon}
                </div>
                {isCurrent && (
                  <span className="rounded-full bg-indigo-600/10 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Current tier
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500">
                  {tier.xpRange}
                </p>
                <h4 className="text-xl font-bold text-gray-900">
                  {tier.label}
                </h4>
                <p className="text-sm text-gray-600 mt-1">{tier.summary}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
                  Benefits
                </p>
                <ul className="mt-2 space-y-2 text-sm text-gray-700">
                  {tier.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2">
                      <span className="text-emerald-500" aria-hidden>
                        •
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function getFreezeAllowanceForTier(tier?: string, xp?: number | null) {
  const normalizedTier = tier?.toLowerCase() as TierId | undefined;
  const resolved =
    normalizedTier ??
    (typeof xp === "number" ? getTierFromXp(xp) : undefined) ??
    "bronze";
  return (
    TIER_DETAILS.find((detail) => detail.id === resolved)?.freezeAllowance ?? 1
  );
}
