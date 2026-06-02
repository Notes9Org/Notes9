"use client"

import { useState } from "react"
import { Pencil, Plus, Shield, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/hooks/use-toast"
import { PermissionGrid } from "@/components/org/permission-grid"

export interface OrgRole {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  permissionCount: number
  memberCount: number
}

export interface OrgPermission {
  id: string
  resource: string
  action: string
  description: string | null
}

interface RolesManagerProps {
  roles: OrgRole[]
  permissions: OrgPermission[]
  isAdmin: boolean
  onRolesChanged: () => void
}

export function RolesManager({
  roles,
  permissions,
  isAdmin,
  onRolesChanged,
}: RolesManagerProps) {
  const { toast } = useToast()

  // Dialog state for create/edit
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<OrgRole | null>(null)
  const [roleName, setRoleName] = useState("")
  const [roleNameError, setRoleNameError] = useState("")
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Delete confirmation state
  const [deleteRole, setDeleteRole] = useState<OrgRole | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Existing permission IDs for the role being edited (fetched on edit)
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  function openCreateDialog() {
    setEditingRole(null)
    setRoleName("")
    setRoleNameError("")
    setSelectedPermissionIds([])
    setDialogOpen(true)
  }

  async function openEditDialog(role: OrgRole) {
    setEditingRole(role)
    setRoleName(role.name)
    setRoleNameError("")
    setSelectedPermissionIds([])
    setDialogOpen(true)

    // Fetch current permission IDs for this role
    setLoadingPermissions(true)
    try {
      const res = await fetch(`/api/org/roles?roleId=${role.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.permissionIds) {
          setSelectedPermissionIds(data.permissionIds)
        }
      }
    } catch (err) {
      // Non-fatal: user can still set permissions manually. Surface a warning
      // so a failed load isn't completely invisible, and log for monitoring.
      console.warn("roles-manager: failed to load current permissions", err)
      toast({
        title: "Warning",
        description:
          "Could not load this role's current permissions. You may need to re-select them.",
        variant: "destructive",
      })
    } finally {
      setLoadingPermissions(false)
    }
  }

  async function handleSave() {
    const trimmedName = roleName.trim()
    if (!trimmedName) {
      setRoleNameError("Role name is required")
      return
    }
    // Client-side duplicate-name guard so the user gets immediate feedback
    // instead of waiting for the API 409. Exclude the role being edited.
    const isDuplicate = roles.some(
      (r) =>
        r.id !== editingRole?.id &&
        r.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )
    if (isDuplicate) {
      setRoleNameError("A role with this name already exists")
      return
    }
    if (selectedPermissionIds.length === 0) {
      toast({
        title: "No permissions selected",
        description: "Please select at least one permission for this role.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    setRoleNameError("")

    try {
      const isEditing = !!editingRole
      const method = isEditing ? "PUT" : "POST"
      const body = isEditing
        ? {
            roleId: editingRole!.id,
            name: trimmedName,
            permissionIds: selectedPermissionIds,
          }
        : {
            name: trimmedName,
            permissionIds: selectedPermissionIds,
          }

      const res = await fetch("/api/org/roles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message = data?.error || `Failed to ${isEditing ? "update" : "create"} role`

        if (res.status === 409) {
          setRoleNameError(message)
        } else {
          toast({ title: "Error", description: message, variant: "destructive" })
        }
        return
      }

      toast({
        title: isEditing ? "Role updated" : "Role created",
        description: `"${trimmedName}" has been ${isEditing ? "updated" : "created"} successfully.`,
      })
      setDialogOpen(false)
      onRolesChanged()
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteRole) return
    setIsDeleting(true)

    try {
      const res = await fetch("/api/org/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId: deleteRole.id }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast({
          title: "Error",
          description: data?.error || "Failed to delete role",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Role deleted",
        description: `"${deleteRole.name}" has been removed.`,
      })
      onRolesChanged()
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteRole(null)
    }
  }

  return (
    <>
      <div className="w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Shield className="h-5 w-5" />
              Roles
            </h3>
            <p className="text-sm text-muted-foreground">
              Manage roles and their permissions for your organization.
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={openCreateDialog}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create Role
            </Button>
          )}
        </div>
        {roles.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No roles defined yet.
          </p>
        ) : (
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-center">Permissions</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  {isAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.is_system_role && (
                          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                            System
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-muted-foreground mt-0.5 text-sm">
                          {role.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {role.permissionCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {role.memberCount}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer"
                            disabled={role.is_system_role}
                            onClick={() => openEditDialog(role)}
                            aria-label={`Edit ${role.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer text-destructive hover:text-destructive"
                            disabled={role.is_system_role}
                            onClick={() => setDeleteRole(role)}
                            aria-label={`Delete ${role.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </div>

      {/* Create / Edit Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) setDialogOpen(false) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? "Edit Role" : "Create Role"}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update the role name and permissions."
                : "Define a new role with specific permissions for your team."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="role-name">
                Role Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="role-name"
                placeholder="e.g. Researcher, Lab Technician"
                value={roleName}
                onChange={(e) => {
                  setRoleName(e.target.value)
                  if (roleNameError) setRoleNameError("")
                }}
                aria-invalid={!!roleNameError}
                aria-describedby={roleNameError ? "role-name-error" : "role-name-help"}
                disabled={isSaving}
              />
              {roleNameError ? (
                <p id="role-name-error" className="text-sm text-destructive">
                  {roleNameError}
                </p>
              ) : (
                <span id="role-name-help" className="sr-only">
                  Enter a unique name for this role.
                </span>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Permissions</Label>
              {loadingPermissions ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner className="mr-2" />
                  <span className="text-muted-foreground text-sm">Loading permissions…</span>
                </div>
              ) : (
                <PermissionGrid
                  permissions={permissions}
                  selectedIds={selectedPermissionIds}
                  onChange={setSelectedPermissionIds}
                  disabled={isSaving}
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              className="cursor-pointer"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving && <Spinner className="mr-2" />}
              {isSaving
                ? "Saving..."
                : editingRole
                  ? "Update Role"
                  : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog
        open={!!deleteRole}
        onOpenChange={(open) => { if (!open) setDeleteRole(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the{" "}
              <span className="font-medium">&quot;{deleteRole?.name}&quot;</span>{" "}
              role?
              {deleteRole && deleteRole.memberCount > 0 && (
                <>
                  {" "}
                  This role is currently assigned to{" "}
                  <span className="font-medium">
                    {deleteRole.memberCount} member{deleteRole.memberCount !== 1 ? "s" : ""}
                  </span>
                  . Their role assignment will be removed.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
