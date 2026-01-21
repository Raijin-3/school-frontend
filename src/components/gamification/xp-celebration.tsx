'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  XP_CELEBRATION_EVENT,
  type XpCelebrationDetail,
} from '@/lib/xp-celebration';

const XP_CELEBRATION_SOUND =
  process.env.NEXT_PUBLIC_XP_CELEBRATION_SOUND ?? '/bell-notification.mp3';

type Burst = {
  id: number;
  label: string;
  offsetX: number;
  offsetY: number;
  delay: number;
  tint: number;
};

export function XpCelebrationOverlay() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [mounted, setMounted] = useState(false);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const counterRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioInteractionRequired, setAudioInteractionRequired] = useState(false);

  const resolvePortalTarget = useCallback(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const fullscreenElement = document.fullscreenElement;
    if (
      fullscreenElement instanceof HTMLElement &&
      fullscreenElement.hasAttribute("data-xp-celebration-surface")
    ) {
      return fullscreenElement;
    }
    return document.body;
  }, []);

  const playCelebrationSound = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    try {
      await audio.play();
      setAudioInteractionRequired(false);
    } catch {
      setAudioInteractionRequired(true);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setPortalTarget(resolvePortalTarget());
    return () => {
      setMounted(false);
      setPortalTarget(null);
    };
  }, [resolvePortalTarget]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleFullscreenChange = () => {
      setPortalTarget(resolvePortalTarget());
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [resolvePortalTarget]);

  useEffect(() => {
    if (!mounted) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<XpCelebrationDetail>).detail;
      counterRef.current += 1;
      const id = counterRef.current;
      const label =
        detail?.label ??
        (detail?.amount ? `+${detail.amount} XP` : '+XP');
      const offsetX = (Math.random() - 0.5) * 160;
      const offsetY = (Math.random() - 0.5) * 80;
      const delay = Math.random() * 120;
      const tint = Math.random();

      setBursts((prev) => [
        ...prev,
        { id, label, offsetX, offsetY, delay, tint },
      ]);

      const timeout = window.setTimeout(() => {
        setBursts((prev) => prev.filter((burst) => burst.id !== id));
      }, 3800);
      timeoutsRef.current.push(timeout);

      void playCelebrationSound();
    };

    window.addEventListener(
      XP_CELEBRATION_EVENT,
      handler as EventListener,
    );
    return () => {
      window.removeEventListener(
        XP_CELEBRATION_EVENT,
        handler as EventListener,
      );
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, [mounted, playCelebrationSound]);

  if (!portalTarget) return null;

  return createPortal(
    <div className="xp-celebration pointer-events-none fixed inset-0 z-[999] overflow-hidden flex items-center justify-center">
      <audio
        ref={audioRef}
        src={XP_CELEBRATION_SOUND}
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />
      {audioInteractionRequired && (
        <div
          className="pointer-events-auto fixed bottom-4 right-4 z-[1000] flex items-center gap-3 rounded-full border border-white/40 bg-black/80 px-4 py-3 text-white shadow-lg shadow-black/60"
          aria-live="polite"
        >
          <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-white/70">
            <span>XP Celebration</span>
            <span className="text-sm font-semibold text-white">
              Tap to enable sound
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              void playCelebrationSound();
            }}
            className="rounded-full bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-black shadow-sm shadow-emerald-400/70"
          >
            Enable
          </button>
        </div>
      )}
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="xp-burst"
          style={{
            transform: `translate(-50%, -50%) translate(${burst.offsetX}px, ${burst.offsetY}px) scale(1.5)`,
          }}
        >
          <div
            className="xp-burst-anim"
            style={{
              animationDelay: `${burst.delay}ms`,
            }}
          >
            <span
              className="xp-pill text-5xl px-6 py-3"
              style={{
                backgroundImage: `linear-gradient(120deg, rgba(56,189,248,${
                  0.35 + burst.tint * 0.25
                }) 0%, rgba(110,231,183,${
                  0.6 - burst.tint * 0.2
                }) 100%)`,
              }}
            >
              {burst.label}
            </span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`xp-bubble bubble-${i}`}
                style={{
                  animationDelay: `${burst.delay + i * 90}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>,
    portalTarget,
  );
}
