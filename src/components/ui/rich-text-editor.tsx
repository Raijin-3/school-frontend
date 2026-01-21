'use client'

import React, { useCallback, useEffect, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, Type } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import DOMPurify from 'dompurify'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) {
    return null
  }

  return (
    <div className="border-b border-border px-3 py-2 flex items-center gap-1">
      <Button
        type="button"
        variant={editor.isActive('bold') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className="h-8 w-8 p-0"
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant={editor.isActive('italic') ? 'default' : 'ghost'}
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className="h-8 w-8 p-0"
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <div className="w-px h-6 bg-border mx-1" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().setHardBreak().run()}
        className="h-8 px-2"
        title="Line Break"
      >
        <Type className="h-4 w-4 mr-1" />
        Break
      </Button>
    </div>
  )
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'sup',
    'sub',
    'pre',
    'code',
    'br',
    'p',
    'div',
    'span',
    'table',
    'tr',
    'td',
    'th',
    'tbody',
    'thead',
    'tfoot',
    'ul',
    'ol',
    'li',
    'img',
    'a',
  ],
  ALLOWED_ATTR: [
    'class',
    'src',
    'alt',
    'title',
    'href',
    'target',
    'rel',
    'width',
    'height',
    'colspan',
    'rowspan',
    'scope',
  ],
}

const ADAPTIVE_TABLE_CLASS =
  'w-full border border-gray-200 border-collapse text-sm text-slate-700 rounded-lg shadow-sm my-4 bg-white'
const ADAPTIVE_TABLE_HEADER_CLASS =
  'border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-slate-700 uppercase text-[11px] tracking-wide'
const ADAPTIVE_TABLE_CELL_CLASS =
  'border border-gray-200 px-3 py-2 align-top text-slate-600'

const appendClassToTag = (html: string, tagName: string, className: string) => {
  const regex = new RegExp(`<${tagName}([^>]*)>`, 'gi')
  return html.replace(regex, (match, attrs = '') => {
    const classRegex = /class\s*=\s*(['"])(.*?)\1/i
    if (classRegex.test(attrs)) {
      return match.replace(classRegex, (_full, quote, existing) => {
        if (existing.includes(className)) {
          return `class=${quote}${existing}${quote}`
        }
        return `class=${quote}${existing} ${className}${quote}`
      })
    }
    return `<${tagName}${attrs} class="${className}">`
  })
}

const enhanceTables = (html: string) => {
  if (!html || !/<table/i.test(html)) {
    return html
  }

  const withTableClass = appendClassToTag(html, 'table', ADAPTIVE_TABLE_CLASS)
  const withHeaderClass = appendClassToTag(withTableClass, 'th', ADAPTIVE_TABLE_HEADER_CLASS)
  return appendClassToTag(withHeaderClass, 'td', ADAPTIVE_TABLE_CELL_CLASS)
}

export const sanitizeFormattedContent = (value?: string) => {
  if (!value || !value.trim() || value.trim() === '<p></p>') {
    return ''
  }
  const sanitized = DOMPurify.sanitize(value, SANITIZE_CONFIG)
  return enhanceTables(sanitized)
}

export function RichTextEditor({ 
  content, 
  onChange, 
  placeholder = "Enter text...", 
  className,
  disabled = false 
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
    },
    editable: !disabled,
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [editor, content])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Allow Shift+Enter to insert a hard break
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      editor?.chain().focus().setHardBreak().run()
    }
  }, [editor])

  return (
    <div className={cn("border border-border rounded-md bg-background", className)}>
      <MenuBar editor={editor} />
      <div 
        className="prose prose-sm max-w-none p-3 min-h-[100px] focus-within:outline-none"
        onKeyDown={handleKeyDown}
      >
        <EditorContent 
          editor={editor} 
          className="outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[80px] [&_.ProseMirror]:p-0"
        />
        {!content && (
          <div className="absolute inset-0 top-12 left-3 text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}

// Component for displaying formatted content
interface FormattedTextProps {
  content: string
  className?: string
}

export function FormattedText({ content, className }: FormattedTextProps) {
  const sanitizedContent = useMemo(
    () => sanitizeFormattedContent(content),
    [content],
  )

  if (!sanitizedContent) {
    return null
  }

  return (
    <div 
      className={cn("prose prose-sm max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  )
}
