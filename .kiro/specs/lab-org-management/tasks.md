# Implementation Plan: Lab/Organization Management

## Overview

Incremental implementation of the organization management system for Notes9. Tasks are ordered: database migration → utility functions → API routes → Edge Function → UI components/pages → auth flow modifications → property-based tests → unit tests. Each task builds on the previous, ensuring no orphaned code.

## Tasks

- [x] 1. Database migration and schema setup
  - [x] 1.1 Create the Supabase migration file `supabase/migrations/20260520_org_management.sql`
    - Add `type` (TEXT) and `description` (TEXT) columns to the existing `organizations` table
    - Create `org_permissions` table with UNIQUE constraint on (`resource`, `action`) and seed 28 permission rows (7 resources × 4 actions)
    - Create `org_roles` table with UNIQUE constraint on (`organization_id`, `name`), `is_system_role` BOOLEAN default false, and `updated_at` trigger
    - Create `org_role_permissions` join table with UNIQUE constraint on (`role_id`, `permission_id`)
    - Create `org_members` table with UNIQUE constraint on (`organization_id`, `user_id`), `is_active` BOOLEAN default true
    - Create `org_invitations` table with status CHECK (pending, sent, accepted, revoked, expired, failed), unique `token`, and `expires_at`
    - Create indexes on all FK columns (`organization_id`, `user_id`, `role_id`, `permission_id`, `invited_by`)
    - Create RLS policies for all new tables per Requirements 9.1–9.9
    - Apply `update_updated_at_column()` trigger to `org_roles`
    - Add a data migration to create `org_members` records for existing users who already have `organization_id` set (OAuth users)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 9.1–9.9_

- [x] 2. Utility functions (shared logic)
  - [x] 2.1 Create `lib/org/permissions.ts`
    - Export `RESOURCES` and `ACTIONS` const arrays
    - Export `Resource`, `Action`, `PermissionKey` types
    - Implement `hasPermission(userPermissions, resource, action)` function
    - Implement `isOrgAdmin(orgMembers, userId)` function
    - _Requirements: 3.3, 6.8_

  - [x] 2.2 Create `lib/org/invitation.ts`
    - Implement `generateInvitationToken()` using `crypto.randomBytes(32).toString("hex")` (64 hex chars)
    - Implement `buildInvitationUrl(token)` using `NEXT_PUBLIC_APP_URL` env var
    - _Requirements: 4.7, 8.5_

- [x] 3. Checkpoint - Ensure foundation is solid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. API routes (backend)
  - [x] 4.1 Create `app/api/org/create/route.ts`
    - POST handler with zod validation (name 2–100 chars, optional type/description/address/phone/email)
    - Use `SUPABASE_SERVICE_ROLE_KEY` for multi-table transaction: create org → update `profiles.organization_id` → create Admin role with `is_system_role=true` → link all 28 permissions → create `org_members` record
    - Return `{ organization, role, member }` on success
    - Handle validation errors (400), DB errors (500)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9_

  - [x] 4.2 Create `app/api/org/invite/route.ts`
    - POST handler with zod validation (emails array, roleId UUID)
    - Check for duplicate pending invitations per email per org (409)
    - Generate secure token per email via `generateInvitationToken()`
    - Insert `org_invitations` records with status "pending" and `expires_at` = NOW() + 7 days
    - Return `{ invitations }` with status "pending" (email sent async by Edge Function)
    - _Requirements: 4.2, 4.3, 4.6, 4.7_

  - [x] 4.3 Create `app/api/org/invite/accept/route.ts`
    - POST handler with zod validation (token string)
    - Look up invitation by token, verify status is "pending" and not expired
    - Reject if user already has a different `organization_id` (409)
    - Transaction: update `profiles.organization_id` → create `org_members` record → update invitation status to "accepted"
    - Return `{ organizationId, roleName }` on success
    - _Requirements: 5.3, 5.6, 5.7_

  - [x] 4.4 Create `app/api/org/roles/route.ts`
    - POST: create role with name + permissionIds, validate unique name within org
    - PUT: update role name and/or permissionIds, reject if `is_system_role` is true
    - DELETE: delete role, reject if `is_system_role` is true, warn if assigned to members
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 4.5 Create `app/api/org/members/route.ts`
    - DELETE handler to deactivate a member: set `org_members.is_active = false` and `profiles.organization_id = null`
    - Verify requester is admin, prevent removing the last admin
    - _Requirements: 6.9_

