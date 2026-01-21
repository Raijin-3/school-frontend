"use client";

import Link, { type LinkProps } from "next/link";
import { useCallback, useState } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import { cn } from "@/lib/utils";

type LoaderLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children: ReactNode;
    className?: string;
    loaderMessage?: string;
    loaderDescription?: string;
    disabled?: boolean;
  };

export function LoaderLink({
  children,
  className,
  loaderMessage,
  loaderDescription,
  disabled = false,
  onClick,
  ...rest
}: LoaderLinkProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }

      if (onClick) {
        onClick(event);
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.button !== 0
      ) {
        return;
      }

      setLoading(true);
    },
    [disabled, onClick],
  );

  return (
    <>
      <Link
        {...rest}
        onClick={handleClick}
        className={cn(
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500",
          disabled ? "pointer-events-none opacity-60" : "",
          className,
        )}
        aria-disabled={disabled}
      >
        {children}
      </Link>
      {loading ? (
        <PageLoader
          overlay
          overlayClassName="bg-white/60 backdrop-blur-sm"
          message={loaderMessage ?? "Loading..."}
          description={loaderDescription}
        />
      ) : null}
    </>
  );
}
