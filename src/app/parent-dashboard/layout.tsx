"use client"

import type { ReactNode } from "react"

import { ChildSwitcher } from "@/components/parent/child-switcher"
import { ParentDashboardProvider } from "@/components/parent/parent-dashboard-context"

export default function ParentDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ParentDashboardProvider>
      <div className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <ChildSwitcher />
        </div>
      </div>
      {children}
    </ParentDashboardProvider>
  )
}
