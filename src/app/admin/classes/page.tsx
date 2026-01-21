import { redirect } from "next/navigation"
import { supabaseServer } from "@/lib/supabase-server"
import { apiGet } from "@/lib/api"
import { ClassesManagementClient } from "./classes-client"

export const metadata = { title: "Class Management | Admin Dashboard" }

export default async function ClassesPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect("/login")

  const profile = await apiGet<any>("/v1/profile").catch(() => null)
  if ((profile?.role ?? "").toLowerCase() !== "admin") redirect("/dashboard")

  return <ClassesManagementClient />
}
