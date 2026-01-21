import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

async function getAuthHeaders() {
  const supabase = supabaseServer()
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error('Not authenticated')
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { topicId: string } },
) {
  try {
    const headers = await getAuthHeaders()
    const body = await request.json()

    const response = await fetch(
      `${API_BASE_URL}/v1/admin/section-topics/${params.topicId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Admin section topics update failed', error)
    return NextResponse.json(
      { error: 'Failed to update section topic' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { topicId: string } },
) {
  try {
    const headers = await getAuthHeaders()

    const response = await fetch(
      `${API_BASE_URL}/v1/admin/section-topics/${params.topicId}`,
      {
        method: 'DELETE',
        headers,
      },
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Admin section topics delete failed', error)
    return NextResponse.json(
      { error: 'Failed to delete section topic' },
      { status: 500 },
    )
  }
}
