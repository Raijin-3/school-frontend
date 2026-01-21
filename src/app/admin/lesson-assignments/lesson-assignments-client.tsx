"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BookOpen,
  ClipboardList,
  Layers,
  Plus,
  Target,
} from "lucide-react"
import { toast } from "sonner"

type ClassRow = {
  id: string
  name: string
  grade_level: string
  status: "active" | "archived"
}

type SubjectRow = {
  id: string
  title: string
  course_id: string
}

type ModuleRow = {
  id: string
  title: string
  subject_id: string
}

type SectionRow = {
  id: string
  title: string
  module_id: string
}

type SectionTopicRow = {
  id: string
  section_id: string
  topic_name?: string | null
  future_topic?: string | null
  topic_hierarchy?: string | null
}

type AssignmentRow = {
  id: string
  class_id: string
  subject_id: string
  module_id: string
  section_id?: string | null
  section_topic_id?: string | null
  trigger_type: "manual" | "scheduled" | "on_completion"
  status: string
  assigned_at: string
  due_at?: string | null
}

export function LessonAssignmentsClient() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [sections, setSections] = useState<SectionRow[]>([])
  const [sectionTopics, setSectionTopics] = useState<SectionTopicRow[]>([])
  const [classSubjects, setClassSubjects] = useState<string[]>([])
  const [assignments, setAssignments] = useState<AssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [form, setForm] = useState({
    class_id: "",
    subject_id: "",
    module_id: "",
    section_id: "",
    section_topic_id: "",
    trigger_type: "manual" as AssignmentRow["trigger_type"],
    due_at: "",
  })

  const classLookup = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])
  const subjectLookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects])
  const moduleLookup = useMemo(() => new Map(modules.map((item) => [item.id, item])), [modules])
  const sectionLookup = useMemo(() => new Map(sections.map((item) => [item.id, item])), [sections])
  const sectionTopicLookup = useMemo(() => new Map(sectionTopics.map((item) => [item.id, item])), [sectionTopics])

  const filteredSubjects = subjects.filter((subject) => classSubjects.includes(subject.id))
  const filteredTopics = form.section_id
    ? sectionTopics.filter((topic) => topic.section_id === form.section_id)
    : []

  const loadBase = async () => {
    try {
      setLoading(true)
      const [classRes, subjectRes, assignmentRes, topicRes] = await Promise.all([
        fetch("/api/admin/classes"),
        fetch("/api/admin/subjects"),
        fetch("/api/admin/lesson-assignments"),
        fetch("/api/admin/section-topics"),
      ])

      const classData = classRes.ok ? await classRes.json() : []
      const subjectData = subjectRes.ok ? await subjectRes.json() : []
      const assignmentData = assignmentRes.ok ? await assignmentRes.json() : []
      const topicData = topicRes.ok ? await topicRes.json() : []

      setClasses(classData || [])
      setSubjects(subjectData || [])
      setAssignments(assignmentData || [])
      setSectionTopics(topicData || [])
    } catch (error: any) {
      toast.error(`Failed to load lesson assignments: ${error.message || "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBase()
  }, [])

  useEffect(() => {
    if (!form.class_id) {
      setClassSubjects([])
      return
    }
    fetch(`/api/admin/classes/${form.class_id}/subjects`)
      .then((res) => res.json())
      .then((data) => setClassSubjects((data || []).map((row: { subject_id: string }) => row.subject_id)))
  }, [form.class_id])

  useEffect(() => {
    if (!form.subject_id) {
      setModules([])
      setSections([])
      setForm((prev) => ({ ...prev, module_id: "", section_id: "", section_topic_id: "" }))
      return
    }
    fetch(`/api/admin/subjects/${form.subject_id}/modules`)
      .then((res) => res.json())
      .then((data) => setModules(data || []))
  }, [form.subject_id])

  useEffect(() => {
    if (!form.module_id) {
      setSections([])
      setForm((prev) => ({ ...prev, section_id: "", section_topic_id: "" }))
      return
    }
    fetch(`/api/admin/modules/${form.module_id}/sections`)
      .then((res) => res.json())
      .then((data) => setSections(data || []))
  }, [form.module_id])

  const handleCreateAssignment = async () => {
    try {
      const response = await fetch("/api/admin/lesson-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: form.class_id,
          subject_id: form.subject_id,
          module_id: form.module_id,
          section_id: form.section_id || null,
          section_topic_id: form.section_topic_id || null,
          trigger_type: form.trigger_type,
          due_at: form.due_at || null,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }

      toast.success("Lesson assignment created")
      setIsDialogOpen(false)
      setForm({
        class_id: "",
        subject_id: "",
        module_id: "",
        section_id: "",
        section_topic_id: "",
        trigger_type: "manual",
        due_at: "",
      })
      const updated = await fetch("/api/admin/lesson-assignments").then((res) => res.json())
      setAssignments(updated || [])
    } catch (error: any) {
      toast.error(`Failed to create assignment: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/80 backdrop-blur-xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--brand))]/10 via-transparent to-[hsl(var(--brand-accent))]/10" />
          <div className="relative p-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Lesson Assignments
                </h1>
                <p className="text-gray-600 mt-2">Assign modules and sections to classes.</p>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))] hover:opacity-90">
                    <Plus className="h-4 w-4 mr-2" />
                    New Assignment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create lesson assignment</DialogTitle>
                    <DialogDescription>Select class, subject, module, and scope.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Class</Label>
                        <Select
                          value={form.class_id}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, class_id: value, subject_id: "", module_id: "", section_id: "", section_topic_id: "" }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                          <SelectContent>
                            {classes.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Subject</Label>
                        <Select
                          value={form.subject_id}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, subject_id: value, module_id: "", section_id: "", section_topic_id: "" }))}
                          disabled={!form.class_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select subject" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredSubjects.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Topic (Module)</Label>
                        <Select
                          value={form.module_id}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, module_id: value, section_id: "", section_topic_id: "" }))}
                          disabled={!form.subject_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select module" />
                          </SelectTrigger>
                          <SelectContent>
                            {modules.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Subtopic (Section)</Label>
                        <Select
                          value={form.section_id}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, section_id: value, section_topic_id: "" }))}
                          disabled={!form.module_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                          <SelectContent>
                            {sections.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Granular scope (optional)</Label>
                        <Select
                          value={form.section_topic_id}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, section_topic_id: value }))}
                          disabled={!form.section_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select section topic" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredTopics.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.topic_name || item.future_topic || item.topic_hierarchy || "Topic"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Trigger</Label>
                        <Select
                          value={form.trigger_type}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, trigger_type: value as AssignmentRow["trigger_type"] }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select trigger" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                            <SelectItem value="on_completion">On completion</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Due date (optional)</Label>
                      <Input
                        type="date"
                        value={form.due_at}
                        onChange={(event) => setForm((prev) => ({ ...prev, due_at: event.target.value }))}
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                        onClick={handleCreateAssignment}
                        disabled={!form.class_id || !form.subject_id || !form.module_id}
                      >
                        Create assignment
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assignments</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{assignments.length}</div>
              <p className="text-xs text-muted-foreground">All classes</p>
            </CardContent>
          </Card>
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(assignments.map((item) => item.class_id)).size}
              </div>
              <p className="text-xs text-muted-foreground">With assignments</p>
            </CardContent>
          </Card>
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {assignments.filter((item) => item.trigger_type === "scheduled").length}
              </div>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>Overview of lesson assignments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      {classLookup.get(assignment.class_id)?.name || assignment.class_id}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-gray-400" />
                        {subjectLookup.get(assignment.subject_id)?.title || assignment.subject_id}
                      </div>
                    </TableCell>
                    <TableCell>{moduleLookup.get(assignment.module_id)?.title || assignment.module_id}</TableCell>
                    <TableCell>{assignment.section_id ? (sectionLookup.get(assignment.section_id)?.title || assignment.section_id) : "All sections"}</TableCell>
                    <TableCell>
                      {assignment.section_topic_id
                        ? sectionTopicLookup.get(assignment.section_topic_id)?.topic_name ||
                          sectionTopicLookup.get(assignment.section_topic_id)?.future_topic ||
                          sectionTopicLookup.get(assignment.section_topic_id)?.topic_hierarchy ||
                          assignment.section_topic_id
                        : "All topics"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{assignment.trigger_type.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={assignment.status === "assigned" ? "default" : "secondary"}>
                        {assignment.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
