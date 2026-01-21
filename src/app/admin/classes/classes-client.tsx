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
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BookOpen,
  GraduationCap,
  Layers,
  MoreHorizontal,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

type ClassRow = {
  id: string
  name: string
  grade_level: string
  section_label?: string | null
  academic_year?: string | null
  status: "active" | "archived"
  created_at: string
}

type UserRow = {
  id: string
  email: string
  full_name?: string | null
  role: "student" | "teacher" | "admin"
}

type SubjectRow = {
  id: string
  title: string
  course_id: string
}

type MemberRow = {
  user_id: string
  role: "teacher" | "student"
  status: string
  joined_at: string
}

type ClassSubjectRow = {
  subject_id: string
}

export function ClassesManagementClient() {
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [teachers, setTeachers] = useState<UserRow[]>([])
  const [students, setStudents] = useState<UserRow[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [classSubjects, setClassSubjects] = useState<ClassSubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isMembersOpen, setIsMembersOpen] = useState(false)
  const [isSubjectsOpen, setIsSubjectsOpen] = useState(false)
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [memberRole, setMemberRole] = useState<"teacher" | "student">("student")
  const [formState, setFormState] = useState({
    name: "",
    grade_level: "",
    section_label: "",
    academic_year: "",
  })

  const subjectLookup = useMemo(() => {
    return new Map(subjects.map((subject) => [subject.id, subject]))
  }, [subjects])

  const userLookup = useMemo(() => {
    const combined = [...teachers, ...students]
    return new Map(combined.map((user) => [user.id, user]))
  }, [teachers, students])

  const refreshClasses = async () => {
    const res = await fetch("/api/admin/classes")
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error")
      throw new Error(text)
    }
    const data = await res.json()
    setClasses(data || [])
  }

  const loadBaseData = async () => {
    try {
      setLoading(true)
      await Promise.all([
        refreshClasses(),
        fetch("/api/admin/subjects")
          .then((res) => res.json())
          .then((data) => setSubjects(data || [])),
        fetch("/api/admin/users?role=teacher")
          .then((res) => res.json())
          .then((data) => setTeachers(data.users || [])),
        fetch("/api/admin/users?role=student")
          .then((res) => res.json())
          .then((data) => setStudents(data.users || [])),
      ])
    } catch (error: any) {
      toast.error(`Failed to load classes: ${error.message || "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const loadClassDetails = async (classId: string) => {
    const [memberRes, subjectRes] = await Promise.all([
      fetch(`/api/admin/classes/${classId}/members`),
      fetch(`/api/admin/classes/${classId}/subjects`),
    ])

    if (memberRes.ok) {
      const data = await memberRes.json()
      setMembers(data || [])
    }

    if (subjectRes.ok) {
      const data = await subjectRes.json()
      setClassSubjects(data || [])
    }
  }

  useEffect(() => {
    loadBaseData()
  }, [])

  useEffect(() => {
    if (selectedClass?.id) {
      loadClassDetails(selectedClass.id)
    } else {
      setMembers([])
      setClassSubjects([])
    }
  }, [selectedClass])

  const handleCreateClass = async () => {
    try {
      const response = await fetch("/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formState.name.trim(),
          grade_level: formState.grade_level.trim(),
          section_label: formState.section_label.trim() || null,
          academic_year: formState.academic_year.trim() || null,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }

      toast.success("Class created")
      setIsCreateOpen(false)
      setFormState({ name: "", grade_level: "", section_label: "", academic_year: "" })
      await refreshClasses()
    } catch (error: any) {
      toast.error(`Failed to create class: ${error.message}`)
    }
  }

  const handleEditClass = async () => {
    if (!selectedClass) return
    try {
      const response = await fetch(`/api/admin/classes/${selectedClass.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formState.name.trim(),
          grade_level: formState.grade_level.trim(),
          section_label: formState.section_label.trim() || null,
          academic_year: formState.academic_year.trim() || null,
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }

      toast.success("Class updated")
      setIsEditOpen(false)
      await refreshClasses()
    } catch (error: any) {
      toast.error(`Failed to update class: ${error.message}`)
    }
  }

  const handleArchiveClass = async (classId: string) => {
    if (!confirm("Archive this class?")) return
    try {
      const response = await fetch(`/api/admin/classes/${classId}`, { method: "DELETE" })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      toast.success("Class archived")
      if (selectedClass?.id === classId) setSelectedClass(null)
      await refreshClasses()
    } catch (error: any) {
      toast.error(`Failed to archive class: ${error.message}`)
    }
  }

  const submitMembers = async (role: "teacher" | "student", userIds: string[]) => {
    const response = await fetch(`/api/admin/classes/${selectedClass!.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: userIds,
        role,
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text)
    }
  }

  const handleAddMembers = async () => {
    if (!selectedClass) return
    try {
      const tasks: Promise<void>[] = []
      if (selectedStudentIds.length) {
        tasks.push(submitMembers("student", selectedStudentIds))
      }
      if (selectedTeacherIds.length) {
        tasks.push(submitMembers("teacher", selectedTeacherIds))
      }
      if (!tasks.length) {
        throw new Error("Select at least one member")
      }

      await Promise.all(tasks)
      toast.success("Members added")
      setIsMembersOpen(false)
      setSelectedStudentIds([])
      setSelectedTeacherIds([])
      await loadClassDetails(selectedClass.id)
    } catch (error: any) {
      toast.error(`Failed to add members: ${error.message}`)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedClass) return
    try {
      const response = await fetch(`/api/admin/classes/${selectedClass.id}/members/${memberId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      toast.success("Member removed")
      await loadClassDetails(selectedClass.id)
    } catch (error: any) {
      toast.error(`Failed to remove member: ${error.message}`)
    }
  }

  const handleAddSubjects = async () => {
    if (!selectedClass) return
    try {
      const response = await fetch(`/api/admin/classes/${selectedClass.id}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_ids: selectedSubjectIds }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      toast.success("Subjects assigned")
      setIsSubjectsOpen(false)
      setSelectedSubjectIds([])
      await loadClassDetails(selectedClass.id)
    } catch (error: any) {
      toast.error(`Failed to add subjects: ${error.message}`)
    }
  }

  const handleRemoveSubject = async (subjectId: string) => {
    if (!selectedClass) return
    try {
      const response = await fetch(`/api/admin/classes/${selectedClass.id}/subjects/${subjectId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text)
      }
      toast.success("Subject removed")
      await loadClassDetails(selectedClass.id)
    } catch (error: any) {
      toast.error(`Failed to remove subject: ${error.message}`)
    }
  }

  const handleSelectClass = (item: ClassRow) => {
    setSelectedClass(item)
    setFormState({
      name: item.name,
      grade_level: item.grade_level,
      section_label: item.section_label || "",
      academic_year: item.academic_year || "",
    })
  }

  const membersByRole = useMemo(() => {
    return {
      teachers: members.filter((m) => m.role === "teacher"),
      students: members.filter((m) => m.role === "student"),
    }
  }, [members])

  const selectedSubjects = classSubjects
    .map((item) => subjectLookup.get(item.subject_id))
    .filter(Boolean) as SubjectRow[]

  const roleOptions = memberRole === "teacher" ? teachers : students
  const selectedIds = memberRole === "teacher" ? selectedTeacherIds : selectedStudentIds
  const setSelectedIds = memberRole === "teacher" ? setSelectedTeacherIds : setSelectedStudentIds

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
                  Class Management
                </h1>
                <p className="text-gray-600 mt-2">Create classes, manage membership, and assign subjects.</p>
              </div>
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))] hover:opacity-90">
                    <Plus className="h-4 w-4 mr-2" />
                    New Class
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Create class</DialogTitle>
                    <DialogDescription>Define grade and section for a new class.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Class name</Label>
                      <Input
                        value={formState.name}
                        onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Year 6 - A"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Grade level</Label>
                        <Input
                          value={formState.grade_level}
                          onChange={(e) => setFormState((prev) => ({ ...prev, grade_level: e.target.value }))}
                          placeholder="Year 6"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Section</Label>
                        <Input
                          value={formState.section_label}
                          onChange={(e) => setFormState((prev) => ({ ...prev, section_label: e.target.value }))}
                          placeholder="A"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Academic year</Label>
                      <Input
                        value={formState.academic_year}
                        onChange={(e) => setFormState((prev) => ({ ...prev, academic_year: e.target.value }))}
                        placeholder="2025-2026"
                      />
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                        onClick={handleCreateClass}
                      >
                        Create
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl lg:col-span-2">
            <CardHeader>
              <CardTitle>Classes</CardTitle>
              <CardDescription>Select a class to manage membership and subjects.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes.map((item) => (
                    <TableRow key={item.id} className={selectedClass?.id === item.id ? "bg-slate-50" : ""}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.section_label || "No section"}</div>
                      </TableCell>
                      <TableCell>{item.grade_level}</TableCell>
                      <TableCell>{item.academic_year || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.status === "active" ? "default" : "secondary"}>
                            {item.status}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2 text-xs"
                            onClick={() => handleSelectClass(item)}
                          >
                            Manage
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleSelectClass(item)}>
                              Manage
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                handleSelectClass(item)
                                setIsEditOpen(true)
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleArchiveClass(item.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader>
              <CardTitle>Selected Class</CardTitle>
              <CardDescription>
                {selectedClass ? selectedClass.name : "Pick a class to manage details."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/70 p-4">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
                <div>
                  <div className="text-sm font-semibold">{selectedClass?.grade_level || "No grade"}</div>
                  <div className="text-xs text-gray-500">{selectedClass?.academic_year || "Academic year not set"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/70 p-4">
                <Users className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-semibold">{membersByRole.students.length} students</div>
                  <div className="text-xs text-gray-500">{membersByRole.teachers.length} teachers</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/70 p-4">
                <BookOpen className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-sm font-semibold">{classSubjects.length} subjects assigned</div>
                  <div className="text-xs text-gray-500">Linked to this class</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Class Members</CardTitle>
                <CardDescription>Teachers and students assigned to this class.</CardDescription>
              </div>
              <Dialog open={isMembersOpen} onOpenChange={setIsMembersOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={!selectedClass}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add members
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Add members</DialogTitle>
                    <DialogDescription>Select users to add to the class.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button
                        variant={memberRole === "student" ? "default" : "outline"}
                        onClick={() => setMemberRole("student")}
                        className="rounded-xl"
                      >
                        Students
                      </Button>
                      <Button
                        variant={memberRole === "teacher" ? "default" : "outline"}
                        onClick={() => setMemberRole("teacher")}
                        className="rounded-xl"
                      >
                        Teachers
                      </Button>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
                      {roleOptions.map((user) => (
                        <label key={user.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(user.id)}
                            onChange={(event) => {
                              const checked = event.target.checked
                              setSelectedIds((prev) =>
                                checked ? [...prev, user.id] : prev.filter((id) => id !== user.id)
                              )
                            }}
                          />
                          <span>{user.full_name || user.email}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setIsMembersOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                        onClick={handleAddMembers}
                      >
                        Add members
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Teachers</div>
                  <div className="text-2xl font-bold text-gray-900">{membersByRole.teachers.length}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Students</div>
                  <div className="text-2xl font-bold text-gray-900">{membersByRole.students.length}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total</div>
                  <div className="text-2xl font-bold text-gray-900">{members.length}</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const user = userLookup.get(member.user_id)
                      const displayName = user?.full_name || user?.email || member.user_id
                      return (
                        <TableRow key={member.user_id}>
                          <TableCell className="font-medium">{displayName}</TableCell>
                          <TableCell>{selectedClass?.name || "—"}</TableCell>
                          <TableCell className="capitalize">{member.role}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.user_id)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {!members.length && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-gray-500">
                          No members assigned.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Subjects</CardTitle>
                <CardDescription>Assign subjects for this class.</CardDescription>
              </div>
              <Dialog open={isSubjectsOpen} onOpenChange={setIsSubjectsOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl" disabled={!selectedClass}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add subjects
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Add subjects</DialogTitle>
                    <DialogDescription>Select subjects to attach to this class.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3">
                      {subjects.map((subject) => (
                        <label key={subject.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedSubjectIds.includes(subject.id)}
                            onChange={(event) => {
                              const checked = event.target.checked
                              setSelectedSubjectIds((prev) =>
                                checked ? [...prev, subject.id] : prev.filter((id) => id !== subject.id)
                              )
                            }}
                          />
                          <span>{subject.title}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setIsSubjectsOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                        onClick={handleAddSubjects}
                      >
                        Add subjects
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedSubjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm">
                  <span>{subject.title}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveSubject(subject.id)}>
                    Remove
                  </Button>
                </div>
              ))}
              {!selectedSubjects.length && (
                <div className="text-sm text-gray-500">No subjects assigned.</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit class</DialogTitle>
              <DialogDescription>Update class details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Class name</Label>
                <Input
                  value={formState.name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Grade level</Label>
                  <Input
                    value={formState.grade_level}
                    onChange={(e) => setFormState((prev) => ({ ...prev, grade_level: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Input
                    value={formState.section_label}
                    onChange={(e) => setFormState((prev) => ({ ...prev, section_label: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Academic year</Label>
                <Input
                  value={formState.academic_year}
                  onChange={(e) => setFormState((prev) => ({ ...prev, academic_year: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                  onClick={handleEditClass}
                >
                  Save changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
