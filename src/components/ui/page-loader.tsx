import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PageLoaderProps = {
  /**
   * Primary status copy shown under the spinner.
   */
  message?: string;
  /**
   * Optional helper text under the main message.
   */
  description?: string;
  /**
   * Whether the loader should stretch to the full viewport height.
   */
  fullScreen?: boolean;
  /**
   * Apply a soft glassmorphism card treatment (used when the loader lives inside a card).
   */
  variant?: "plain" | "card";
  /**
   * Extra classes for layout overrides.
   */
  className?: string;
  /**
   * Draws a translucent full-screen overlay behind the loader.
   */
  overlay?: boolean;
  /**
   * Extra classes for the overlay container (when overlay is true).
   */
  overlayClassName?: string;
};

const VARIANT_STYLES: Record<NonNullable<PageLoaderProps["variant"]>, string> = {
  plain: "",
  card: "rounded-2xl border border-white/60 bg-gradient-to-br from-white/85 to-white/65 shadow-xl backdrop-blur-xl",
};

export function PageLoader({
  message = "Loading...",
  description = "This will only take a moment.",
  fullScreen = false,
  variant = "plain",
  className,
  overlay = false,
  overlayClassName,
}: PageLoaderProps) {
  const sizeClass = overlay ? "min-h-[260px]" : fullScreen ? "min-h-screen" : "min-h-[260px]";

  const loaderContent = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        sizeClass,
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <div className="relative mb-2 h-16 w-16">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100 opacity-60" />
        <Loader2 className="h-16 w-16 animate-spin text-indigo-500" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-gray-900">{message}</p>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm",
          overlayClassName,
        )}
      >
        {loaderContent}
      </div>
    );
  }

  return loaderContent;
}
