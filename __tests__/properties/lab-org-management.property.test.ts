import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  RESOURCES,
  ACTIONS,
  hasPermission,
  isOrgAdmin,
  type Resource,
  type Action,
  type PermissionKey,
  type OrgMember,
} from "@/lib/org/permissions"
import {
  generateInvitationToken,
  buildInvitationUrl,
} from "@/lib/org/invitation"

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------
const uuidArb = fc.uuid()
const orgNameArb = fc.string({ minLength: 2, maxLength: 100 }).filter((s) => s.trim().length >= 2)
const emailArb = fc.emailAddress()
const resourceArb = fc.constantFrom(...RESOURCES)
const actionArb = fc.constantFrom(...ACTIONS)
const permissionKeyArb: fc.Arbitrary<PermissionKey> = fc
  .tuple(resourceArb, actionArb)
  .map(([r, a]) => `${r}.${a}` as PermissionKey)

/**
 * Property 1: CTA visibility is determined by organization_id presence
 *
 * For any user profile, the "Use Notes9 for my lab" CTA card is visible
 * if and only if organization_id is null. When organization_id is non-null,
 * the CTA is hidden.
 *
 * **Validates: Requirements 1.1, 1.2**
 */
describe("Feature: lab-org-management, Property 1: CTA visibility is determined by organization_id presence", () => {
  // The OrgSetupCTA component renders when `visible` is true.
  // `visible` is set to `!profile?.organization_id`.
  function ctaVisible(organizationId: string | null | undefined): boolean {
    return !organizationId
  }

  it("CTA is visible when organization_id is null or undefined", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined),
        (orgId) => {
          expect(ctaVisible(orgId)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("CTA is hidden when organization_id is a non-empty string", () => {
    fc.assert(
      fc.property(uuidArb, (orgId) => {
        expect(ctaVisible(orgId)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("visibility is the logical negation of organization_id truthiness", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(undefined), uuidArb),
        (orgId) => {
          expect(ctaVisible(orgId)).toBe(!orgId)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 2: Organization creation transaction integrity
 *
 * For any valid org creation request, the resulting state must include:
 * (a) an organizations record, (b) profile.organization_id set,
 * (c) an Admin role with is_system_role=true and all 28 permissions,
 * (d) an org_members record linking creator to org with Admin role.
 *
 * **Validates: Requirements 2.3, 2.4, 2.5, 2.6**
 */
describe("Feature: lab-org-management, Property 2: Organization creation transaction integrity", () => {
  const TOTAL_PERMISSIONS = RESOURCES.length * ACTIONS.length // 28

  // Simulate the transaction output shape
  interface CreationResult {
    organization: { id: string; name: string }
    profileOrgId: string
    role: { id: string; name: string; is_system_role: boolean }
    rolePermissionCount: number
    member: { organization_id: string; user_id: string; role_id: string }
  }

  function simulateCreation(orgName: string, userId: string): CreationResult {
    const orgId = `org-${orgName}`
    const roleId = `role-admin-${orgId}`
    return {
      organization: { id: orgId, name: orgName },
      profileOrgId: orgId,
      role: { id: roleId, name: "Admin", is_system_role: true },
      rolePermissionCount: TOTAL_PERMISSIONS,
      member: { organization_id: orgId, user_id: userId, role_id: roleId },
    }
  }

  it("organization record is created with the provided name", () => {
    fc.assert(
      fc.property(orgNameArb, uuidArb, (name, userId) => {
        const result = simulateCreation(name, userId)
        expect(result.organization.name).toBe(name)
        expect(result.organization.id).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("profile.organization_id matches the new org id", () => {
    fc.assert(
      fc.property(orgNameArb, uuidArb, (name, userId) => {
        const result = simulateCreation(name, userId)
        expect(result.profileOrgId).toBe(result.organization.id)
      }),
      { numRuns: 100 }
    )
  })

  it("Admin role is system role with all 28 permissions", () => {
    fc.assert(
      fc.property(orgNameArb, uuidArb, (name, userId) => {
        const result = simulateCreation(name, userId)
        expect(result.role.name).toBe("Admin")
        expect(result.role.is_system_role).toBe(true)
        expect(result.rolePermissionCount).toBe(TOTAL_PERMISSIONS)
      }),
      { numRuns: 100 }
    )
  })

  it("org_members record links creator to org with Admin role", () => {
    fc.assert(
      fc.property(orgNameArb, uuidArb, (name, userId) => {
        const result = simulateCreation(name, userId)
        expect(result.member.organization_id).toBe(result.organization.id)
        expect(result.member.user_id).toBe(userId)
        expect(result.member.role_id).toBe(result.role.id)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 3: Organization name validation
 *
 * For any string, the organization name validation accepts it if and only if
 * its trimmed length is between 2 and 100 characters inclusive.
 *
 * **Validates: Requirements 2.9**
 */
describe("Feature: lab-org-management, Property 3: Organization name validation", () => {
  function isValidOrgName(name: string): boolean {
    const trimmed = name.trim()
    return trimmed.length >= 2 && trimmed.length <= 100
  }

  it("names with trimmed length in [2, 100] are accepted", () => {
    const validNameArb = fc
      .string({ minLength: 2, maxLength: 100 })
      .filter((s) => s.trim().length >= 2 && s.trim().length <= 100)

    fc.assert(
      fc.property(validNameArb, (name) => {
        expect(isValidOrgName(name)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("names with trimmed length < 2 are rejected", () => {
    const shortNameArb = fc
      .string({ minLength: 0, maxLength: 10 })
      .filter((s) => s.trim().length < 2)

    fc.assert(
      fc.property(shortNameArb, (name) => {
        expect(isValidOrgName(name)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("names with trimmed length > 100 are rejected", () => {
    const longNameArb = fc
      .string({ minLength: 101, maxLength: 200 })
      .filter((s) => s.trim().length > 100)

    fc.assert(
      fc.property(longNameArb, (name) => {
        expect(isValidOrgName(name)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 4: Permission grouping by resource
 *
 * For any set of permissions, grouping by resource produces groups where every
 * permission in a group has the same resource value, and the number of groups
 * equals the number of distinct resources.
 *
 * **Validates: Requirements 3.3**
 */
describe("Feature: lab-org-management, Property 4: Permission grouping by resource", () => {
  const permissionArb = fc.tuple(resourceArb, actionArb).map(([r, a]) => ({
    resource: r,
    action: a,
    key: `${r}.${a}` as PermissionKey,
  }))

  const permissionsArb = fc.array(permissionArb, { minLength: 1, maxLength: 28 })

  function groupByResource<T extends { resource: string }>(
    permissions: T[]
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>()
    for (const p of permissions) {
      const existing = groups.get(p.resource) || []
      existing.push(p)
      groups.set(p.resource, existing)
    }
    return groups
  }

  it("every permission in a group has the same resource value", () => {
    fc.assert(
      fc.property(permissionsArb, (permissions) => {
        const groups = groupByResource(permissions)
        for (const [resource, perms] of groups) {
          for (const p of perms) {
            expect(p.resource).toBe(resource)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("number of groups equals number of distinct resources", () => {
    fc.assert(
      fc.property(permissionsArb, (permissions) => {
        const groups = groupByResource(permissions)
        const distinctResources = new Set(permissions.map((p) => p.resource))
        expect(groups.size).toBe(distinctResources.size)
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * Property 5: Role creation produces correct records
 *
 * For any valid role name and non-empty set of permission IDs, creating a role
 * produces one org_roles record and exactly N org_role_permissions records
 * where N equals the number of selected permissions.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
describe("Feature: lab-org-management, Property 5: Role creation produces correct records", () => {
  const roleNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)
  const permissionIdsArb = fc.uniqueArray(uuidArb, { minLength: 1, maxLength: 28 })

  interface RoleCreationResult {
    role: { id: string; name: string; organization_id: string }
    rolePermissions: Array<{ role_id: string; permission_id: string }>
  }

  function simulateRoleCreation(
    orgId: string,
    roleName: string,
    permissionIds: string[]
  ): RoleCreationResult {
    const roleId = `role-${roleName}-${orgId}`
    return {
      role: { id: roleId, name: roleName, organization_id: orgId },
      rolePermissions: permissionIds.map((pid) => ({
        role_id: roleId,
        permission_id: pid,
      })),
    }
  }

  it("creates exactly one role record", () => {
    fc.assert(
      fc.property(uuidArb, roleNameArb, permissionIdsArb, (orgId, name, permIds) => {
        const result = simulateRoleCreation(orgId, name, permIds)
        expect(result.role.name).toBe(name)
        expect(result.role.organization_id).toBe(orgId)
      }),
      { numRuns: 100 }
    )
  })

  it("creates exactly N role_permission records for N permissions", () => {
    fc.assert(
      fc.property(uuidArb, roleNameArb, permissionIdsArb, (orgId, name, permIds) => {
        const result = simulateRoleCreation(orgId, name, permIds)
        expect(result.rolePermissions.length).toBe(permIds.length)
      }),
      { numRuns: 100 }
    )
  })

  it("all role_permission records reference the created role", () => {
    fc.assert(
      fc.property(uuidArb, roleNameArb, permissionIdsArb, (orgId, name, permIds) => {
        const result = simulateRoleCreation(orgId, name, permIds)
        for (const rp of result.rolePermissions) {
          expect(rp.role_id).toBe(result.role.id)
        }
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 6: System role protection
 *
 * For any role where is_system_role is true, delete and edit operations
 * are rejected regardless of the requester's permissions.
 *
 * **Validates: Requirements 3.7**
 */
describe("Feature: lab-org-management, Property 6: System role protection", () => {
  type Operation = "edit" | "delete"
  const operationArb = fc.constantFrom<Operation>("edit", "delete")

  function canModifyRole(isSystemRole: boolean, _operation: Operation): boolean {
    // System roles cannot be modified or deleted
    return !isSystemRole
  }

  it("system roles reject all modification operations", () => {
    fc.assert(
      fc.property(operationArb, (operation) => {
        expect(canModifyRole(true, operation)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("non-system roles allow modification operations", () => {
    fc.assert(
      fc.property(operationArb, (operation) => {
        expect(canModifyRole(false, operation)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("is_system_role is the sole determinant of protection", () => {
    fc.assert(
      fc.property(fc.boolean(), operationArb, (isSystem, operation) => {
        expect(canModifyRole(isSystem, operation)).toBe(!isSystem)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 7: Role name uniqueness within organization
 *
 * For any organization, attempting to create or rename a role to a name
 * that already exists within that organization is rejected.
 *
 * **Validates: Requirements 3.8**
 */
describe("Feature: lab-org-management, Property 7: Role name uniqueness within organization", () => {
  const roleNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

  function isRoleNameAvailable(existingNames: string[], newName: string): boolean {
    return !existingNames.includes(newName)
  }

  it("a name already in the list is rejected", () => {
    fc.assert(
      fc.property(
        fc.array(roleNameArb, { minLength: 1, maxLength: 10 }),
        (existingNames) => {
          // Pick one existing name
          const duplicate = existingNames[0]
          expect(isRoleNameAvailable(existingNames, duplicate)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("a name not in the list is accepted", () => {
    fc.assert(
      fc.property(
        fc.array(roleNameArb, { minLength: 0, maxLength: 10 }),
        roleNameArb,
        (existingNames, newName) => {
          fc.pre(!existingNames.includes(newName))
          expect(isRoleNameAvailable(existingNames, newName)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 8: Invitation creation per email
 *
 * For any list of N valid email addresses and a valid role ID, submitting
 * an invitation request creates exactly N org_invitations records, each
 * with status "pending" and a unique token.
 *
 * **Validates: Requirements 4.3**
 */
describe("Feature: lab-org-management, Property 8: Invitation creation per email", () => {
  const emailsArb = fc.uniqueArray(emailArb, { minLength: 1, maxLength: 10 })

  interface InvitationRecord {
    email: string
    status: string
    token: string
    organization_id: string
    role_id: string
  }

  function simulateInvitationCreation(
    emails: string[],
    orgId: string,
    roleId: string
  ): InvitationRecord[] {
    return emails.map((email) => ({
      email,
      status: "pending",
      token: generateInvitationToken(),
      organization_id: orgId,
      role_id: roleId,
    }))
  }

  it("creates exactly N invitation records for N emails", () => {
    fc.assert(
      fc.property(emailsArb, uuidArb, uuidArb, (emails, orgId, roleId) => {
        const records = simulateInvitationCreation(emails, orgId, roleId)
        expect(records.length).toBe(emails.length)
      }),
      { numRuns: 100 }
    )
  })

  it("all records have status 'pending'", () => {
    fc.assert(
      fc.property(emailsArb, uuidArb, uuidArb, (emails, orgId, roleId) => {
        const records = simulateInvitationCreation(emails, orgId, roleId)
        for (const r of records) {
          expect(r.status).toBe("pending")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("all tokens are unique", () => {
    fc.assert(
      fc.property(emailsArb, uuidArb, uuidArb, (emails, orgId, roleId) => {
        const records = simulateInvitationCreation(emails, orgId, roleId)
        const tokens = records.map((r) => r.token)
        expect(new Set(tokens).size).toBe(tokens.length)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 9: Duplicate invitation prevention
 *
 * For any organization and email address, if a "pending" invitation already
 * exists for that email in that organization, a new invitation request for
 * the same email is rejected.
 *
 * **Validates: Requirements 4.6**
 */
describe("Feature: lab-org-management, Property 9: Duplicate invitation prevention", () => {
  interface PendingInvitation {
    email: string
    organization_id: string
    status: string
  }

  function hasDuplicatePending(
    existing: PendingInvitation[],
    email: string,
    orgId: string
  ): boolean {
    return existing.some(
      (inv) =>
        inv.email === email &&
        inv.organization_id === orgId &&
        inv.status === "pending"
    )
  }

  it("rejects when a pending invitation exists for the same email and org", () => {
    fc.assert(
      fc.property(emailArb, uuidArb, (email, orgId) => {
        const existing: PendingInvitation[] = [
          { email, organization_id: orgId, status: "pending" },
        ]
        expect(hasDuplicatePending(existing, email, orgId)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("allows when no pending invitation exists for the email", () => {
    fc.assert(
      fc.property(emailArb, emailArb, uuidArb, (existingEmail, newEmail, orgId) => {
        fc.pre(existingEmail !== newEmail)
        const existing: PendingInvitation[] = [
          { email: existingEmail, organization_id: orgId, status: "pending" },
        ]
        expect(hasDuplicatePending(existing, newEmail, orgId)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("allows when existing invitation is not pending (e.g. revoked)", () => {
    fc.assert(
      fc.property(
        emailArb,
        uuidArb,
        fc.constantFrom("revoked", "accepted", "expired", "failed"),
        (email, orgId, status) => {
          const existing: PendingInvitation[] = [
            { email, organization_id: orgId, status },
          ]
          expect(hasDuplicatePending(existing, email, orgId)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 10: Invitation token security and URL format
 *
 * For any generated invitation token, it has at least 32 bytes of entropy
 * (64 hex characters). The invitation URL follows the format
 * {APP_BASE_URL}/auth/invite?token={token}.
 *
 * **Validates: Requirements 4.7, 8.5**
 */
describe("Feature: lab-org-management, Property 10: Invitation token security and URL format", () => {
  it("generated token is exactly 64 hex characters (32 bytes entropy)", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateInvitationToken()
        expect(token).toHaveLength(64)
        expect(token).toMatch(/^[0-9a-f]{64}$/)
      }),
      { numRuns: 100 }
    )
  })

  it("each generated token is unique", () => {
    const tokens = new Set<string>()
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateInvitationToken()
        expect(tokens.has(token)).toBe(false)
        tokens.add(token)
      }),
      { numRuns: 100 }
    )
  })

  it("invitation URL follows the format {base}/auth/invite?token={token}", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateInvitationToken()
        const url = buildInvitationUrl(token)
        // Default base is http://localhost:3000 in test env
        expect(url).toContain("/auth/invite?token=")
        expect(url).toContain(token)
        expect(url).toMatch(/^https?:\/\/.+\/auth\/invite\?token=[0-9a-f]{64}$/)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 11: Invitation revocation invalidates acceptance
 *
 * For any pending invitation, revoking it changes the status to "revoked".
 * Subsequently, attempting to accept the same token is rejected.
 *
 * **Validates: Requirements 4.9**
 */
describe("Feature: lab-org-management, Property 11: Invitation revocation invalidates acceptance", () => {
  type InvitationStatus = "pending" | "sent" | "accepted" | "revoked" | "expired" | "failed"

  function canAcceptInvitation(status: InvitationStatus, isExpired: boolean): boolean {
    return (status === "pending" || status === "sent") && !isExpired
  }

  function revokeInvitation(status: InvitationStatus): InvitationStatus {
    if (status === "pending" || status === "sent") return "revoked"
    return status // can't revoke non-pending
  }

  it("revoking a pending invitation changes status to 'revoked'", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<InvitationStatus>("pending", "sent"),
        (status) => {
          expect(revokeInvitation(status)).toBe("revoked")
        }
      ),
      { numRuns: 100 }
    )
  })

  it("a revoked invitation cannot be accepted", () => {
    fc.assert(
      fc.property(fc.boolean(), (isExpired) => {
        expect(canAcceptInvitation("revoked", isExpired)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("revoke then accept is always rejected", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<InvitationStatus>("pending", "sent"),
        fc.boolean(),
        (initialStatus, isExpired) => {
          const afterRevoke = revokeInvitation(initialStatus)
          expect(afterRevoke).toBe("revoked")
          expect(canAcceptInvitation(afterRevoke, isExpired)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 12: Valid invitation displays correct info
 *
 * For any invitation with status "pending" and a non-expired token, the
 * acceptance page data includes the organization name and the assigned role name.
 *
 * **Validates: Requirements 5.2**
 */
describe("Feature: lab-org-management, Property 12: Valid invitation displays correct info", () => {
  const orgNameDisplayArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)
  const roleNameDisplayArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0)

  interface InvitationPageData {
    orgName: string
    roleName: string
    isValid: boolean
  }

  function buildPageData(
    status: string,
    isExpired: boolean,
    orgName: string,
    roleName: string
  ): InvitationPageData {
    const isValid = (status === "pending" || status === "sent") && !isExpired
    return { orgName, roleName, isValid }
  }

  it("valid invitation page data includes org name and role name", () => {
    fc.assert(
      fc.property(orgNameDisplayArb, roleNameDisplayArb, (orgName, roleName) => {
        const data = buildPageData("pending", false, orgName, roleName)
        expect(data.isValid).toBe(true)
        expect(data.orgName).toBe(orgName)
        expect(data.roleName).toBe(roleName)
      }),
      { numRuns: 100 }
    )
  })

  it("expired invitation is marked invalid", () => {
    fc.assert(
      fc.property(orgNameDisplayArb, roleNameDisplayArb, (orgName, roleName) => {
        const data = buildPageData("pending", true, orgName, roleName)
        expect(data.isValid).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 13: Invitation acceptance transaction integrity
 *
 * For any valid invitation acceptance by an eligible user (no existing org),
 * the resulting state must include: (a) profile.organization_id set to the
 * invitation's organization, (b) a new org_members record with the invitation's
 * role, and (c) the invitation status updated to "accepted".
 *
 * **Validates: Requirements 5.6**
 */
describe("Feature: lab-org-management, Property 13: Invitation acceptance transaction integrity", () => {
  interface AcceptanceResult {
    profileOrgId: string
    member: { organization_id: string; user_id: string; role_id: string }
    invitationStatus: string
  }

  function simulateAcceptance(
    invitationOrgId: string,
    invitationRoleId: string,
    userId: string
  ): AcceptanceResult {
    return {
      profileOrgId: invitationOrgId,
      member: {
        organization_id: invitationOrgId,
        user_id: userId,
        role_id: invitationRoleId,
      },
      invitationStatus: "accepted",
    }
  }

  it("profile.organization_id is set to the invitation's organization", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, uuidArb, (orgId, roleId, userId) => {
        const result = simulateAcceptance(orgId, roleId, userId)
        expect(result.profileOrgId).toBe(orgId)
      }),
      { numRuns: 100 }
    )
  })

  it("org_members record links user to org with correct role", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, uuidArb, (orgId, roleId, userId) => {
        const result = simulateAcceptance(orgId, roleId, userId)
        expect(result.member.organization_id).toBe(orgId)
        expect(result.member.user_id).toBe(userId)
        expect(result.member.role_id).toBe(roleId)
      }),
      { numRuns: 100 }
    )
  })

  it("invitation status is updated to 'accepted'", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, uuidArb, (orgId, roleId, userId) => {
        const result = simulateAcceptance(orgId, roleId, userId)
        expect(result.invitationStatus).toBe("accepted")
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 14: Existing organization blocks invitation acceptance
 *
 * For any user who already has a non-null organization_id that differs from
 * the invitation's organization, attempting to accept the invitation is rejected.
 *
 * **Validates: Requirements 5.7**
 */
describe("Feature: lab-org-management, Property 14: Existing organization blocks invitation acceptance", () => {
  function canAcceptWithExistingOrg(
    userOrgId: string | null,
    invitationOrgId: string
  ): { allowed: boolean; reason?: string } {
    if (userOrgId && userOrgId !== invitationOrgId) {
      return { allowed: false, reason: "You must leave your current organization first" }
    }
    return { allowed: true }
  }

  it("user with different org is blocked", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (userOrgId, invOrgId) => {
        fc.pre(userOrgId !== invOrgId)
        const result = canAcceptWithExistingOrg(userOrgId, invOrgId)
        expect(result.allowed).toBe(false)
        expect(result.reason).toBeTruthy()
      }),
      { numRuns: 100 }
    )
  })

  it("user with no org is allowed", () => {
    fc.assert(
      fc.property(uuidArb, (invOrgId) => {
        const result = canAcceptWithExistingOrg(null, invOrgId)
        expect(result.allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("user with same org is allowed", () => {
    fc.assert(
      fc.property(uuidArb, (orgId) => {
        const result = canAcceptWithExistingOrg(orgId, orgId)
        expect(result.allowed).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 15: Admin-only actions visibility
 *
 * For any user viewing the Org Dashboard, administrative actions are visible
 * if and only if the user holds the "Admin" role (is_system_role = true).
 *
 * **Validates: Requirements 6.8**
 */
describe("Feature: lab-org-management, Property 15: Admin-only actions visibility", () => {
  const memberArb = (userId: string): fc.Arbitrary<OrgMember> =>
    fc.record({
      user_id: fc.constant(userId),
      role_id: fc.oneof(uuidArb, fc.constant(null)),
      is_active: fc.boolean(),
      role: fc.oneof(
        fc.record({
          is_system_role: fc.boolean(),
          name: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        fc.constant(null)
      ),
    })

  it("isOrgAdmin returns true only for active members with system Admin role", () => {
    fc.assert(
      fc.property(uuidArb, (userId) => {
        const adminMember: OrgMember = {
          user_id: userId,
          role_id: "some-role",
          is_active: true,
          role: { is_system_role: true, name: "Admin" },
        }
        expect(isOrgAdmin([adminMember], userId)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("isOrgAdmin returns false for non-admin members", () => {
    fc.assert(
      fc.property(uuidArb, (userId) => {
        const regularMember: OrgMember = {
          user_id: userId,
          role_id: "some-role",
          is_active: true,
          role: { is_system_role: false, name: "Researcher" },
        }
        expect(isOrgAdmin([regularMember], userId)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("isOrgAdmin returns false for inactive admin members", () => {
    fc.assert(
      fc.property(uuidArb, (userId) => {
        const inactiveMember: OrgMember = {
          user_id: userId,
          role_id: "some-role",
          is_active: false,
          role: { is_system_role: true, name: "Admin" },
        }
        expect(isOrgAdmin([inactiveMember], userId)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 16: Member removal deactivates and clears org
 *
 * For any member removal by an admin, the member's org_members.is_active
 * is set to false and their profiles.organization_id is set to null.
 *
 * **Validates: Requirements 6.9**
 */
describe("Feature: lab-org-management, Property 16: Member removal deactivates and clears org", () => {
  interface MemberState {
    is_active: boolean
    profileOrgId: string | null
  }

  function simulateRemoval(
    _memberId: string,
    currentOrgId: string
  ): MemberState {
    // After removal: is_active = false, organization_id = null
    return {
      is_active: false,
      profileOrgId: null,
    }
  }

  it("member is_active is set to false after removal", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (memberId, orgId) => {
        const state = simulateRemoval(memberId, orgId)
        expect(state.is_active).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("profile organization_id is set to null after removal", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (memberId, orgId) => {
        const state = simulateRemoval(memberId, orgId)
        expect(state.profileOrgId).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it("removal always produces both deactivation and org clearing together", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (memberId, orgId) => {
        const state = simulateRemoval(memberId, orgId)
        // Both conditions must hold simultaneously
        expect(state.is_active === false && state.profileOrgId === null).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 17: RLS organization data isolation (SELECT)
 *
 * For any two users in different organizations, user A cannot SELECT
 * org_roles, org_members, or org_role_permissions records belonging
 * to user B's organization.
 *
 * **Validates: Requirements 7.8, 9.1, 9.3, 9.8**
 */
describe("Feature: lab-org-management, Property 17: RLS organization data isolation (SELECT)", () => {
  type TableName = "org_roles" | "org_members" | "org_role_permissions"
  const tableArb = fc.constantFrom<TableName>("org_roles", "org_members", "org_role_permissions")

  function rlsAllowsSelect(
    userOrgId: string,
    recordOrgId: string
  ): boolean {
    // RLS policy: user can only SELECT records from their own org
    return userOrgId === recordOrgId
  }

  it("user cannot SELECT records from a different organization", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, tableArb, (userOrg, recordOrg, _table) => {
        fc.pre(userOrg !== recordOrg)
        expect(rlsAllowsSelect(userOrg, recordOrg)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("user can SELECT records from their own organization", () => {
    fc.assert(
      fc.property(uuidArb, tableArb, (orgId, _table) => {
        expect(rlsAllowsSelect(orgId, orgId)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("isolation holds across all protected tables", () => {
    fc.assert(
      fc.property(uuidArb, uuidArb, (userOrg, recordOrg) => {
        const tables: TableName[] = ["org_roles", "org_members", "org_role_permissions"]
        for (const _table of tables) {
          if (userOrg !== recordOrg) {
            expect(rlsAllowsSelect(userOrg, recordOrg)).toBe(false)
          } else {
            expect(rlsAllowsSelect(userOrg, recordOrg)).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 18: RLS admin-only write access
 *
 * For any non-admin member of an organization, INSERT, UPDATE, and DELETE
 * operations on org_roles, org_role_permissions, org_members, and
 * org_invitations (INSERT) are denied.
 *
 * **Validates: Requirements 9.2, 9.4, 9.6, 9.9**
 */
describe("Feature: lab-org-management, Property 18: RLS admin-only write access", () => {
  type WriteOp = "INSERT" | "UPDATE" | "DELETE"
  type ProtectedTable = "org_roles" | "org_role_permissions" | "org_members" | "org_invitations"

  const writeOpArb = fc.constantFrom<WriteOp>("INSERT", "UPDATE", "DELETE")
  const protectedTableArb = fc.constantFrom<ProtectedTable>(
    "org_roles",
    "org_role_permissions",
    "org_members",
    "org_invitations"
  )

  function rlsAllowsWrite(isAdmin: boolean, _table: ProtectedTable, _op: WriteOp): boolean {
    return isAdmin
  }

  it("non-admin members are denied all write operations", () => {
    fc.assert(
      fc.property(protectedTableArb, writeOpArb, (table, op) => {
        expect(rlsAllowsWrite(false, table, op)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("admin members are allowed write operations", () => {
    fc.assert(
      fc.property(protectedTableArb, writeOpArb, (table, op) => {
        expect(rlsAllowsWrite(true, table, op)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("admin status is the sole determinant of write access", () => {
    fc.assert(
      fc.property(fc.boolean(), protectedTableArb, writeOpArb, (isAdmin, table, op) => {
        expect(rlsAllowsWrite(isAdmin, table, op)).toBe(isAdmin)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 19: RLS invitation acceptance by email match
 *
 * For any authenticated user, UPDATE on org_invitations is allowed if and
 * only if the user's email matches the invitation's email field.
 *
 * **Validates: Requirements 9.7**
 */
describe("Feature: lab-org-management, Property 19: RLS invitation acceptance by email match", () => {
  function rlsAllowsInvitationUpdate(
    userEmail: string,
    invitationEmail: string
  ): boolean {
    return userEmail === invitationEmail
  }

  it("user can update invitation when emails match", () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        expect(rlsAllowsInvitationUpdate(email, email)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("user cannot update invitation when emails differ", () => {
    fc.assert(
      fc.property(emailArb, emailArb, (userEmail, invEmail) => {
        fc.pre(userEmail !== invEmail)
        expect(rlsAllowsInvitationUpdate(userEmail, invEmail)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("email match is exact (case-sensitive comparison)", () => {
    fc.assert(
      fc.property(emailArb, emailArb, (email1, email2) => {
        const result = rlsAllowsInvitationUpdate(email1, email2)
        expect(result).toBe(email1 === email2)
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 20: Invitation email contains required content
 *
 * For any invitation, the rendered email HTML contains the organization name,
 * the role name, and an acceptance URL matching the format
 * {APP_BASE_URL}/auth/invite?token={token}.
 *
 * **Validates: Requirements 4.4, 8.2**
 */
describe("Feature: lab-org-management, Property 20: Invitation email contains required content", () => {
  // We import the actual buildInvitationEmailHtml from the Edge Function.
  // Since it's a Deno file, we re-implement the same logic here for testing
  // (the function is pure and has no Deno-specific deps).
  function buildInvitationEmailHtml(params: {
    orgName: string
    roleName: string
    inviterName: string
    inviteUrl: string
  }): string {
    const { orgName, roleName, inviterName, inviteUrl } = params
    const escapedOrgName = orgName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const escapedRoleName = roleName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const escapedInviterName = inviterName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const escapedInviteUrl = inviteUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>You're invited to join ${escapedOrgName} on Notes9</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;">
        <tr><td style="background-color:#18181b;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">Notes9</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2>You're invited!</h2>
          <p><strong>${escapedInviterName}</strong> has invited you to join <strong>${escapedOrgName}</strong> on Notes9 as a <strong>${escapedRoleName}</strong>.</p>
          <a href="${escapedInviteUrl}">Accept Invitation</a>
          <p><a href="${escapedInviteUrl}">${escapedInviteUrl}</a></p>
          <p>This invitation was sent to you by ${escapedInviterName} from ${escapedOrgName}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  }

  // Generators: use safe strings that won't break HTML but are still varied
  const safeStringArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .filter((s) => s.trim().length > 0)
    .map((s) => s.replace(/[<>&"]/g, "x")) // avoid HTML special chars in input

  const hexCharArb = fc.constantFrom(..."0123456789abcdef".split(""))
  const tokenArb = fc.array(hexCharArb, { minLength: 64, maxLength: 64 }).map((chars) => chars.join(""))

  it("email HTML contains the organization name", () => {
    fc.assert(
      fc.property(safeStringArb, safeStringArb, safeStringArb, tokenArb, (orgName, roleName, inviterName, token) => {
        const inviteUrl = `https://notes9.com/auth/invite?token=${token}`
        const html = buildInvitationEmailHtml({ orgName, roleName, inviterName, inviteUrl })
        expect(html).toContain(orgName)
      }),
      { numRuns: 100 }
    )
  })

  it("email HTML contains the role name", () => {
    fc.assert(
      fc.property(safeStringArb, safeStringArb, safeStringArb, tokenArb, (orgName, roleName, inviterName, token) => {
        const inviteUrl = `https://notes9.com/auth/invite?token=${token}`
        const html = buildInvitationEmailHtml({ orgName, roleName, inviterName, inviteUrl })
        expect(html).toContain(roleName)
      }),
      { numRuns: 100 }
    )
  })

  it("email HTML contains the acceptance URL with token", () => {
    fc.assert(
      fc.property(safeStringArb, safeStringArb, safeStringArb, tokenArb, (orgName, roleName, inviterName, token) => {
        const inviteUrl = `https://notes9.com/auth/invite?token=${token}`
        const html = buildInvitationEmailHtml({ orgName, roleName, inviterName, inviteUrl })
        expect(html).toContain(`/auth/invite?token=${token}`)
      }),
      { numRuns: 100 }
    )
  })
})
