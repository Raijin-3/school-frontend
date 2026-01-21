"use client"

import { useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { logDailyLoginActivity } from "@/lib/log-daily-login"
import { loginWithBackend, type BackendLoginResponse } from "@/lib/login-with-backend"
import { toast } from "@/lib/toast"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Eye, EyeOff, User, GraduationCap, Users, Loader2, KeyRound, ArrowRight } from "lucide-react"

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type RoleType = "student" | "teacher" | "parent"
type AuthRole = RoleType | "admin"

const roleConfig = {
  student: {
    icon: <User className="h-4 w-4" />,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-50/80",
    borderColor: "border-blue-200",
    textColor: "text-blue-700",
    description: "Access courses, projects, and AI-powered learning"
  },
  teacher: {
    icon: <GraduationCap className="h-4 w-4" />,
    color: "from-emerald-500 to-teal-500", 
    bgColor: "bg-emerald-50/80",
    borderColor: "border-emerald-200",
    textColor: "text-emerald-700",
    description: "Manage courses, track progress, and view analytics"
  },
  parent: {
    icon: <Users className="h-4 w-4" />,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    textColor: "text-amber-700",
    description: "Stay connected with student progress and announcements"
  }
}

export function LoginForm() {
  const sb = supabaseBrowser()
  const [showPass, setShowPass] = useState(false)
  const [roleTab, setRoleTab] = useState<RoleType>("student")
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  })

  const resolveRedirectPath = async (payload: BackendLoginResponse): Promise<string> => {
    const normalizedRole = String(payload?.user?.role ?? "student").toLowerCase()
    const fallbackRole: RoleType =
      normalizedRole === "admin" || normalizedRole === "teacher" ? (normalizedRole as RoleType) : "student"
    const fallbackTarget =
      fallbackRole === "admin"
        ? "/admin"
        : fallbackRole === "teacher"
          ? "/teacher"
          : "/dashboard"

    const supabaseToken = payload?.supabase_session?.access_token

    if (!supabaseToken) {
      return fallbackTarget
    }

    try {
      const res = await fetch("/v1/profile", {
        headers: { Authorization: `Bearer ${supabaseToken}` },
        cache: "no-store",
      })

      if (!res.ok) {
        throw new Error(`Profile lookup failed: ${res.status}`)
      }

      const profile = await res.json()
      const role = String(profile?.role ?? fallbackRole).toLowerCase()

      if (role === "admin") return "/admin"
      if (role === "teacher") return "/teacher"
      if (!profile?.onboarding_completed) return "/profile"

      return "/dashboard"
    } catch (error) {
      console.error("Failed to determine redirect destination:", error)
      return fallbackTarget
    }
  }

  const submit = async (v: z.infer<typeof schema>) => {
    setIsLoading(true)

    const handleCredentialError = (error: unknown) => {
      const rawMessage = error instanceof Error ? error.message : "Sign-in failed"
      const normalized = rawMessage.toLowerCase()
      const credentialHint =
        normalized.includes("invalid") ||
        normalized.includes("credential") ||
        normalized.includes("unauthorized") ||
        normalized.includes("password")
      const message = credentialHint
        ? "Invalid email or password. Please double-check your credentials and try again."
        : rawMessage || "Sign-in failed. Please try again."
      toast.error(message)
    }

    let payload: BackendLoginResponse

    try {
      payload = await loginWithBackend(v)
    } catch (error) {
      console.error("Login request failed:", error)
      handleCredentialError(error)
      setIsLoading(false)
      return
    }

    try {
      const authRole = String(payload?.user?.role ?? "student").toLowerCase() as AuthRole
      const roleAllowed =
        (roleTab === "student" && authRole === "student") ||
        (roleTab === "teacher" && (authRole === "teacher" || authRole === "admin")) ||
        (roleTab === "parent" && authRole === "parent")

      if (!roleAllowed) {
        const friendlyRole =
          authRole === "admin" || authRole === "teacher"
            ? "Teacher"
            : authRole === "parent"
              ? "Parent"
              : "Student"
        toast.error(`This account is a ${authRole}. Please use the ${friendlyRole} login tab.`)
        setIsLoading(false)
        return
      }

      const session = payload.supabase_session
      await toast.promise(
        (async () => {
          if (!session) throw new Error("Failed to establish Supabase session")
          const { error: sessionError } = await sb.auth.setSession(session)
          if (sessionError) throw sessionError
          await logDailyLoginActivity(session)
          return payload
        })(),
        {
          loading: "Signing you in...",
          success: "Welcome back! Redirecting...",
          error: (e: any) => e?.message || "Sign-in failed",
        }
      )

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: payload.supabase_session }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Session sync failed: ${text}`)
      }

      const nextPath = await resolveRedirectPath(payload)
      setIsLoading(false)
      if (typeof window !== "undefined") {
        window.location.href = nextPath
      }
    } catch (error) {
      console.error("Login post-processing failed:", error)
      setIsLoading(false)
    }
  }
  if (!mounted) {
    return null
  }

  return (
    <div className="relative">
      {/* Animated Card Background */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-xl shadow-2xl"></div>
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-emerald-500/5"></div>
      
      {/* Main Content */}
      <div className="relative rounded-2xl border border-white/60 bg-white/80 p-6 backdrop-blur-xl shadow-xl md:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${roleConfig[roleTab].color} shadow-lg`}>
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
          <p className="mt-2 text-sm text-gray-600">Choose your role to continue</p>
        </div>

        <Tabs value={roleTab} onValueChange={(value) => setRoleTab(value as RoleType)} className="mb-6">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-2 rounded-2xl bg-white/70 p-2 shadow-inner">
            <TabsTrigger
              value="teacher"
              className="h-auto flex-col gap-2 rounded-xl px-2 py-2 text-[11px] font-semibold leading-tight text-gray-700 whitespace-normal data-[state=active]:text-emerald-700"
            >
              <span className="inline-flex items-center gap-1.5">
                {roleConfig.teacher.icon}
                Continue as Teacher
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="student"
              className="h-auto flex-col gap-2 rounded-xl px-2 py-2 text-[11px] font-semibold leading-tight text-gray-700 whitespace-normal data-[state=active]:text-blue-700"
            >
              <span className="inline-flex items-center gap-1.5">
                {roleConfig.student.icon}
                Continue as Student
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="parent"
              className="h-auto flex-col gap-2 rounded-xl px-2 py-2 text-[11px] font-semibold leading-tight text-gray-700 whitespace-normal data-[state=active]:text-amber-700"
            >
              <span className="inline-flex items-center gap-1.5">
                {roleConfig.parent.icon}
                Continue as Parent
              </span>
            </TabsTrigger>
          </TabsList>

          <div className={`mt-4 rounded-xl border ${roleConfig[roleTab].borderColor} ${roleConfig[roleTab].bgColor} p-3`}>
            <TabsContent value="teacher">
              <p className={`text-sm ${roleConfig.teacher.textColor}`}>{roleConfig.teacher.description}</p>
            </TabsContent>
            <TabsContent value="student">
              <p className={`text-sm ${roleConfig.student.textColor}`}>{roleConfig.student.description}</p>
            </TabsContent>
            <TabsContent value="parent">
              <p className={`text-sm ${roleConfig.parent.textColor}`}>{roleConfig.parent.description}</p>
            </TabsContent>
          </div>
        </Tabs>

        <form className="space-y-6" onSubmit={form.handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="lemail" className="text-sm font-medium text-gray-700">
              Email address
            </Label>
            <Input 
              id="lemail" 
              type="email" 
              placeholder="Enter your email"
              inputMode="email" 
              autoComplete="email"
              className="h-12 rounded-xl border-gray-200 bg-white/80 px-4 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
              {...form.register("email")} 
            />
            {form.formState.errors.email && (
              <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lpass" className="text-sm font-medium text-gray-700">
              Password
            </Label>
            <div className="relative">
              <Input 
                id="lpass" 
                type={showPass ? "text" : "password"} 
                placeholder="Enter your password"
                autoComplete="current-password"
                className="h-12 rounded-xl border-gray-200 bg-white/80 px-4 pr-12 text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
                {...form.register("password")} 
              />
              <button 
                type="button" 
                aria-label={showPass ? "Hide password" : "Show password"} 
                className="absolute inset-y-0 right-4 inline-flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
            )}
          </div>

          {/* Forgot Password Link */}
          <div className="text-right">
            <a 
              href="/forgot-password" 
              className="text-sm text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              Forgot your password?
            </a>
          </div>

          <Button 
            className={`group h-12 w-full rounded-xl bg-gradient-to-r ${roleConfig[roleTab].color} text-white shadow-lg transition-all hover:shadow-xl hover:scale-[1.02] disabled:scale-100 disabled:opacity-70`}
            type="submit" 
            disabled={isLoading || form.formState.isSubmitting}
          >
            {isLoading || form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Continue as {roleTab.charAt(0).toUpperCase() + roleTab.slice(1)}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
