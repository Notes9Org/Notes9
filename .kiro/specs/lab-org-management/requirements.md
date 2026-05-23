# Requirements Document

## Introduction

This specification defines the Lab/Organization Management feature for Notes9. The feature enables users to create and manage research lab organizations, define custom roles with granular permissions, invite team members via email, and administer their organization through a dedicated dashboard. The design must extend the existing Supabase schema in a generic, extensible way while preserving backward compatibility with the current `profiles.role` CHECK constraint and existing RLS policies.

## Glossary

- **Dashboard**: The authenticated home page at `/dashboard` showing the user's lab overview, quick actions, and recent activity
- **Org_Setup_Flow**: The multi-step form flow triggered by the "Use Notes9 for my lab" action, collecting lab details and creating the organization
- **Organization**: A research lab or institution entity stored in the `organizations` table, extended with type and description metadata
- **Admin**: The user who created the organization; has full control over organization settings, roles, and membership
- **Role**: A named set of permissions scoped to an organization, stored in a dedicated `org_roles` table
- **Permission**: A granular access right (e.g., `projects.create`, `experiments.delete`) assignable to a Role
- **Member**: A user who belongs to an organization with an assigned Role, tracked via an `org_members` join table
- **Invitation**: A record representing a pending email invite to join an organization for a specific Role
- **Invitation_Email**: A transactional email sent via Resend containing a unique link for the invitee to accept and join the organization
- **Org_Dashboard**: The admin-facing organization management page showing members, roles, pending invitations, and organization settings
- **Resend_Service**: The existing Resend SDK integration (`lib/resend.ts`) used to send transactional emails
- **RLS_Policy**: A Supabase Row Level Security policy controlling data access at the database level

---

## Requirements

### Requirement 1: Organization Setup Entry Point

**User Story:** As an authenticated user without an organization, I want to see a clear call-to-action on the Dashboard to set up my lab, so that I can begin managing my research team on Notes9.

#### Acceptance Criteria

1. WHILE the authenticated user has no `organization_id` in the `profiles` table, THE Dashboard SHALL display a "Use Notes9 for my lab" call-to-action card in a prominent position above the Quick Actions section.
2. WHEN the user has an existing `organization_id` in the `profiles` table, THE Dashboard SHALL hide the organization setup call-to-action card.
3. WHEN the user clicks the "Use Notes9 for my lab" call-to-action, THE Dashboard SHALL navigate the user to the Org_Setup_Flow page.

---

### Requirement 2: Organization Creation Flow

**User Story:** As an authenticated user, I want to provide my lab details through a guided setup flow, so that my organization is created and I become its admin.

#### Acceptance Criteria

1. THE Org_Setup_Flow SHALL collect the following required fields: organization name.
2. THE Org_Setup_Flow SHALL collect the following optional fields: organization type (e.g., academic, industry, government, independent), description, address, phone, and email.
3. WHEN the user submits the Org_Setup_Flow form with valid data, THE Org_Setup_Flow SHALL create a new record in the `organizations` table with the provided details.
4. WHEN the organization record is created successfully, THE Org_Setup_Flow SHALL update the user's `profiles.organization_id` to reference the new organization.
5. WHEN the organization record is created successfully, THE Org_Setup_Flow SHALL create a default "Admin" role in the `org_roles` table with all permissions enabled for the new organization.
6. WHEN the organization record is created successfully, THE Org_Setup_Flow SHALL insert an `org_members` record linking the user to the new organization with the "Admin" role.
7. WHEN the organization is created and the user is assigned as admin, THE Org_Setup_Flow SHALL redirect the user to the Org_Dashboard page.
8. IF the organization creation fails due to a database error, THEN THE Org_Setup_Flow SHALL display an error message describing the failure and allow the user to retry.
9. THE Org_Setup_Flow SHALL validate that the organization name is between 2 and 100 characters before submission.

---

### Requirement 3: Custom Role Management

**User Story:** As an organization admin, I want to create, edit, and delete custom roles with configurable permissions, so that I can control what each team member can access.

#### Acceptance Criteria

1. THE Org_Dashboard SHALL display a "Roles" section listing all roles defined for the organization, including the default "Admin" role.
2. WHEN the admin clicks "Create Role", THE Org_Dashboard SHALL display a form to enter a role name and select permissions from the available permission set.
3. THE Org_Dashboard SHALL present permissions grouped by resource category (e.g., Projects, Experiments, Samples, Equipment, Protocols, Lab Notes, Reports).
4. WHEN the admin submits a new role with a valid name and at least one permission, THE Org_Dashboard SHALL create a new record in the `org_roles` table and associated records in the `org_role_permissions` table.
5. WHEN the admin edits an existing custom role, THE Org_Dashboard SHALL update the role name and permission assignments in the database.
6. IF the admin attempts to delete a role that is currently assigned to one or more members, THEN THE Org_Dashboard SHALL display a warning indicating the number of affected members and require confirmation before proceeding.
7. THE Org_Dashboard SHALL prevent deletion or modification of the default "Admin" role.
8. THE Org_Dashboard SHALL validate that role names are unique within the organization.
9. WHEN a role is deleted after confirmation, THE Org_Dashboard SHALL remove the role and its permission assignments from the database.

