import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { LessonAssignmentsClient } from "./lesson-assignments-client"

export const metadata = { title: "Lesson Assignments | Admin Dashboard" }

export default async function LessonAssignmentsPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  if ((profile?.role ?? "").toLowerCase() !== "admin") redirect("/dashboard")

  return <LessonAssignmentsClient />
}
