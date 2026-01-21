'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

export interface SectionTopicListItem {
  id: string
  section_id?: string | null
  section_title: string
  module_id?: string | null
  module_title: string
  subject_id?: string | null
  subject_title: string
  topic_name: string
  topic_hierarchy: string
  future_topic: string
  section_order_index?: number | null
  module_order_index?: number | null
  subject_order_index?: number | null
}

interface SectionTopicsListProps {
  initialTopics: SectionTopicListItem[]
}

type EditableField = 'topic_name' | 'topic_hierarchy' | 'future_topic'

interface EditingState {
  id: string
  field: EditableField
}

export function SectionTopicsListClient({
  initialTopics,
}: SectionTopicsListProps) {
  const [topics, setTopics] = useState(initialTopics)
  const [search, setSearch] = useState('')
  const [editingCell, setEditingCell] = useState<EditingState | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null)
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null)

  useEffect(() => {
    setTopics(initialTopics)
  }, [initialTopics])

  const filteredTopics = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return topics
    return topics.filter((topic) => {
      const haystack = [
        topic.subject_title,
        topic.module_title,
        topic.section_title,
        topic.topic_name,
        topic.topic_hierarchy,
        topic.future_topic,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [topics, search])

  const resetEditing = () => {
    setEditingCell(null)
    setDraftValue('')
  }

  const startEditing = (topic: SectionTopicListItem, field: EditableField) => {
    setEditingCell({ id: topic.id, field })
    setDraftValue(topic[field] ?? '')
  }

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSave()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      resetEditing()
    }
  }

  const handleSave = async () => {
    const editing = editingCell
    if (!editing) return
    const currentTopic = topics.find((topic) => topic.id === editing.id)
    if (!currentTopic) {
      resetEditing()
      return
    }
    const normalizedValue = draftValue.trim()
    const previousValue = currentTopic[editing.field] ?? ''
    if (previousValue === normalizedValue) {
      resetEditing()
      return
    }

    setSavingTopicId(editing.id)
    try {
      const response = await fetch(
        `/api/admin/section-topics/${editing.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            [editing.field]: normalizedValue || null,
          }),
        },
      )
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to save topic')
      }
      setTopics((prev) =>
        prev.map((topic) =>
          topic.id === editing.id
            ? { ...topic, [editing.field]: normalizedValue }
            : topic,
        ),
      )
      toast.success('Topic updated')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save topic'
      toast.error(message)
    } finally {
      setSavingTopicId((id) => (id === editing.id ? null : id))
      resetEditing()
    }
  }

  const escapeCsvValue = (value: string) =>
    `"${value.replace(/"/g, '""')}"`

  const handleDownload = () => {
    if (!topics.length) {
      toast.error('No topic data to download')
      return
    }
    const header = [
      'Subject Title',
      'Module Title',
      'Section Title',
      'Topic Name',
      'Topic Hierarchy',
      'Future Topic',
    ]
    const rows = topics.map((topic) =>
      [
        topic.subject_title || '',
        topic.module_title || '',
        topic.section_title || '',
        topic.topic_name || '',
        topic.topic_hierarchy || '',
        topic.future_topic || '',
      ].map(escapeCsvValue).join(','),
    )
    const csvContent = [header.map(escapeCsvValue).join(','), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'section-topics.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const renderEditableCell = (
    topic: SectionTopicListItem,
    field: EditableField,
    multiline = false,
  ) => {
    const value = topic[field] || ''
    const isEditing = editingCell?.id === topic.id && editingCell.field === field
    const InputComponent = multiline ? Textarea : Input

    if (isEditing) {
      return (
        <InputComponent
          autoFocus
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={handleSave}
          onKeyDown={handleCellKeyDown}
          disabled={savingTopicId === topic.id}
          className="min-h-[48px]"
        />
      )
    }

    return (
      <button
        type="button"
        className="text-left w-full text-sm font-medium text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        disabled={savingTopicId === topic.id}
        onClick={() => startEditing(topic, field)}
      >
        {value || 'Unknown'}
      </button>
    )
  }

  const handleDeleteTopic = async (topic: SectionTopicListItem) => {
    if (!confirm('Delete this section topic entry? This cannot be undone.')) {
      return
    }
    setDeletingTopicId(topic.id)
    try {
      const response = await fetch(`/api/admin/section-topics/${topic.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to delete topic')
      }
      setTopics((prev) => prev.filter((row) => row.id !== topic.id))
      toast.success('Topic deleted')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete topic'
      toast.error(message)
    } finally {
      setDeletingTopicId((current) => (current === topic.id ? null : current))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/80 backdrop-blur-xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--brand))]/10 via-transparent to-[hsl(var(--brand-accent))]/10" />
          <div className="relative p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Section Topics
                </h1>
                <p className="text-sm text-gray-600">
                  Review subject, module, section, and topic metadata sourced from
                  the <code>section_topics</code> table. Click a topic cell to make
                  inline edits.
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                  placeholder="Search subjects, modules, topics..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full md:w-80"
                />
                <Button
                  variant="outline"
                  onClick={() => handleDownload()}
                  className="w-full md:w-auto"
                >
                  Download Excel
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Card className="border-white/20 bg-white/80 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Topic Hierarchy Inventory</span>
              <span className="text-xs text-muted-foreground">
                {filteredTopics.length} of {topics.length} visible
              </span>
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Subject, module, section, topic, hierarchy, and future topic values
              are listed so you can understand how topics are structured today.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredTopics.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">
                No matching section topic metadata found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-right">#</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Topic Hierarchy</TableHead>
                      <TableHead>Future Topic</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTopics.map((topic, index) => (
                      <TableRow
                        key={topic.id}
                        className="group hover:bg-slate-50 transition-colors"
                      >
                        <TableCell className="text-right font-semibold text-sm">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {topic.subject_title || 'Unknown'}
                        </TableCell>
                        <TableCell>{topic.module_title || 'Unknown'}</TableCell>
                        <TableCell>{topic.section_title || 'Unknown'}</TableCell>
                        <TableCell className="py-2">
                          {renderEditableCell(topic, 'topic_name')}
                        </TableCell>
                        <TableCell className="max-w-xs break-words text-sm text-gray-600 py-2">
                          {renderEditableCell(topic, 'topic_hierarchy', true)}
                        </TableCell>
                        <TableCell className="max-w-xs break-words text-sm text-gray-600 py-2">
                          {renderEditableCell(topic, 'future_topic', true)}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            className="text-xs font-semibold uppercase tracking-wide text-red-600 hover:text-red-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 disabled:pointer-events-none"
                            onClick={() => handleDeleteTopic(topic)}
                            disabled={deletingTopicId === topic.id}
                          >
                      <Trash2 className="inline h-4 w-4 mr-1 align-text-bottom" />
                            Delete
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
