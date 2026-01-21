"use client";

import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { logDailyLoginActivity } from "@/lib/log-daily-login";

export function DailyLoginPing() {
  const supabase = supabaseBrowser();

  useEffect(() => {
    let cancelled = false;

    const maybePing = async (session: Session | null) => {
      if (!session?.user) return;
      await logDailyLoginActivity(session);
    };

    const initialize = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        await maybePing(session);
      }
    };

    initialize();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!cancelled) {
          void maybePing(session);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  return null;
}
