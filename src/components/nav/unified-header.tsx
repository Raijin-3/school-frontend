"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Brain, Bell, User, Home, BookOpen, Trophy,
  Settings, LogOut, LayoutDashboard, Target, Sparkles,
  Search, Globe
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { GAMIFICATION_PROGRESS_EVENT } from "@/lib/gamification"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { clearUserCache } from "@/lib/clear-user-cache"
import { getGamificationLevelProgress, getLevelFromXp } from "@/lib/gamification-levels"

type User = {
  id: string
  email?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

type Props = {
  user?: User | null
  userProfile?: {
    role?: string
    xp?: number
    tier?: string
    streak?: number
    onboarding_completed?: boolean
  } | null
}

type EnhancedUserProfile = Props["userProfile"] & {
  level?: number
  levelProgressPercent?: number
}

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const publicNavItems: NavItem[] = [
  // Navigation items removed as requested
]

const userNavItems: NavItem[] = [
  // Navigation items removed as requested
]

const parentNavItems: NavItem[] = [
  {
    href: "/parent-dashboard",
    label: "Parent dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
]

export function UnifiedHeader({ user: initialUser, userProfile: initialUserProfile }: Props) {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState(initialUser)
  const [userProfile, setUserProfile] = useState<EnhancedUserProfile | null>(() =>
    enrichGamiProfile(initialUserProfile),
  )
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleGamificationProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ totalXp?: number }>).detail
      if (!detail || typeof detail.totalXp !== "number") {
        return
      }
      setUserProfile((prev) => {
        const updated = {
          ...(prev || {}),
          xp: detail.totalXp,
        }
        return enrichGamiProfile(updated)
      })
    }

    window.addEventListener(GAMIFICATION_PROGRESS_EVENT, handleGamificationProgress)
    return () => {
      window.removeEventListener(GAMIFICATION_PROGRESS_EVENT, handleGamificationProgress)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Supabase signOut failed", error)
    }

    try {
      await clearUserCache()
    } catch (error) {
      console.error("clearUserCache failed", error)
    }

    try {
      await fetch('/api/auth/signout', { method: 'POST' })
    } catch (error) {
      console.error("Logout API call failed", error)
    }

    setUser(null)
    setUserProfile(null)
    router.replace('/login')
    router.refresh()
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Learner"
  const avatarUrl = user?.user_metadata?.avatar_url || null
  const initial = displayName.charAt(0).toUpperCase()
  const isAuthenticated = Boolean(user)

  const isParent = userProfile?.role === "parent"
  const hideLogoForOnboarding =
    isAuthenticated && !isParent && userProfile?.onboarding_completed === false
  const navItems = isAuthenticated
    ? isParent
      ? parentNavItems
      : userNavItems
    : publicNavItems
  const logoHref = isParent ? "/parent-dashboard" : isAuthenticated ? "/dashboard" : "/"

  if (!mounted) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/20 bg-white/10 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex h-16 items-center justify-between">
            {!hideLogoForOnboarding && (
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                    Jarvis
                  </div>
                  <div className="text-xs text-gray-600 hidden sm:block">AI Learning Platform</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/20 bg-white/10 backdrop-blur-xl supports-[backdrop-filter]:bg-white/10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          {!hideLogoForOnboarding && (
            <Link
              href={logoHref}
              className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 shadow-lg hover:shadow-xl transition-shadow">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-emerald-600 bg-clip-text text-transparent">
                  Jarvis
                </div>
                <div className="text-xs text-gray-600 hidden sm:block">AI Learning Platform</div>
              </div>
            </Link>
          )}

          {/* Desktop Navigation */}
          {!isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-8">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 transition-colors font-medium"
                >
                  {item.icon}
                  {item.label}
                </a>
              ))}
            </nav>
          )}
          {isAuthenticated && (
            <nav className="hidden lg:flex items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 transition-colors font-medium"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right Side */}
          <div className="flex items-center gap-4">
          {isAuthenticated && user ? (
            <AuthenticatedNav
              user={user}
              userProfile={userProfile}
              displayName={displayName}
              avatarUrl={avatarUrl}
              initial={initial}
              isParent={isParent}
              onLogout={handleLogout}
            />
          ) : (
            <PublicNav />
          )}

          </div>
        </div>
      </div>
    </header>
  )
}

