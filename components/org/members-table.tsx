"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { useToast } from "@/hooks/use-toast"

export interface OrgMember {
  id: string
  name: string
  email: string
  roleName: string
  joinedAt: string
}

interface MembersTableProps {
  members: OrgMember[]
  isAdmin: boolean
  onMemberRemoved: (memberId: string) => void
}

function formatJoinDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

export function MembersTable({ members, isAdmin, onMemberRemoved }: MembersTableProps) {
  const { toast } = useToast()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmMember, setConfirmMember] = useState<OrgMember | null>(null)

  async function handleRemove(member: OrgMember) {
    setRemovingId(member.id)
    try {
      const res = await fetch("/api/org/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast({
          title: "Error",
          description: data?.error || "Failed to remove member",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Member removed",
        description: `${member.name} has been removed from the organization.`,
      })
      onMemberRemoved(member.id)
    } catch {
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setRemovingId(null)
      setConfirmMember(null)
    }
  }

  if (members.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No active members found.
      </p>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">{member.name}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>{member.roleName}</TableCell>
              <TableCell>{formatJoinDate(member.joinedAt)}</TableCell>
              {isAdmin && (
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    disabled={removingId === member.id}
                    onClick={() => setConfirmMember(member)}
                    aria-label={`Remove ${member.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!confirmMember}
        onOpenChange={(open) => {
          if (!open) setConfirmMember(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{confirmMember?.name}</span> from
              the organization? They will lose access to all organization
              resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removingId !== null}
              onClick={() => {
                if (confirmMember) handleRemove(confirmMember)
              }}
            >
              {removingId ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
