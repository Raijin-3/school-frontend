import { NextResponse } from "next/server"
import { getBearerTokenFromRequest } from "@/lib/server/supabase-session"

const API_URL = process.env.API_URL

export async function GET(req: Request) {
  try {
    const token = await getBearerTokenFromRequest(req)
    if (!token) {
      return NextResponse.json({ error: "No auth token" }, { status: 401 })
    }

    if (!API_URL) {
      throw new Error("API_URL is not configured")
    }

    const res = await fetch(`${API_URL}/v1/profile/children`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`API /v1/profile/children failed: ${res.status} ${text}`)
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to load parent children" },
      { status: 500 },
    )
  }
}
