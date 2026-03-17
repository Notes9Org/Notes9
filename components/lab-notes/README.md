# Lab Note Collaboration Feature

This feature enables users to invite collaborators to work on lab notes together.

## Features

- **Invite by Email**: Lab note owners can invite collaborators by email
- **Permission Levels**: 
  - `editor` - Can modify content
  - `viewer` - Read-only access
- **Pending Invitations**: View and manage pending invitations
- **Accept/Decline**: Invited users can accept or decline invitations
- **Remove Collaborators**: Owners can remove collaborators at any time

## Components

### `collaborators-dialog.tsx`
Main dialog for managing collaborators. Shows:
- Current collaborators with their permission levels
- Pending invitations
- Form to invite new collaborators (owner only)

### `pending-invitations.tsx`
Card component that displays pending invitations for the current user on the lab notes page.

## Hooks

### `use-lab-note-collaboration.ts`
Main hook for managing collaboration:
- `inviteCollaborator(email, permissionLevel)` - Send an invitation
- `removeCollaborator(userId)` - Remove a collaborator
- `updatePermission(userId, permissionLevel)` - Change permission level
- `revokeInvitation(invitationId)` - Cancel a pending invitation

### `use-pending-invitations.ts`
Hook for fetching and managing pending invitations for the current user.

## API Routes

### `POST /api/lab-notes/invite`
Create a new invitation.
```json
{
  "labNoteId": "uuid",
  "email": "user@example.com",
  "permissionLevel": "editor" | "viewer"
}
```

### `GET /api/lab-notes/invite?labNoteId=uuid`
Get pending invitations for a lab note (owner only).

### `DELETE /api/lab-notes/invite?invitationId=uuid`
Revoke an invitation (owner only).

### `POST /api/lab-notes/accept-invite`
Accept an invitation.
```json
{ "token": "invitation-token" }
```

### `GET /api/lab-notes/accept-invite?token=xxx`
Validate an invitation token.

### `GET /api/lab-notes/collaborators?labNoteId=uuid`
Get all collaborators for a lab note.

### `DELETE /api/lab-notes/collaborators?labNoteId=uuid&userId=uuid`
Remove a collaborator (owner only).

### `PATCH /api/lab-notes/collaborators`
Update a collaborator's permission level.
```json
{
  "labNoteId": "uuid",
  "userId": "uuid",
  "permissionLevel": "editor" | "viewer"
}
```

## Database Schema

### `lab_note_access`
Stores active collaborator permissions.
- `lab_note_id` - Reference to lab note
- `user_id` - Reference to user
- `permission_level` - owner/editor/viewer
- `granted_by` - Who granted the permission

### `lab_note_invitations`
Stores pending invitations.
- `lab_note_id` - Reference to lab note
- `email` - Invited email address
- `permission_level` - editor/viewer
- `token` - Unique invitation token
- `status` - pending/accepted/expired/revoked
- `expires_at` - Expiration timestamp

### Functions

#### `accept_lab_note_invitation(p_token TEXT)`
Accepts an invitation and adds the user to `lab_note_access`.

#### `get_lab_note_permission(p_lab_note_id UUID, p_user_id UUID)`
Returns the permission level for a user on a lab note.

## Flow

1. **Invite**: Owner clicks "Share" → enters email → selects permission → sends invite
2. **Notification**: Invitee sees pending invitation on lab notes page
3. **Accept**: Invitee clicks "Accept" → added to `lab_note_access`
4. **Collaborate**: Both users can now edit the lab note (if editor permission)
5. **Manage**: Owner can change permissions or remove collaborators anytime

## Security

- Only owners can invite collaborators
- Invitations expire after 7 days
- Users can only accept invitations sent to their email
- RLS policies enforce access control at database level
