import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase-server'
import { apiGet } from '@/lib/api'
import {
  SectionTopicListItem,
  SectionTopicsListClient,
} from './section-topics-client'

export const metadata = { title: 'Section Topics | Admin Dashboard' }

export default async function SectionTopicsPage() {
  const sb = supabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const profile = await apiGet<any>('/v1/profile').catch(() => null)
  if ((profile?.role ?? '').toLowerCase() !== 'admin') redirect('/dashboard')

  const topics = await apiGet<SectionTopicListItem[]>(
    '/v1/admin/section-topics',
  ).catch(() => [] as SectionTopicListItem[])

  return <SectionTopicsListClient initialTopics={topics} />
}
