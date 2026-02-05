"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  Plus, 
  MoreVertical, 
  Trash2, 
  UserCog,
  Mail,
  Clock,
  X
} from "lucide-react"
import { useLabNoteCollaboration, PermissionLevel } from "@/hooks/use-lab-note-collaboration"
import { cn } from "@/lib/utils"

interface CollaboratorsDialogProps {
  labNoteId: string | null
  labNoteTitle?: string
  trigger?: React.ReactNode
}

export function CollaboratorsDialog({ 
  labNoteId, 
  labNoteTitle,
  trigger 
}: CollaboratorsDialogProps) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [permissionLevel, setPermissionLevel] = useState<Exclude<PermissionLevel, 'owner'>>('viewer')
  const [isInviting, setIsInviting] = useState(false)

  const {
    collaborators,
    pendingInvitations,
    isLoading,
    isOwner,
    inviteCollaborator,
    removeCollaborator,
    updatePermission,
    revokeInvitation,
    refreshCollaborators,
  } = useLabNoteCollaboration(labNoteId)

  // Debug logging
  console.log('CollaboratorsDialog - labNoteId:', labNoteId)
  console.log('CollaboratorsDialog - isOwner:', isOwner)
  console.log('CollaboratorsDialog - isLoading:', isLoading)
  console.log('CollaboratorsDialog - collaborators:', collaborators)

  const handleInvite = async () => {
    if (!email.trim()) return
    
    setIsInviting(true)
    const success = await inviteCollaborator(email.trim(), permissionLevel)
    if (success) {
      setEmail("")
      setPermissionLevel('viewer')
    }
    setIsInviting(false)
  }

  const getPermissionBadgeColor = (level: PermissionLevel) => {
    switch (level) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'editor':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'viewer':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getPermissionLabel = (level: PermissionLevel) => {
    switch (level) {
      case 'owner':
        return 'Owner'
      case 'editor':
        return 'Can edit'
      case 'viewer':
        return 'Can view'
      default:
        return level
    }
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Share</span>
            {collaborators.length > 1 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {collaborators.length}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Lab Note
            {isLoading && <span className="text-xs font-normal text-muted-foreground">(Loading...)</span>}
          </DialogTitle>
          <DialogDescription>
            {labNoteTitle ? `Manage access to "${labNoteTitle}"` : 'Invite collaborators to work on this lab note'}
          </DialogDescription>
          {/* Debug info - remove after fixing */}
          <div className="text-xs text-muted-foreground mt-2">
            Status: {isOwner ? 'Owner' : 'Collaborator'} | Note ID: {labNoteId?.slice(0, 8)}...
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Not Owner Warning */}
          {!isOwner && !isLoading && (
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              Only the owner can add collaborators to this lab note.
            </div>
          )}

          {/* Invite Form (only for owner) */}
          {isOwner && (
            <div className="space-y-3">
              <Label>Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="colleague@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleInvite()
                    }
                  }}
                  className="flex-1"
                />
                <Select
                  value={permissionLevel}
                  onValueChange={(v) => setPermissionLevel(v as Exclude<PermissionLevel, 'owner'>)}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Can edit</SelectItem>
                    <SelectItem value="viewer">Can view</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleInvite}
                  disabled={!email.trim() || isInviting}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Editors can modify content. Viewers can only read.
              </p>
            </div>
          )}

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Pending invitations</Label>
              <div className="space-y-2">
                {pendingInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Expires {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn(getPermissionBadgeColor(invitation.permission_level), "text-xs")}
                      >
                        {getPermissionLabel(invitation.permission_level)}
                      </Badge>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => revokeInvitation(invitation.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Collaborator Button for Owner */}
          {isOwner && (
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2"
                onClick={() => {
                  // Scroll to and focus the email input
                  const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
                  if (emailInput) {
                    emailInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    emailInput.focus()
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Add Collaborator
              </Button>
            </div>
          )}

          {/* Collaborators List */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              People with access
            </Label>
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {isLoading ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Loading...
                </div>
              ) : collaborators.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No collaborators yet
                </div>
              ) : (
                collaborators.map((collaborator) => (
                  <div
                    key={collaborator.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {getInitials(collaborator.profile?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {collaborator.profile?.name || 'Unknown User'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {collaborator.profile?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && collaborator.permissionLevel !== 'owner' ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1">
                              <Badge 
                                variant="outline" 
                                className={cn(getPermissionBadgeColor(collaborator.permissionLevel), "text-xs cursor-pointer")}
                              >
                                {getPermissionLabel(collaborator.permissionLevel)}
                              </Badge>
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => updatePermission(collaborator.userId, 'editor')}
                              disabled={collaborator.permissionLevel === 'editor'}
                            >
                              <UserCog className="h-4 w-4 mr-2" />
                              Can edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updatePermission(collaborator.userId, 'viewer')}
                              disabled={collaborator.permissionLevel === 'viewer'}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Can view
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => removeCollaborator(collaborator.userId)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className={cn(getPermissionBadgeColor(collaborator.permissionLevel), "text-xs")}
                        >
                          {getPermissionLabel(collaborator.permissionLevel)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            {isOwner 
              ? "You are the owner of this lab note" 
              : "You have been granted access to this lab note"
            }
          </p>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
