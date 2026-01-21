"use client"

import { useState } from "react"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type TopicRow = {
  id: string
  subject: string
  module: string
  section: string
  topicName: string
  topicHierarchy: string
  futureTopic: string
}

type TopicField = Exclude<keyof TopicRow, "id">

const initialTopicRows: TopicRow[] = [
  {
    id: "row-1",
    subject: "Mathematics",
    module: "Algebra I",
    section: "Linear Equations",
    topicName: "Slope & Intercepts",
    topicHierarchy: "Mathematics > Algebra I > Linear Equations > Slope",
    futureTopic: "Systems of Equations",
  },
  {
    id: "row-2",
    subject: "Computer Science",
    module: "Programming Foundations",
    section: "Control Flow",
    topicName: "Conditional Logic",
    topicHierarchy: "Computer Science > Programming Foundations > Control Flow",
    futureTopic: "Loops & Iterators",
  },
  {
    id: "row-3",
    subject: "Physics",
    module: "Mechanics",
    section: "Motion",
    topicName: "Vectors",
    topicHierarchy: "Physics > Mechanics > Motion > Vectors",
    futureTopic: "Forces",
  },
]

const columns: { header: string; field: TopicField }[] = [
  { header: "Subject", field: "subject" },
  { header: "Module", field: "module" },
  { header: "Section", field: "section" },
  { header: "Topic Name", field: "topicName" },
  { header: "Topic Hierarchy", field: "topicHierarchy" },
  { header: "Future Topic", field: "futureTopic" },
]

const createEmptyRow = (): TopicRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  subject: "",
  module: "",
  section: "",
  topicName: "",
  topicHierarchy: "",
  futureTopic: "",
})

export function TopicTaggingPanel() {
  const [rows, setRows] = useState(initialTopicRows)
  const [editingCell, setEditingCell] = useState<
    { rowId: string; field: TopicField } | null
  >(null)

  const handleCellChange =
    (rowId: string, field: TopicField) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setRows((previous) =>
        previous.map((row) =>
          row.id === rowId ? { ...row, [field]: value } : row
        )
      )
    }

  const addRow = () => setRows((previous) => [...previous, createEmptyRow()])

  const cellClasses = (rowId: string, field: TopicField) =>
    cn(
      "border border-transparent px-1",
      editingCell?.rowId === rowId && editingCell?.field === field
        ? "bg-indigo-50 ring-1 ring-indigo-200"
        : "hover:bg-slate-50/60",
      "transition-colors"
    )

  return (
    <div className="space-y-4 rounded-2xl border border-white/30 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900">Section topic tagging</p>
          <p className="text-sm text-gray-500">
            Track subject/module/section metadata, plan future topics, and style cells like
            editable spreadsheets on the fly.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add row
        </Button>
      </div>

      <Tabs defaultValue="tagging" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tagging">Tagging table</TabsTrigger>
          <TabsTrigger value="guidelines">Hierarchy notes</TabsTrigger>
        </TabsList>

        <TabsContent value="tagging">
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.field}>{column.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-0">
                  {columns.map((column) => (
                    <TableCell
                      key={`${row.id}-${column.field}`}
                      className={cellClasses(row.id, column.field)}
                    >
                      <input
                        type="text"
                        value={row[column.field]}
                        onChange={handleCellChange(row.id, column.field)}
                        onFocus={() =>
                          setEditingCell({ rowId: row.id, field: column.field })
                        }
                        onBlur={() =>
                          setEditingCell((current) =>
                            current?.rowId === row.id && current?.field === column.field
                              ? null
                              : current
                          )
                        }
                        placeholder={column.header}
                        className="w-full border-0 bg-transparent px-2 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                        autoComplete="off"
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-4 text-center text-sm text-gray-500">
                    Add a row and click a cell to start editing like in your favorite spreadsheet tool.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="guidelines">
          <div className="space-y-2 rounded-xl border border-dashed border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Hierarchy guidance</p>
            <ul className="space-y-1 pl-4">
              <li>Subject should match the curriculum track and stay consistent across modules.</li>
              <li>Module & section names should mirror the course outline served to students.</li>
              <li>
                Topic hierarchy is best expressed as a path (e.g., "Mathematics > Algebra I > Linear
                Equations").
              </li>
              <li>
                Use Future Topic to note upcoming content, follow-up exercises, or AI prompt hooks for
                tagging.
              </li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