function AuthenticatedNav({
  user,
  userProfile,
  displayName,
  avatarUrl,
  initial,
  isParent,
  onLogout
}: {
  user: User
  userProfile?: EnhancedUserProfile | null
  displayName: string
  avatarUrl: string | null
  initial: string
  isParent: boolean
  onLogout: () => void
}) {
  const sampleNotifs = [
    { id: "n1", title: "Daily review is ready", desc: "10 flashcards due", href: "/reviews/today" },
    { id: "n2", title: "New recommendation", desc: "Try SQL Joins module", href: "/modules/sql-joins" },
    { id: "n3", title: "Streak milestone", desc: "12 days and counting", href: "/dashboard" },
  ]
  const xpValue = Math.max(0, userProfile?.xp ?? 0)
  const derivedLevel = userProfile?.level ?? getLevelFromXp(xpValue)
  const rawProgress =
    userProfile?.levelProgressPercent ??
    getGamificationLevelProgress(derivedLevel, xpValue).progressPercent
  const mobileProgressPercent = Math.round(Math.max(0, Math.min(100, rawProgress ?? 0)))
  const xpLabel =
    typeof userProfile?.xp === "number"
      ? userProfile.xp.toLocaleString()
      : "--"

  return (
    <>
      {/* User Stats - Hidden on mobile */}
      {!isParent && (
      <div className="hidden xl:flex items-center gap-4">
        {typeof userProfile?.xp === "number" && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-yellow-100 to-orange-100 border border-yellow-200">
            <Sparkles className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-semibold text-yellow-700">{userProfile.xp.toLocaleString()} XP</span>
          </div>
        )}
        {userProfile?.tier && (
          <Badge variant="secondary" className="bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 border-purple-200">
            {userProfile.tier}
          </Badge>
        )}
        <LevelStatus userProfile={userProfile} />
      </div>
      )}

      {/* Compact XP / Level summary for smaller screens */}
      {!isParent && (
        <div className="flex flex-col items-end gap-0.5 text-right text-[11px] text-gray-600 xl:hidden min-w-[88px]">
          <span className="text-sm font-semibold text-yellow-700">{xpLabel} XP</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Level {derivedLevel}</span>
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
              style={{ width: `${mobileProgressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Notifications */}
      <DropdownMenu>
        {/* <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="relative h-10 w-10 rounded-xl border-white/20 bg-white/20 backdrop-blur-sm hover:bg-white/30"
          >
            <Bell className="h-5 w-5" />
            {sampleNotifs.length > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-red-500 text-xs text-white border-2 border-white">
                {sampleNotifs.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger> */}
        {/* <DropdownMenuContent align="end" className="w-80 p-0 bg-white/95 backdrop-blur-xl border-white/20">
          <div className="border-b border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <p className="text-sm text-gray-600">Stay updated with your learning progress</p>
          </div>
          <div className="max-h-96 overflow-auto">
            {sampleNotifs.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sampleNotifs.map((notif) => (
                  <Link
                    key={notif.id}
                    href={notif.href}
                    className="block p-4 hover:bg-white/60 transition-colors"
                  >
                    <div className="font-medium text-gray-900 text-sm">{notif.title}</div>
                    <div className="text-sm text-gray-600 mt-1">{notif.desc}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 p-3">
            <Link 
              href="/notifications"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View all notifications →
            </Link>
          </div>
        </DropdownMenuContent> */}
      </DropdownMenu>

      {/* User Profile Dropdown Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="h-10 gap-3 rounded-xl pl-2 pr-4 border-white/20 bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors"
          >
            <Avatar className="h-7 w-7">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={displayName} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-emerald-500 text-white font-semibold">
                  {initial}
                </AvatarFallback>
              )}
            </Avatar>
            <span className="hidden md:inline text-sm font-medium text-gray-900">
              {displayName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{displayName}</p>
              <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
          {isParent && (
            <DropdownMenuItem asChild>
              <Link href="/parent-dashboard" className="flex items-center cursor-pointer">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Dashboard</span>
              </Link>
            </DropdownMenuItem>
          )}
          {!isParent && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="flex items-center cursor-pointer">
                  <Home className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </Link>
          </DropdownMenuItem>
          
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
          <DropdownMenuItem 
            className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
            onClick={onLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function PublicNav() {
  return (
    <>
      <div className="hidden lg:flex items-center gap-3">
        <Link href="/login">
          <Button 
            variant="outline" 
            className="rounded-xl border-white/20 bg-white/20 backdrop-blur-sm hover:bg-white/30"
          >
            Sign in
          </Button>
        </Link>
        {/* Signup removed */}
      </div>
    </>
  )
}

function enrichGamiProfile(profile?: Props["userProfile"] | null): EnhancedUserProfile | null {
  if (!profile) {
    return null
  }
  const xp = typeof profile.xp === "number" ? profile.xp : undefined
  if (xp === undefined) {
    return { ...profile }
  }
  const level = getLevelFromXp(xp)
  const levelProgress = getGamificationLevelProgress(level, xp)
  return {
    ...profile,
    xp,
    level,
    levelProgressPercent: levelProgress.progressPercent,
  }
}

function LevelStatus({ userProfile }: { userProfile?: EnhancedUserProfile | null }) {
  const xp = Math.max(0, userProfile?.xp ?? 0)
  const level = userProfile?.level ?? getLevelFromXp(xp)
  const rawProgress =
    userProfile?.levelProgressPercent ??
    getGamificationLevelProgress(level, xp).progressPercent
  const progressPercent = Math.round(Math.max(0, Math.min(100, rawProgress)))

  return (
    <div className="flex flex-col gap-1 px-3 py-1.5 rounded-full bg-white/80 border border-white/40 shadow-sm">
      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
        <span>Level {level}</span>
        <span>{progressPercent}%</span>
      </div>
      <div className="h-1 w-32 rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  )
}
