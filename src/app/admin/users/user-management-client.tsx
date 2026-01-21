'use client'

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Plus, 
  Search, 
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Users,
  GraduationCap,
  UserCheck,
  UserX,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Upload,
  FileDown,
  FileSpreadsheet,
  CheckCircle2,
  XCircle
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// Form validation schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  mobile: z.string().optional(),
  role: z.enum(['student', 'teacher'], { required_error: 'Please select a role' }),
})

const updateUserSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').optional(),
  mobile: z.string().optional(),
  role: z.enum(['student', 'teacher', 'admin']).optional(),
  education: z.string().optional(),
  graduation_year: z.number().min(1950).max(new Date().getFullYear() + 10).optional(),
  domain: z.string().optional(),
  profession: z.string().optional(),
  location: z.string().optional(),
  current_institute: z.string().optional(),
  onboarding_completed: z.boolean().optional(),
})

type CreateUserData = z.infer<typeof createUserSchema>
type UpdateUserData = z.infer<typeof updateUserSchema>

interface UserProfile {
  id: string
  role: string
  full_name?: string
  mobile?: string
  education?: string
  graduation_year?: number
  domain?: string
  profession?: string
  location?: string
  current_institute?: string
  onboarding_completed?: boolean
}

interface User {
  id: string
  email: string
  created_at: string
  email_confirmed_at?: string
  last_sign_in_at?: string
  profile: UserProfile
}

interface UserStats {
  totalUsers: number
  students: number
  teachers: number
  admins: number
  activeUsers: number
  newUsersThisMonth: number
}

interface BulkImportDetail {
  rowNumber: number
  email: string
  status: 'success' | 'failed'
  error?: string
  userId?: string
  coursesAssigned?: string[]
}

interface BulkImportResult {
  totalRows: number
  successfulImports: number
  failedImports: number
  importDetails: BulkImportDetail[]
  summary: {
    usersCreated: number
    courseAssignmentsCreated: number
    errors: string[]
  }
}

