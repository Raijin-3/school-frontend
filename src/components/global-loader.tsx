"use client"

import { useEffect, useState } from "react"

/**
 * Fades out a full-screen loader once the app hydrates.
 * The overlay is 90% opaque so underlying content is dimmed but visible.
 */
export function GlobalLoader() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 600)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-500">
      <div className="h-14 w-14 rounded-full border-4 border-white/40 border-t-white animate-spin" aria-label="Loading" />
    </div>
  )
}
