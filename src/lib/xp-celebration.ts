export const XP_CELEBRATION_EVENT = 'xp-celebration';

export type XpCelebrationDetail = {
  amount?: number;
  label?: string;
};

export function triggerXpCelebration(detail?: XpCelebrationDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<XpCelebrationDetail>(XP_CELEBRATION_EVENT, {
      detail,
    }),
  );
}
