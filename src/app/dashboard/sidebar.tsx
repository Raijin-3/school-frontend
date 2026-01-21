"use client"

import { useState } from "react"
import { 
  LayoutDashboard, 
  BookOpen, 
  FileCheck2, 
  Calendar, 
  Brain, 
  BriefcaseBusiness, 
  Eye, 
  EyeOff,
  User,
  Settings,
  Bell,
  Award,
  TrendingUp,
  Star,
  LogOut,
  ChevronRight,
  Sparkles,
  Target,
  FlaskConical
} from "lucide-react"
import { useUserSummary, type UserSummary } from "@/hooks/use-user-summary"

interface SidebarProps {
  active?: string
  user?: {
    name: string
    email: string
    avatar?: string
    tier?: string
    xp?: number
    level?: number
    levelProgressPercent?: number
    role?: string
    rank?: number
    assignedCourseCount?: number
  }
}

export function Sidebar({ active = "/dashboard", user }: SidebarProps) {
  const [open, setOpen] = useState(true)
  
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

  // Create userMenuItems based on role
  const getUserMenuItems = (userRole?: string) => {
    const items = [
      { href: "/profile", label: "Profile", icon: <User className="h-4 w-4" /> },
    ];
    
    // Only show Learning Path for non-admin users (students and teachers)
    if (userRole !== "admin") {
      items.push({ href: "/learning-path", label: "Learning Path", icon: <Target className="h-4 w-4" /> });
    }
    
    items.push({ href: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> });
    
    return items;
  };

  const baseUser: UserSummary = {
    name: "Learner",
    email: "learner@example.com",
    tier: "Silver",
    xp: 1540,
    level: 2,
    levelProgressPercent: 0,
    role: "student",
    rank: null as number | null,
    assignedCourseCount: 0,
  }

  const sanitizedUser = user
    ? (Object.fromEntries(
        Object.entries(user).filter(([, value]) => value !== undefined),
      ) as Partial<typeof baseUser> & { avatar?: string })
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
      description: "Overview & stats",
          progress: 100
    },
    { 
      href: "/curriculum", 
      label: "My Courses", 
      icon: <BookOpen className="h-4 w-4" />,
      description: "Learning paths",
          progress: 78,
      badge: assignedCoursesBadge
    },
    { 
      href: "/playground", 
      label: "Playground", 
      icon: <FileCheck2 className="h-4 w-4" />,
      description: "Hands-on sandbox & quizzes",
          progress: 65,
    },
    { 
      href: "/schedule", 
      label: "Schedule", 
      icon: <Calendar className="h-4 w-4" />,
      description: "Classes & events",
          progress: 90,
      comingSoon: true
    },
    { 
      href: "/logical-reasoning", 
      label: "Daily Challenge", 
      icon: <Brain className="h-4 w-4" />,
      description: "Brain teasers",
          progress: 42,
      streak: true,
      comingSoon: true
    },
  ]

  return (
    <aside className={`hidden lg:block transition-[width] duration-300 ease-in-out ${open ? 'w-72' : 'w-28'}`}>
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
        <div className={`relative overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-b from-white/80 to-white/60 ${open ? 'p-4' : 'p-2'} backdrop-blur-xl shadow-2xl`}>
          {/* Background gradients */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-emerald-50/30"></div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-200/20 to-purple-200/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="relative z-10">
            {/* Toggle Button */}
            <div className={`flex items-center ${open ? 'justify-between mb-6' : 'justify-center mb-2'}`}>
              <div className={`${open ? 'opacity-100' : 'hidden'} transition-opacity duration-300`}>
                <h2 className="text-sm font-semibold text-gray-900">Navigation</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen((s) => !s)}
                className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/40 bg-white/60 text-gray-600 backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-lg"
                aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* User Profile Section */}
            <div className={`${open ? 'mb-6' : 'mb-3'} transition-all duration-300`}>
              <div className={`relative overflow-hidden rounded-xl border border-white/40 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 ${open ? 'p-4' : 'p-2'} backdrop-blur`}>
                <div className={`flex items-center ${open ? 'gap-3' : 'justify-center'}`}>
                  <div className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-sm">
                      {summary.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-gradient-to-r from-emerald-400 to-green-400 border-2 border-white flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                    </div>
                  </div>
                  <div className={`${open ? 'flex-1 min-w-0' : 'hidden'}`}>
                    <p className="font-semibold text-gray-900 text-sm truncate">{summary.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-amber-500" />
                        <span className="text-xs font-medium text-amber-600">{summary.tier}</span>
                      </div>
                      {typeof summary.rank === "number" && (
                        <>
                          <span className="text-xs text-gray-500">•</span>
                          <span className="text-xs font-medium text-gray-700">
                            Rank #{summary.rank}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Level Progress */}
                <div className={`${open ? 'mt-3' : 'hidden'}`}>
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

            {/* Main Navigation */}
            <nav className={`space-y-1 ${open ? 'mb-6' : 'mb-3'}`}>
              <div className={`${open ? 'opacity-100 mb-3' : 'hidden'} transition-opacity duration-300`}>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Main</h3>
              </div>
              {mainItems.map((item) => {
                const isComingSoon = Boolean(item.comingSoon)
                const isActive = !isComingSoon && active === item.href
                const wrapperClasses = [
                  "group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
                  open ? 'gap-3 px-3 py-3' : 'justify-center px-2 py-3',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-700 shadow-lg'
                    : isComingSoon
                      ? 'bg-white/60 text-gray-400 border border-dashed border-gray-200'
                      : 'text-gray-700 hover:bg-white/60 hover:shadow-md',
                  isComingSoon ? 'cursor-not-allowed opacity-80' : '',
                ].join(" ").trim()
                const iconClasses = [
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                    : isComingSoon
                      ? 'bg-gray-200/80 text-gray-400'
                      : 'bg-gray-100/80 text-gray-600 group-hover:bg-white group-hover:shadow-md',
                ].join(" ")
                const textClasses = `${open ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-all duration-300`

                const content = (
                  <>
                    <div className={iconClasses}>
                      {item.icon}
                      {item.streak && (
                        <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 animate-pulse"></div>
                      )}
                    </div>
                    
                    <div className={`flex-1 min-w-0 ${textClasses}`}>
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
                          {isActive && <ChevronRight className="h-3 w-3" />}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {isComingSoon ? "Coming soon" : item.description}
                      </p>
                      
                    </div>
                  </>
                )

                return (
                  <div key={item.href} className="relative">
                    {isComingSoon ? (
                      <div className={wrapperClasses} role="button" aria-disabled="true">
                        {content}
                      </div>
                    ) : (
                      <a href={item.href} className={wrapperClasses}>
                        {content}
                      </a>
                    )}
                  </div>
                )
              })}
            </nav>

            {/* Secondary Navigation */}
            <nav className={`space-y-1 ${open ? 'mb-6' : 'mb-3'}`}>
              <div className={`${open ? 'opacity-100 mb-3' : 'hidden'} transition-opacity duration-300`}>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Explore</h3>
              </div>
              {secondaryItems.map((item) => {
                const isComingSoon = Boolean(item.comingSoon)
                const isActive = !isComingSoon && active === item.href
                const wrapperClasses = [
                  "group relative flex items-center rounded-xl text-sm font-medium transition-all duration-200",
                  open ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-700 shadow-lg'
                    : isComingSoon
                      ? 'bg-white/60 text-gray-400 border border-dashed border-gray-200'
                      : 'text-gray-700 hover:bg-white/60 hover:shadow-md',
                  isComingSoon ? 'cursor-not-allowed opacity-80' : '',
                ].join(" ").trim()
                const iconClasses = [
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                    : isComingSoon
                      ? 'bg-gray-200/80 text-gray-400'
                      : 'bg-gray-100/80 text-gray-600 group-hover:bg-white group-hover:shadow-md',
                ].join(" ")
                const textClasses = `${open ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-all duration-300`

                const content = (
                  <>
                    <div className={iconClasses}>
                      {item.icon}
                    </div>
                    
                    <div className={`flex-1 min-w-0 ${textClasses}`}>
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
                  <div key={item.href} className="relative">
                    {isComingSoon ? (
                      <div className={wrapperClasses} role="button" aria-disabled="true">
                        {content}
                      </div>
                    ) : (
                      <a href={item.href} className={wrapperClasses}>
                        {content}
                      </a>
                    )}
                  </div>
                )
              })}
            </nav>

            {/* Quick Stats */}
            <div className={`${open ? 'opacity-100 mb-6' : 'hidden'} transition-all duration-300`}>
              <div className="rounded-xl border border-dashed border-white/40 bg-white/70 p-3 backdrop-blur text-gray-600">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-gray-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Today's Goals</h3>
                  <span className="rounded-full bg-gray-100/80 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-gray-500">This section is disabled for now while we finish the experience.</p>
              </div>
            </div>

            {/* User Menu */}
            <nav className="space-y-1">
              <div className={`${open ? 'opacity-100 mb-3' : 'hidden'} transition-opacity duration-300`}>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Account</h3>
              </div>
              {getUserMenuItems(summary.role).map((item) => {
                const isActive = active === item.href
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center rounded-xl text-sm font-medium transition-all duration-200 ${
                      open ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'
                    } ${
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
                    <span className={`${open ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-all duration-300`}>
                      {item.label}
                    </span>
                  </a>
                )
              })}
              
              {/* Logout Button */}
              <button
                className={`group flex w-full items-center rounded-xl text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-red-50/60 hover:text-red-700 ${
                  open ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100/80 text-gray-600 transition-all duration-200 group-hover:bg-red-100 group-hover:text-red-600">
                  <LogOut className="h-4 w-4" />
                </div>
                <span className={`${open ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-all duration-300`}>
                  Sign Out
                </span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </aside>
  )
}