- [x] 5. Checkpoint - Verify API routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Supabase Edge Function for async email
  - [x] 6.1 Create `supabase/functions/send-invitation-email/index.ts`
    - Deno-based Edge Function triggered by Database Webhook on `org_invitations` INSERT
    - Skip non-pending invitations
    - Fetch org name, role name, inviter name from DB
    - Send email via Resend REST API with responsive HTML template containing org name, role name, and acceptance URL
    - Update invitation status to "sent" on success, "failed" on error
    - Handle missing `RESEND_API_KEY` gracefully (log error, set status "failed")
    - _Requirements: 4.4, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 7. UI components
  - [x] 7.1 Create `components/org/org-setup-cta.tsx`
    - Card component with "Use Notes9 for my lab" heading and link to `/org/setup`
    - Accepts `visible` prop (boolean) to conditionally render
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 7.2 Create `components/org/org-setup-form.tsx`
    - Client component with zod-validated form: org name (required, 2–100 chars), type select, description textarea, address, phone, email
    - Calls `POST /api/org/create` on submit, shows loading state, handles errors with toast
    - Redirects to `/settings/organization` on success
    - _Requirements: 2.1, 2.2, 2.7, 2.8, 2.9_

  - [x] 7.3 Create `components/org/members-table.tsx`
    - Table displaying active members: name, email, role, join date
    - "Remove" button visible only to admins, calls `DELETE /api/org/members`
    - _Requirements: 6.3, 6.9_

  - [x] 7.4 Create `components/org/roles-manager.tsx`
    - List of roles with permission count and member count
    - "Create Role" button opens dialog, "Edit" and "Delete" actions on custom roles
    - System role ("Admin") shows as non-editable/non-deletable
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

  - [x] 7.5 Create `components/org/permission-grid.tsx`
    - Checkbox grid: rows = resources (7), columns = actions (4)
    - Used inside role create/edit dialog
    - _Requirements: 3.3_

  - [x] 7.6 Create `components/org/invitations-table.tsx`
    - Table of invitations: email, role, status, sent date
    - "Revoke" button for pending/sent invitations, calls `PUT` to update status
    - _Requirements: 4.8, 4.9_

  - [x] 7.7 Create `components/org/invite-dialog.tsx`
    - Dialog with email input (supports multiple), role select dropdown
    - Calls `POST /api/org/invite` on submit
    - _Requirements: 4.1, 4.2_

  - [x] 7.8 Create `components/org/org-settings-form.tsx`
    - Form to edit org name, type, description, address, phone, email
    - Calls Supabase update on `organizations` table, shows success toast
    - _Requirements: 6.6, 6.7_

- [x] 8. Pages
  - [x] 8.1 Modify `app/(app)/dashboard/page.tsx` to add OrgSetupCTA
    - Fetch `profile.organization_id` (already fetched)
    - Render `<OrgSetupCTA visible={!profile?.organization_id} />` above Quick Actions card
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.2 Create `app/(app)/org/setup/page.tsx`
    - Client component page wrapping `<OrgSetupForm />`
    - _Requirements: 2.1, 2.7_

  - [x] 8.3 Create `app/(app)/settings/organization/page.tsx`
    - Client component with Tabs: Members, Roles, Invitations, Settings
    - Fetch org data, members, roles, invitations from Supabase
    - Show org name, type, member count in header
    - Conditionally show admin actions based on `isOrgAdmin()` check
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 8.4 Create `app/auth/invite/page.tsx`
    - Client component: reads `token` from query params
    - Fetches invitation details, displays org name and role
    - If unauthenticated, redirects to sign-up with `?token=` preserved
    - "Accept" button calls `POST /api/org/invite/accept`
    - Shows error states for invalid/expired/revoked tokens and existing org conflict
    - Redirects to `/dashboard` on success
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8_

- [x] 9. Checkpoint - Verify UI and pages render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Auth flow modifications for invitation tokens
  - [x] 10.1 Modify `app/auth/sign-up/page.tsx` to preserve invitation token
    - Read `?token=` from URL search params
    - Pass token through OAuth redirect URL and email redirect URL
    - _Requirements: 5.4, 5.5_

  - [x] 10.2 Modify `app/auth/callback/route.ts` to handle invitation redirect
    - After successful auth, check for `?token=` param
    - If token present, redirect to `/auth/invite?token={token}` instead of `/dashboard`
    - _Requirements: 5.5_

  - [x] 10.3 Modify `app/auth/login` page to preserve invitation token
    - Read `?token=` from URL search params and pass through auth flow
    - _Requirements: 5.4, 5.5_

  - [x] 10.4 Update `lib/supabase/middleware.ts` to allow `/auth/invite` as a public route
    - Add `/auth/invite` to the public routes array so unauthenticated users can view the invite page before being redirected to sign-up
    - _Requirements: 5.1, 5.4_