export function UserManagementClient() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<UserStats>({
    totalUsers: 0,
    students: 0,
    teachers: 0,
    admins: 0,
    activeUsers: 0,
    newUsersThisMonth: 0
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'teacher' | 'admin'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null)
  const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null)
  const [bulkImportError, setBulkImportError] = useState<string | null>(null)
  const [isBulkImporting, setIsBulkImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: createErrors, isSubmitting: isCreating },
    reset: resetCreate,
    control: controlCreate
  } = useForm<CreateUserData>({
    resolver: zodResolver(createUserSchema)
  })

  const {
    register: registerUpdate,
    handleSubmit: handleSubmitUpdate,
    formState: { errors: updateErrors, isSubmitting: isUpdating },
    reset: resetUpdate,
    setValue: setUpdateValue,
    control: controlUpdate
  } = useForm<UpdateUserData>({
    resolver: zodResolver(updateUserSchema)
  })

  // Fetch users
  const fetchUsers = async (page = 1, search = '', role = 'all') => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(role !== 'all' && { role })
      })

      const response = await fetch(`/api/admin/users?${params}`)
      if (!response.ok) throw new Error('Failed to fetch users')
      
      const data = await response.json()
      setUsers(data.users)
      setTotalPages(data.totalPages)
    } catch (error) {
      toast.error('Failed to fetch users')
      console.error('Error fetching users:', error)
    }
  }

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats')
      if (!response.ok) throw new Error('Failed to fetch stats')
      
      const data = await response.json()
      setStats(data)
    } catch (error) {
      toast.error('Failed to fetch statistics')
      console.error('Error fetching stats:', error)
    }
  }

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchUsers(currentPage, searchQuery, roleFilter),
        fetchStats()
      ])
      setLoading(false)
    }
    loadData()
  }, [currentPage, searchQuery, roleFilter])

  // Search handler
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
  }

  // Filter handler
  const handleRoleFilter = (role: 'all' | 'student' | 'teacher' | 'admin') => {
    setRoleFilter(role)
    setCurrentPage(1)
  }

  const handleBulkFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setSelectedCsvFile(file ?? null)
    setBulkImportError(null)
  }

  const handleDownloadTemplate = () => {
    const csvTemplate = [
      'name,number,email,password,assigned_course,user_type',
      'John Doe,1234567890,john@example.com,Password123,course-123,student',
      'Jane Doe,5551234,jane@example.com,Password123,"course-456,course-789",teacher',
      'Alice Smith,,alice@example.com,Password123,,admin'
    ].join('\n')

    const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bulk-users-template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleBulkImport = async () => {
    if (!selectedCsvFile) {
      toast.error('Please choose a CSV file before importing')
      return
    }

    const formData = new FormData()
    formData.append('csvFile', selectedCsvFile)

    setIsBulkImporting(true)
    setBulkImportError(null)

    try {
      const response = await fetch('/api/admin/users/bulk-import', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        let message = 'Failed to import users'
        try {
          const errorBody = await response.json()
          message = errorBody?.error || message
        } catch {
          message = await response.text()
        }
        throw new Error(message)
      }

      const data: BulkImportResult = await response.json()
      setBulkImportResult(data)
      setSelectedCsvFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      toast.success(`Imported ${data.successfulImports} of ${data.totalRows} rows`)
      await fetchUsers(currentPage, searchQuery, roleFilter)
      await fetchStats()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process bulk import'
      setBulkImportError(message)
      toast.error(message)
    } finally {
      setIsBulkImporting(false)
    }
  }

  // Create user handler
  const handleCreateUser = async (data: CreateUserData) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast.success('User created successfully')
      setIsCreateDialogOpen(false)
      resetCreate()
      await fetchUsers(currentPage, searchQuery, roleFilter)
      await fetchStats()
    } catch (error) {
      toast.error(`Failed to create user: ${error.message}`)
    }
  }

  // Edit user handler
  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setUpdateValue('full_name', user.profile.full_name || '')
    setUpdateValue('mobile', user.profile.mobile || '')
    setUpdateValue('role', user.profile.role as 'student' | 'teacher' | 'admin')
    setUpdateValue('education', user.profile.education || '')
    setUpdateValue('graduation_year', user.profile.graduation_year || undefined)
    setUpdateValue('domain', user.profile.domain || '')
    setUpdateValue('profession', user.profile.profession || '')
    setUpdateValue('location', user.profile.location || '')
    setUpdateValue('current_institute', user.profile.current_institute || '')
    setUpdateValue('onboarding_completed', user.profile.onboarding_completed || false)
    setIsEditDialogOpen(true)
  }

  // Update user handler
  const handleUpdateUser = async (data: UpdateUserData) => {
    if (!selectedUser) return

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast.success('User updated successfully')
      setIsEditDialogOpen(false)
      setSelectedUser(null)
      resetUpdate()
      await fetchUsers(currentPage, searchQuery, roleFilter)
      await fetchStats()
    } catch (error) {
      toast.error(`Failed to update user: ${error.message}`)
    }
  }

  // Delete user handler
  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.profile.full_name || user.email}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error)
      }

      toast.success('User deleted successfully')
      await fetchUsers(currentPage, searchQuery, roleFilter)
      await fetchStats()
    } catch (error) {
      toast.error(`Failed to delete user: ${error.message}`)
    }
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'destructive'
      case 'teacher': return 'default'
      case 'student': return 'secondary'
      default: return 'outline'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
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
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/80 backdrop-blur-xl shadow-xl">
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--brand))]/10 via-transparent to-[hsl(var(--brand-accent))]/10" />
          <div className="relative p-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  User Management
                </h1>
                <p className="text-gray-600 mt-2">
                  Manage students, teachers, and administrators
                </p>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))] hover:opacity-90">
                    <Plus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new student or teacher to the platform
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmitCreate(handleCreateUser)} className="space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          {...registerCreate('email')} 
                          placeholder="user@example.com"
                        />
                        {createErrors.email && (
                          <p className="text-sm text-red-600">{createErrors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name</Label>
                        <Input 
                          id="full_name" 
                          {...registerCreate('full_name')} 
                          placeholder="John Doe"
                        />
                        {createErrors.full_name && (
                          <p className="text-sm text-red-600">{createErrors.full_name.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mobile">Mobile Number</Label>
                        <Input 
                          id="mobile" 
                          type="tel" 
                          {...registerCreate('mobile')} 
                          placeholder="+1234567890"
                        />
                        {createErrors.mobile && (
                          <p className="text-sm text-red-600">{createErrors.mobile.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
                        <Controller
                          name="role"
                          control={controlCreate}
                          render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="student">Student</SelectItem>
                                <SelectItem value="teacher">Teacher</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {createErrors.role && (
                          <p className="text-sm text-red-600">{createErrors.role.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input 
                          id="password" 
                          type="password" 
                          {...registerCreate('password')} 
                          placeholder="Minimum 6 characters"
                        />
                        {createErrors.password && (
                          <p className="text-sm text-red-600">{createErrors.password.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsCreateDialogOpen(false)}
                        disabled={isCreating}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? 'Creating...' : 'Create User'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                +{stats.newUsersThisMonth} this month
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Students</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.students}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((stats.students / stats.totalUsers) * 100)}% of total
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Teachers</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.teachers}</div>
              <p className="text-xs text-muted-foreground">
                {Math.round((stats.teachers / stats.totalUsers) * 100)}% of total
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Last 30 days
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Import */}
        <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl">Bulk User Import</CardTitle>
              <CardDescription>
                Upload a CSV to create users and assign courses in one step.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <FileDown className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-indigo-100 p-2 text-indigo-700">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">CSV Requirements</p>
                      <p className="text-sm text-gray-500">
                        Ensure the header row matches the format below.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg bg-white/70 p-4 font-mono text-sm text-gray-700">
                    name, number, email, password, assigned_course, user_type
                  </div>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-gray-600">
                    <li>Emails must be unique and valid.</li>
                    <li>Password must be at least 6 characters.</li>
                    <li>
                      Use comma separated course IDs in <code>assigned_course</code>.
                    </li>
                    <li>
                      <code>user_type</code> can be <strong>student</strong>, <strong>teacher</strong>, or <strong>admin</strong>.
                    </li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-gray-700">Sample Rows</p>
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Courses</TableHead>
                          <TableHead>Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          {
                            name: 'John Doe',
                            email: 'john.doe@example.com',
                            course: 'course-123',
                            type: 'student'
                          },
                          {
                            name: 'Jane Smith',
                            email: 'jane.smith@example.com',
                            course: 'course-456,course-789',
                            type: 'teacher'
                          },
                          {
                            name: 'Bob Johnson',
                            email: 'bob.johnson@example.com',
                            course: '',
                            type: 'admin'
                          }
                        ].map((row) => (
                          <TableRow key={row.email}>
                            <TableCell>{row.name}</TableCell>
                            <TableCell className="font-mono text-xs text-gray-600">
                              {row.email}
                            </TableCell>
                            <TableCell className="text-xs text-gray-600">
                              {row.course || '—'}
                            </TableCell>
                            <TableCell className="capitalize">{row.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-6">
                  <Label htmlFor="bulkCsv" className="text-sm font-semibold text-gray-700">
                    Upload CSV
                  </Label>
                  <Input
                    id="bulkCsv"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleBulkFileChange}
                    className="mt-3 bg-white/80"
                  />
                  {selectedCsvFile && (
                    <p className="mt-2 text-sm text-gray-600">
                      Selected: {selectedCsvFile.name} ({(selectedCsvFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  {bulkImportError && (
                    <p className="mt-2 text-sm text-red-600">{bulkImportError}</p>
                  )}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDownloadTemplate}
                      className="flex-1"
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Template
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 bg-gradient-to-r from-[hsl(var(--brand))] to-[hsl(var(--brand-accent))]"
                      onClick={handleBulkImport}
                      disabled={isBulkImporting || !selectedCsvFile}
                    >
                      {isBulkImporting ? (
                        'Importing...'
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload & Import
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {bulkImportResult && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-slate-200 bg-white/70 p-4">
                        <p className="text-sm text-gray-500">Total Rows</p>
                        <p className="text-2xl font-semibold text-gray-800">
                          {bulkImportResult.totalRows}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                        <p className="text-sm text-emerald-700 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Successful
                        </p>
                        <p className="text-2xl font-semibold text-emerald-900">
                          {bulkImportResult.successfulImports}
                        </p>
                      </div>
                      <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
                        <p className="text-sm text-red-700 flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Failed
                        </p>
                        <p className="text-2xl font-semibold text-red-900">
                          {bulkImportResult.failedImports}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-slate-200 bg-white/70 p-4">
                        <p className="text-sm text-gray-500">Users Created</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {bulkImportResult.summary.usersCreated}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white/70 p-4">
                        <p className="text-sm text-gray-500">Course Assignments</p>
                        <p className="text-xl font-semibold text-gray-800">
                          {bulkImportResult.summary.courseAssignmentsCreated}
                        </p>
                      </div>
                    </div>
                    {bulkImportResult.summary.errors.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                          <AlertTriangle className="h-4 w-4" />
                          Review Issues
                        </div>
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900/90">
                          {bulkImportResult.summary.errors.map((error, index) => (
                            <li key={`${error}-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="rounded-xl border border-slate-200 bg-white/80">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <p className="font-semibold text-gray-700">Row Details</p>
                        <Badge variant="outline">
                          {bulkImportResult.importDetails.length} rows processed
                        </Badge>
                      </div>
                      <div className="max-h-64 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Row</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bulkImportResult.importDetails.map((detail) => (
                              <TableRow key={`${detail.rowNumber}-${detail.email}`}>
                                <TableCell className="text-sm font-semibold text-gray-600">
                                  #{detail.rowNumber}
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm font-medium">
                                    {detail.email || 'Unknown'}
                                  </div>
                                  {detail.userId && (
                                    <div className="text-xs text-gray-500 font-mono">
                                      {detail.userId}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      detail.status === 'success' ? 'secondary' : 'destructive'
                                    }
                                  >
                                    {detail.status === 'success' ? 'Success' : 'Failed'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {detail.status === 'success' ? (
                                    <div className="text-xs text-gray-600">
                                      {detail.coursesAssigned?.length
                                        ? `Courses: ${detail.coursesAssigned.join(', ')}`
                                        : 'No courses assigned'}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-red-600">{detail.error}</p>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters and Search */}
        <Card className="border-white/20 bg-white/80 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <Select value={roleFilter} onValueChange={handleRoleFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="student">Students</SelectItem>
                    <SelectItem value="teacher">Teachers</SelectItem>
                    <SelectItem value="admin">Admins</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Education</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {user.profile.full_name || 'No name'}
                        </div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.profile.role)}>
                        {user.profile.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.profile.education || 'Not specified'}
                        {user.profile.graduation_year && (
                          <div className="text-xs text-gray-500">
                            Class of {user.profile.graduation_year}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {user.email_confirmed_at ? (
                          <Badge variant="outline" className="text-green-600">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-yellow-600">
                            Pending
                          </Badge>
                        )}
                        {user.profile.onboarding_completed && (
                          <Badge variant="outline" className="text-blue-600">
                            Onboarded
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {formatDate(user.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteUser(user)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                
                <span className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and profile details
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <form onSubmit={handleSubmitUpdate(handleUpdateUser)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_full_name">Full Name</Label>
                    <Input 
                      id="edit_full_name" 
                      {...registerUpdate('full_name')} 
                      placeholder="John Doe"
                    />
                    {updateErrors.full_name && (
                      <p className="text-sm text-red-600">{updateErrors.full_name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_role">Role</Label>
                    <Controller
                      name="role"
                      control={controlUpdate}
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {updateErrors.role && (
                      <p className="text-sm text-red-600">{updateErrors.role.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_education">Education</Label>
                    <Input 
                      id="edit_education" 
                      {...registerUpdate('education')} 
                      placeholder="Bachelor's, Master's, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_graduation_year">Graduation Year</Label>
                    <Input 
                      id="edit_graduation_year" 
                      type="number" 
                      {...registerUpdate('graduation_year', { valueAsNumber: true })} 
                      placeholder="2024"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_domain">Domain</Label>
                    <Input 
                      id="edit_domain" 
                      {...registerUpdate('domain')} 
                      placeholder="Computer Science, Business, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_profession">Profession</Label>
                    <Input 
                      id="edit_profession" 
                      {...registerUpdate('profession')} 
                      placeholder="Software Engineer, Teacher, etc."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_location">Location</Label>
                    <Input 
                      id="edit_location" 
                      {...registerUpdate('location')} 
                      placeholder="City, Country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_current_institute">Current Institute</Label>
                    <Input 
                      id="edit_current_institute" 
                      {...registerUpdate('current_institute')} 
                      placeholder="University or Organization"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditDialogOpen(false)
                      setSelectedUser(null)
                    }}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUpdating}>
                    {isUpdating ? 'Updating...' : 'Update User'}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
