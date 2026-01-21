"use client";

import { getCurrentUserId } from "@/lib/gamification";

export type AwardBadgeInput = {
  userId?: string | null;
  badgeCode: string;
  reason?: string;
  referenceId?: string;
  referenceType?: string;
  metadata?: Record<string, any>;
  allowRepeat?: boolean;
};

export type AwardBadgeResponse = {
  success: boolean;
  duplicate?: boolean;
};

export async function awardBadge(input: AwardBadgeInput): Promise<AwardBadgeResponse> {
  const resolvedUserId = input.userId || getCurrentUserId();
  if (!resolvedUserId) {
    throw new Error("User ID is required to award a badge");
  }
  if (!input.badgeCode) {
    throw new Error("badgeCode is required");
  }

  const res = await fetch("/api/gamification/badges", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      userId: resolvedUserId,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to award badge (status ${res.status.toString()})`);
  }

  const data = await res.json().catch(() => ({}));
  return {
    success: Boolean(data?.success ?? true),
    duplicate: Boolean(data?.duplicate),
  };
}
