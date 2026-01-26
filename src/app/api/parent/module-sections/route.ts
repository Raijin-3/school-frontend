import { NextResponse } from "next/server"
import { getBearerTokenFromRequest } from "@/lib/server/supabase-session"

export async function GET(req: Request) {
  const bearerToken = await getBearerTokenFromRequest(req)
  if (!bearerToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const moduleId = url.searchParams.get("module_id")?.trim()
  if (!moduleId) {
    return NextResponse.json(
      { error: "module_id is required" },
      { status: 400 },
    )
  }
  const childId = url.searchParams.get("child_id")?.trim()

  const API_URL =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  const query = childId ? `?child_id=${encodeURIComponent(childId)}` : ""

  const response = await fetch(
    `${API_URL}/v1/modules/${moduleId}/sections-attempts${query}`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
      cache: "no-store",
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    return NextResponse.json(
      { error: `API failed: ${response.status} ${text}` },
      { status: response.status },
    )
  }

  const payload = await response.json()
  return NextResponse.json(payload)
}
