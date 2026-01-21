import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

// Use configured API URL; default to local Nest API in dev
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

async function getAuthHeaders() {
  const supabase = supabaseServer()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error('Not authenticated')
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
  }
}

// POST /api/admin/users/bulk-import - Bulk import users via CSV
export async function POST(request: NextRequest) {
  try {
    const headers = await getAuthHeaders()
    const formData = await request.formData()

    // Forward the form data to the backend API
    const response = await fetch(`${API_BASE_URL}/v1/admin/users/bulk-import`, {
      method: 'POST',
      headers: {
        ...headers,
        // Let the browser set the Content-Type with boundary for multipart/form-data
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Admin bulk import API error:', error)
    return NextResponse.json(
      { error: 'Failed to process bulk import' },
      { status: 500 }
    )
  }
}
