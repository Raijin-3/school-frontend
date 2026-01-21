"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Play } from "lucide-react";

type StartSessionButtonProps = {
  className?: string;
  label?: string;
};

export function StartSessionButton({ className, label = "Start Adaptive Session" }: StartSessionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Starting...
        </>
      ) : (
        <>
          <Play className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}