---

### Requirement 4: Member Invitation

**User Story:** As an organization admin, I want to invite users to my lab by email with a specific role, so that they can join and collaborate with the appropriate access level.

#### Acceptance Criteria

1. THE Org_Dashboard SHALL display an "Invite Member" action that opens an invitation form.
2. THE invitation form SHALL collect one or more email addresses and a single role selection from the organization's defined roles.
3. WHEN the admin submits the invitation form with valid email addresses and a selected role, THE Org_Dashboard SHALL create one `org_invitations` record per email address with status "pending".
4. WHEN an invitation record is created, THE Resend_Service SHALL send an Invitation_Email to each email address containing the organization name, the assigned role name, and a unique invitation acceptance link.
5. IF the Resend_Service fails to send an email, THEN THE Org_Dashboard SHALL mark the corresponding invitation record as "failed" and display an error message to the admin.
6. THE Org_Dashboard SHALL prevent sending duplicate invitations to the same email address for the same organization while a "pending" invitation exists.
7. THE invitation acceptance link SHALL contain a cryptographically secure token that uniquely identifies the invitation.
8. WHEN the admin views the Org_Dashboard, THE Org_Dashboard SHALL display a list of pending invitations with email, role, sent date, and status.
9. WHEN the admin clicks "Revoke" on a pending invitation, THE Org_Dashboard SHALL update the invitation status to "revoked" and the acceptance link SHALL become invalid.

---

### Requirement 5: Invitation Acceptance

**User Story:** As an invited user, I want to click the invitation link and join the organization with my assigned role, so that I can start collaborating in the lab.

#### Acceptance Criteria

1. WHEN an invited user clicks the invitation acceptance link, THE System SHALL navigate the user to an invitation acceptance page.
2. WHILE the invitation token is valid and the invitation status is "pending", THE invitation acceptance page SHALL display the organization name and the assigned role.
3. IF the invitation token is invalid, expired, or the invitation status is not "pending", THEN THE invitation acceptance page SHALL display an error message indicating the invitation is no longer valid.
4. WHEN an unauthenticated user visits the invitation acceptance page, THE System SHALL redirect the user to the sign-up page with the invitation token preserved as a query parameter.
5. WHEN the user completes sign-up or login with a preserved invitation token, THE System SHALL redirect the user back to the invitation acceptance page.
6. WHEN the user confirms acceptance of a valid invitation, THE System SHALL update the user's `profiles.organization_id` to the invitation's organization, create an `org_members` record with the assigned role, and update the invitation status to "accepted".
7. IF the user already belongs to a different organization, THEN THE invitation acceptance page SHALL display a message indicating the user must leave the current organization before accepting.
8. WHEN the invitation is accepted successfully, THE System SHALL redirect the user to the Dashboard.

---

### Requirement 6: Organization Dashboard

**User Story:** As an organization admin, I want a dedicated dashboard to manage my lab's members, roles, invitations, and settings, so that I have a centralized place for organization administration.

#### Acceptance Criteria

1. THE Org_Dashboard SHALL be accessible at the route `/settings/organization` within the authenticated app layout.
2. THE Org_Dashboard SHALL display the organization name, type, and member count in a summary header.
3. THE Org_Dashboard SHALL display a "Members" tab listing all active members with their name, email, role, and join date.
4. THE Org_Dashboard SHALL display a "Roles" tab listing all defined roles with their permission count and member count.
5. THE Org_Dashboard SHALL display an "Invitations" tab listing all invitations with their email, role, status, and sent date.
6. THE Org_Dashboard SHALL display a "Settings" tab allowing the admin to edit the organization name, type, description, address, phone, and email.
7. WHEN the admin updates organization settings and clicks save, THE Org_Dashboard SHALL update the `organizations` table record and display a success confirmation.
8. WHILE the user does not have the "Admin" role for the organization, THE Org_Dashboard SHALL hide administrative actions (invite, create role, edit settings, remove member).
9. WHEN the admin clicks "Remove" on a member, THE Org_Dashboard SHALL set the member's `org_members` record to inactive, clear the member's `profiles.organization_id`, and display a confirmation.