- [x] 11. Checkpoint - Full integration check
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Property-based tests
  - [x] 12.1 Write property test: CTA visibility is determined by organization_id presence
    - **Property 1: CTA visibility is determined by organization_id presence**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 12.2 Write property test: Organization creation transaction integrity
    - **Property 2: Organization creation transaction integrity**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6**

  - [x] 12.3 Write property test: Organization name validation
    - **Property 3: Organization name validation**
    - **Validates: Requirements 2.9**

  - [x] 12.4 Write property test: Permission grouping by resource
    - **Property 4: Permission grouping by resource**
    - **Validates: Requirements 3.3**

  - [x] 12.5 Write property test: Role creation produces correct records
    - **Property 5: Role creation produces correct records**
    - **Validates: Requirements 3.4, 3.5**

  - [x] 12.6 Write property test: System role protection
    - **Property 6: System role protection**
    - **Validates: Requirements 3.7**

  - [x] 12.7 Write property test: Role name uniqueness within organization
    - **Property 7: Role name uniqueness within organization**
    - **Validates: Requirements 3.8**

  - [x] 12.8 Write property test: Invitation creation per email
    - **Property 8: Invitation creation per email**
    - **Validates: Requirements 4.3**

  - [x] 12.9 Write property test: Duplicate invitation prevention
    - **Property 9: Duplicate invitation prevention**
    - **Validates: Requirements 4.6**

  - [x] 12.10 Write property test: Invitation token security and URL format
    - **Property 10: Invitation token security and URL format**
    - **Validates: Requirements 4.7, 8.5**

  - [x] 12.11 Write property test: Invitation revocation invalidates acceptance
    - **Property 11: Invitation revocation invalidates acceptance**
    - **Validates: Requirements 4.9**

  - [x] 12.12 Write property test: Valid invitation displays correct info
    - **Property 12: Valid invitation displays correct info**
    - **Validates: Requirements 5.2**

  - [x] 12.13 Write property test: Invitation acceptance transaction integrity
    - **Property 13: Invitation acceptance transaction integrity**
    - **Validates: Requirements 5.6**

  - [x] 12.14 Write property test: Existing organization blocks invitation acceptance
    - **Property 14: Existing organization blocks invitation acceptance**
    - **Validates: Requirements 5.7**

  - [x] 12.15 Write property test: Admin-only actions visibility
    - **Property 15: Admin-only actions visibility**
    - **Validates: Requirements 6.8**

  - [x] 12.16 Write property test: Member removal deactivates and clears org
    - **Property 16: Member removal deactivates and clears org**
    - **Validates: Requirements 6.9**

  - [x] 12.17 Write property test: RLS organization data isolation (SELECT)
    - **Property 17: RLS organization data isolation (SELECT)**
    - **Validates: Requirements 7.8, 9.1, 9.3, 9.8**

  - [x] 12.18 Write property test: RLS admin-only write access
    - **Property 18: RLS admin-only write access**
    - **Validates: Requirements 9.2, 9.4, 9.6, 9.9**

  - [x] 12.19 Write property test: RLS invitation acceptance by email match
    - **Property 19: RLS invitation acceptance by email match**
    - **Validates: Requirements 9.7**

  - [x] 12.20 Write property test: Invitation email contains required content
    - **Property 20: Invitation email contains required content**
    - **Validates: Requirements 4.4, 8.2**

- [x] 13. Unit tests
  - [x] 13.1 Write unit tests for org name validation edge cases
    - Test empty string, 1-char, 2-char, 100-char, 101-char, whitespace-only names
    - _Requirements: 2.9_

  - [x] 13.2 Write unit tests for invitation token generation and URL building
    - Test token length (64 hex chars), URL format, missing env var fallback
    - _Requirements: 4.7, 8.5_

  - [x] 13.3 Write unit tests for permission utility functions
    - Test `hasPermission` with matching/non-matching keys, `isOrgAdmin` with admin/non-admin members
    - _Requirements: 3.3, 6.8_

  - [x] 13.4 Write unit tests for API route error conditions
    - Test invalid request bodies, duplicate role names (409), system role deletion (403), duplicate invitations (409), invalid tokens (400), existing org conflict (409)
    - _Requirements: 2.8, 3.7, 3.8, 4.6, 5.3, 5.7_

  - [x] 13.5 Write unit tests for Edge Function email template
    - Test `buildInvitationEmailHtml` output contains org name, role name, invite URL
    - Test function skips non-pending records, updates status to "sent"/"failed"
    - _Requirements: 4.4, 8.2, 8.4_

  - [x] 13.6 Write unit tests for auth flow token preservation
    - Test sign-up page preserves `?token=` param, callback redirects to invite page when token present
    - _Requirements: 5.4, 5.5_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests go in `__tests__/properties/lab-org-management.property.test.ts`
- Unit tests go in `__tests__/unit/lab-org-management.test.ts`
- Edge Function tests go in `supabase/functions/send-invitation-email/index.test.ts`
- The Database Webhook for `org_invitations` INSERT → Edge Function must be configured via Supabase Dashboard or CLI after deploying the Edge Function
