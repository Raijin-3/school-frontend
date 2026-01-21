"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type LoadingLinkButtonProps = {
  href: string;
  label: string;
  loadingLabel?: string;
  className?: string;
};

export function LoadingLinkButton({
  href,
  label,
  loadingLabel = "Loading...",
  className,
}: LoadingLinkButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = () => {
    if (isLoading) return;
    setIsLoading(true);
    router.push(href);
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isLoading}
      aria-disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