---

### Requirement 7: Database Schema Design

**User Story:** As a developer, I want a generic and extensible database schema for organization roles and permissions, so that the access control system can evolve without schema-breaking changes.

#### Acceptance Criteria

1. THE database migration SHALL create an `org_roles` table with columns: `id` (UUID, PK), `organization_id` (UUID, FK to organizations), `name` (TEXT, NOT NULL), `description` (TEXT), `is_system_role` (BOOLEAN, default false), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ), with a UNIQUE constraint on (`organization_id`, `name`).
2. THE database migration SHALL create an `org_permissions` table with columns: `id` (UUID, PK), `resource` (TEXT, NOT NULL), `action` (TEXT, NOT NULL), `description` (TEXT), with a UNIQUE constraint on (`resource`, `action`).
3. THE database migration SHALL create an `org_role_permissions` join table with columns: `id` (UUID, PK), `role_id` (UUID, FK to org_roles), `permission_id` (UUID, FK to org_permissions), with a UNIQUE constraint on (`role_id`, `permission_id`).
4. THE database migration SHALL create an `org_members` table with columns: `id` (UUID, PK), `organization_id` (UUID, FK to organizations), `user_id` (UUID, FK to profiles), `role_id` (UUID, FK to org_roles), `is_active` (BOOLEAN, default true), `joined_at` (TIMESTAMPTZ), with a UNIQUE constraint on (`organization_id`, `user_id`).
5. THE database migration SHALL create an `org_invitations` table with columns: `id` (UUID, PK), `organization_id` (UUID, FK to organizations), `email` (TEXT, NOT NULL), `role_id` (UUID, FK to org_roles), `token` (TEXT, UNIQUE, NOT NULL), `status` (TEXT, CHECK: pending/accepted/revoked/expired), `invited_by` (UUID, FK to profiles), `created_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ).
6. THE database migration SHALL seed the `org_permissions` table with a standard set of permissions covering resources: projects, experiments, samples, equipment, protocols, lab_notes, reports; and actions: view, create, edit, delete.
7. THE database migration SHALL add `type` (TEXT) and `description` (TEXT) columns to the existing `organizations` table.
8. THE database migration SHALL create RLS_Policies on all new tables ensuring that organization members can only access data belonging to their own organization.
9. THE database migration SHALL create indexes on foreign key columns (`organization_id`, `user_id`, `role_id`) for all new tables.

---

### Requirement 8: Email Delivery

**User Story:** As a system operator, I want invitation emails to be sent reliably via the existing Resend integration, so that invited users receive their join links.

#### Acceptance Criteria

1. THE Invitation_Email SHALL be sent from a verified sender address configured via the `RESEND_FROM_EMAIL` environment variable.
2. THE Invitation_Email SHALL contain the organization name, the role the user is invited for, and a call-to-action button linking to the invitation acceptance page.
3. THE Invitation_Email SHALL use a responsive HTML template that renders correctly in major email clients.
4. WHEN the `RESEND_API_KEY` environment variable is missing at runtime, THE System SHALL log an error and return a descriptive failure response to the caller without crashing.
5. THE invitation acceptance link in the email SHALL follow the format: `{APP_BASE_URL}/auth/invite?token={invitation_token}`.

---

### Requirement 9: Row-Level Security Policies

**User Story:** As a developer, I want RLS policies that enforce organization-scoped data access using the new roles and permissions system, so that data isolation between organizations is guaranteed at the database level.

#### Acceptance Criteria

1. THE RLS_Policy for `org_roles` SHALL allow SELECT for authenticated users who are active members of the same organization.
2. THE RLS_Policy for `org_roles` SHALL allow INSERT, UPDATE, DELETE only for users who hold the "Admin" role in the same organization.
3. THE RLS_Policy for `org_members` SHALL allow SELECT for authenticated users who are active members of the same organization.
4. THE RLS_Policy for `org_members` SHALL allow INSERT and DELETE only for users who hold the "Admin" role in the same organization.
5. THE RLS_Policy for `org_invitations` SHALL allow SELECT for users who hold the "Admin" role in the same organization.
6. THE RLS_Policy for `org_invitations` SHALL allow INSERT only for users who hold the "Admin" role in the same organization.
7. THE RLS_Policy for `org_invitations` SHALL allow UPDATE (for acceptance) for any authenticated user whose email matches the invitation email.
8. THE RLS_Policy for `org_role_permissions` SHALL allow SELECT for authenticated users who are active members of the same organization (via the role's organization_id).
9. THE RLS_Policy for `org_role_permissions` SHALL allow INSERT and DELETE only for users who hold the "Admin" role in the same organization.
