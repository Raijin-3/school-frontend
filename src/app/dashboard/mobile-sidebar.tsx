"use client"

import Link from "next/link"
import { useState } from "react"
import { 
  Menu, 
  X, 
  LayoutDashboard, 
  BookOpen, 
  FileCheck2, 
  Calendar, 
  Brain, 
  BriefcaseBusiness,
  FlaskConical,
  User,
  Settings,
  LogOut,
  Star,
  Target,
  Sparkles
} from "lucide-react"
import { useUserSummary, type UserSummary } from "@/hooks/use-user-summary"

interface MobileSidebarProps {
  active?: string
  user?: {
    name: string
    email: string
    tier?: string
    xp?: number
    level?: number
    levelProgressPercent?: number
    rank?: number
    assignedCourseCount?: number
  }
}

export function MobileSidebar({ active = "/dashboard", user }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)
  
  const secondaryItems = [
    { 
      href: "/labs", 
      label: "Labs", 
      icon: <FlaskConical className="h-4 w-4" />,
      description: "Practice environments",
      beta: true,
      comingSoon: true
    },
    { 
      href: "/jobs", 
      label: "AI Jobs", 
      icon: <BriefcaseBusiness className="h-4 w-4" />,
      description: "Career opportunities",
      beta: true,
      notification: 12,
      comingSoon: true
    },
  ]

  const userMenuItems = [
    { href: "/profile", label: "Profile", icon: <User className="h-4 w-4" /> },
    { href: "/learning-path", label: "Learning Path", icon: <Target className="h-4 w-4" /> },
    { href: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ]

  const baseUser: UserSummary = {
    name: "Learner",
    email: "learner@example.com",
    tier: "Silver",
    xp: 1540,
    level: 2,
    levelProgressPercent: 0,
    role: "student",
    rank: null,
    assignedCourseCount: 0,
  }

  const sanitizedUser = user
    ? (Object.fromEntries(
        Object.entries(user).filter(([, value]) => value !== undefined),
      ) as Partial<UserSummary>)
    : {}

  const defaultUser: UserSummary = {
    ...baseUser,
    ...sanitizedUser,
  }

  const summary = useUserSummary(defaultUser)
  const assignedCoursesBadge = `${Math.max(0, summary.assignedCourseCount)} Active`
  const mainItems = [
    { 
      href: "/dashboard", 
      label: "Dashboard", 
      icon: <LayoutDashboard className="h-4 w-4" />,
      description: "Overview & stats"
    },
    { 
      href: "/curriculum", 
      label: "My Courses", 
      icon: <BookOpen className="h-4 w-4" />,
      description: "Learning paths",
      badge: assignedCoursesBadge
    },
    { 
      href: "/playground", 
      label: "Playground", 
      icon: <FileCheck2 className="h-4 w-4" />,
      description: "Hands-on sandbox & quizzes",
    },
    { 
      href: "/schedule", 
      label: "Schedule", 
      icon: <Calendar className="h-4 w-4" />,
      description: "Classes & events",
      comingSoon: true
    },
    { 
      href: "/logical-reasoning", 
      label: "Daily Challenge", 
      icon: <Brain className="h-4 w-4" />,
      description: "Brain teasers",
      streak: true,
      comingSoon: true
    },
  ]

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-16 z-40 inline-flex items-center gap-2 rounded-xl border border-white/40 bg-gradient-to-r from-white/80 to-white/60 px-3 py-2 text-sm backdrop-blur-xl shadow-lg hover:bg-white/90 hover:shadow-xl transition-all lg:hidden"
      >
        <Menu className="h-4 w-4" /> Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-[320px] overflow-y-auto">
            <div className="relative h-full overflow-y-auto rounded-r-2xl border-r border-white/20 bg-gradient-to-b from-white/90 to-white/80 p-4 backdrop-blur-xl shadow-2xl">
              {/* Background gradients */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-emerald-50/30"></div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
              
              <div className="relative z-10">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Navigation</h2>
                    <p className="text-xs text-gray-500">AI Learning Platform</p>
                  </div>
                  <button
                    aria-label="Close navigation"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/40 bg-white/60 text-gray-600 backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-lg"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* User Profile Section */}
                <div className="mb-6">
                  <div className="relative overflow-hidden rounded-xl border border-white/40 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-4 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold">
                          {summary.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-emerald-400 to-green-400 border-2 border-white flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{summary.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            <span className="text-xs font-medium text-amber-600">{summary.tier}</span>
                          </div>
                          {typeof summary.rank === "number" && (
                            <>
                              <span className="text-xs text-gray-500">•</span>
                              <span className="text-xs font-medium text-gray-700">Rank #{summary.rank}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Level Progress */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                        <span>Level {summary.level}</span>
                      <span>{Math.round(Math.max(0, Math.min(100, summary.levelProgressPercent ?? 0)))}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-200/60 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, summary.levelProgressPercent ?? 0))}%` }}
                           />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="mb-6">
                  <div className="rounded-xl border border-dashed border-white/40 bg-white/70 p-3 backdrop-blur text-gray-500">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-gray-500" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Today's Goals</h3>
                      <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">This module is temporarily disabled while we polish the experience.</p>
                  </div>
                </div>

                {/* Main Navigation */}
                <nav className="space-y-1 mb-6">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Main</h3>
                  {mainItems.map((item) => {
                    const isComingSoon = Boolean(item.comingSoon)
                    const isActive = !isComingSoon && active === item.href
                    const baseClasses = "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200"
                    const statusClasses = isActive
                      ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-700 shadow-lg'
                      : isComingSoon
                        ? 'bg-white/90 text-gray-400 border border-dashed border-gray-200 cursor-not-allowed opacity-80'
                        : 'text-gray-700 hover:bg-white/60 hover:shadow-md'
                    const iconClasses = [
                      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                        : isComingSoon
                          ? 'bg-gray-200/80 text-gray-400'
                          : 'bg-gray-100/80 text-gray-600 group-hover:bg-white group-hover:shadow-md',
                    ].join(" ")
                    const content = (
                      <>
                        <div className={iconClasses}>
                          {item.icon}
                          {item.streak && (
                            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse"></div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="truncate">{item.label}</span>
                            <div className="flex items-center gap-1">
                              {!isComingSoon && item.notification && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                  {item.notification}
                                </span>
                              )}
                              {!isComingSoon && item.badge && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  {item.badge}
                                </span>
                              )}
                              {isComingSoon && (
                                <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                  Coming Soon
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{isComingSoon ? "Coming soon" : item.description}</p>
                        </div>
                      </>
                    )

                    return (
                      <div key={item.href}>
                        {isComingSoon ? (
                          <div className={`${baseClasses} ${statusClasses}`} role="button" aria-disabled="true">
                            {content}
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={`${baseClasses} ${statusClasses}`}
                          >
                            {content}
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </nav>

                {/* Secondary Navigation */}
                <nav className="space-y-1 mb-6">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Explore</h3>
                  {secondaryItems.map((item) => {
                    const isComingSoon = Boolean(item.comingSoon)
                    const isActive = !isComingSoon && active === item.href
                    const baseClasses = "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200"
                    const statusClasses = isActive
                      ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-700 shadow-lg'
                      : isComingSoon
                        ? 'bg-white/90 text-gray-400 border border-dashed border-gray-200 cursor-not-allowed opacity-80'
                        : 'text-gray-700 hover:bg-white/60 hover:shadow-md'
                    const iconClasses = [
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                        : isComingSoon
                          ? 'bg-gray-200/80 text-gray-400'
                          : 'bg-gray-100/80 text-gray-600 group-hover:bg-white group-hover:shadow-md',
                    ].join(" ")
                    const content = (
                      <>
                        <div className={iconClasses}>
                          {item.icon}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="truncate">{item.label}</span>
                            <div className="flex items-center gap-1">
                              {item.beta && (
                                <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Beta
                                </span>
                              )}
                              {isComingSoon ? (
                                <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                  Coming Soon
                                </span>
                              ) : (
                                item.notification && (
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                                    {item.notification > 9 ? '9+' : item.notification}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{isComingSoon ? "Coming soon" : item.description}</p>
                        </div>
                      </>
                    )

                    return (
                      <div key={item.href}>
                        {isComingSoon ? (
                          <div className={`${baseClasses} ${statusClasses}`} role="button" aria-disabled="true">
                            {content}
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={`${baseClasses} ${statusClasses}`}
                          >
                            {content}
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </nav>

                {/* User Menu */}
                <nav className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">Account</h3>
                  {userMenuItems.map((item) => {
                    const isActive = active === item.href
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-700' 
                            : 'text-gray-700 hover:bg-white/60'
                        }`}
                      >
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ${
                          isActive 
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white' 
                            : 'bg-gray-100/80 text-gray-600 group-hover:bg-white'
                        }`}>
                          {item.icon}
                        </div>
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                  
                  {/* Logout Button */}
                  <button
                    onClick={() => setOpen(false)}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-red-50/60 hover:text-red-700"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100/80 text-gray-600 transition-all duration-200 group-hover:bg-red-100 group-hover:text-red-600">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <span>Sign Out</span>
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
