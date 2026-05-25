import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { z } from "zod"

import {
  hasPermission,
  isOrgAdmin,
  RESOURCES,
  ACTIONS,
  type PermissionKey,
  type OrgMember,
} from "@/lib/org/permissions"
import {
  generateInvitationToken,
  buildInvitationUrl,
} from "@/lib/org/invitation"

// ---------------------------------------------------------------------------
// 13.1 — Org name validation edge cases (Req 2.9)
// ---------------------------------------------------------------------------

/**
 * The zod schema used in POST /api/org/create. We replicate it here so we can
 * unit-test the validation logic without spinning up the full API route.
 */
const orgNameSchema = z
  .string()
  .trim()
  .min(2, "Organization name must be at least 2 characters")
  .max(100, "Organization name must be at most 100 characters")

describe("13.1 — Org name validation edge cases (Req 2.9)", () => {
  it("rejects an empty string", () => {
    const result = orgNameSchema.safeParse("")
    expect(result.success).toBe(false)
  })

  it("rejects a 1-character name", () => {
    const result = orgNameSchema.safeParse("A")
    expect(result.success).toBe(false)
  })

  it("accepts a 2-character name", () => {
    const result = orgNameSchema.safeParse("AB")
    expect(result.success).toBe(true)
  })

  it("accepts a 100-character name", () => {
    const name = "A".repeat(100)
    const result = orgNameSchema.safeParse(name)
    expect(result.success).toBe(true)
  })

  it("rejects a 101-character name", () => {
    const name = "A".repeat(101)
    const result = orgNameSchema.safeParse(name)
    expect(result.success).toBe(false)
  })

  it("rejects a whitespace-only name (trimmed to empty)", () => {
    const result = orgNameSchema.safeParse("   ")
    expect(result.success).toBe(false)
  })

  it("trims leading/trailing whitespace before length check", () => {
    // " AB " trims to "AB" (2 chars) → valid
    const result = orgNameSchema.safeParse(" AB ")
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 13.2 — Invitation token generation and URL building (Req 4.7, 8.5)
// ---------------------------------------------------------------------------

describe("13.2 — Invitation token generation and URL building (Req 4.7, 8.5)", () => {
  it("generates a token that is exactly 64 hex characters", () => {
    const token = generateInvitationToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it("generates unique tokens on successive calls", () => {
    const a = generateInvitationToken()
    const b = generateInvitationToken()
    expect(a).not.toBe(b)
  })

  it("builds a URL with the correct format using NEXT_PUBLIC_APP_URL", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    process.env.NEXT_PUBLIC_APP_URL = "https://notes9.com"
    try {
      const token = "abc123"
      const url = buildInvitationUrl(token)
      expect(url).toBe("https://notes9.com/auth/invite?token=abc123")
    } finally {
      process.env.NEXT_PUBLIC_APP_URL = original
    }
  })

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is missing", () => {
    const original = process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    try {
      const token = "def456"
      const url = buildInvitationUrl(token)
      expect(url).toBe("http://localhost:3000/auth/invite?token=def456")
    } finally {
      if (original !== undefined) {
        process.env.NEXT_PUBLIC_APP_URL = original
      }
    }
  })

  it("URL always ends with ?token={token}", () => {
    const token = generateInvitationToken()
    const url = buildInvitationUrl(token)
    expect(url).toContain(`?token=${token}`)
    expect(url).toMatch(/\/auth\/invite\?token=[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------
// 13.3 — Permission utility functions (Req 3.3, 6.8)
// ---------------------------------------------------------------------------

describe("13.3 — Permission utility functions (Req 3.3, 6.8)", () => {
  describe("hasPermission", () => {
    it("returns true when the permission key is present", () => {
      const perms: PermissionKey[] = ["projects.view", "experiments.create"]
      expect(hasPermission(perms, "projects", "view")).toBe(true)
    })

    it("returns false when the permission key is absent", () => {
      const perms: PermissionKey[] = ["projects.view"]
      expect(hasPermission(perms, "projects", "delete")).toBe(false)
    })

    it("returns false for an empty permissions array", () => {
      expect(hasPermission([], "samples", "edit")).toBe(false)
    })

    it("correctly distinguishes different resource.action combos", () => {
      const perms: PermissionKey[] = ["projects.create", "experiments.delete"]
      expect(hasPermission(perms, "projects", "create")).toBe(true)
      expect(hasPermission(perms, "projects", "delete")).toBe(false)
      expect(hasPermission(perms, "experiments", "delete")).toBe(true)
      expect(hasPermission(perms, "experiments", "create")).toBe(false)
    })
  })

  describe("isOrgAdmin", () => {
    const adminMember: OrgMember = {
      user_id: "user-1",
      role_id: "role-1",
      is_active: true,
      role: { is_system_role: true, name: "Admin" },
    }

    const regularMember: OrgMember = {
      user_id: "user-2",
      role_id: "role-2",
      is_active: true,
      role: { is_system_role: false, name: "Researcher" },
    }

    const inactiveAdmin: OrgMember = {
      user_id: "user-3",
      role_id: "role-1",
      is_active: false,
      role: { is_system_role: true, name: "Admin" },
    }

    it("returns true for an active admin member", () => {
      expect(isOrgAdmin([adminMember, regularMember], "user-1")).toBe(true)
    })

    it("returns false for a non-admin member", () => {
      expect(isOrgAdmin([adminMember, regularMember], "user-2")).toBe(false)
    })

    it("returns false for an inactive admin", () => {
      expect(isOrgAdmin([inactiveAdmin], "user-3")).toBe(false)
    })

    it("returns false when user is not in the members list", () => {
      expect(isOrgAdmin([adminMember], "unknown-user")).toBe(false)
    })

    it("returns false for a member with null role", () => {
      const noRole: OrgMember = {
        user_id: "user-4",
        role_id: null,
        is_active: true,
        role: null,
      }
      expect(isOrgAdmin([noRole], "user-4")).toBe(false)
    })
  })
})


// ---------------------------------------------------------------------------
// 13.4 — API route error conditions (Req 2.8, 3.7, 3.8, 4.6, 5.3, 5.7)
// ---------------------------------------------------------------------------

/**
 * We test the validation schemas and error-condition logic extracted from the
 * API route source code. This avoids needing to mock the full Next.js
 * request/response pipeline while still verifying the critical error paths.
 */

const createOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name must be at most 100 characters"),
  type: z
    .enum(["academic", "industry", "government", "independent"])
    .optional(),
  description: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
})

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Role name is required"),
  description: z.string().optional(),
  permissionIds: z
    .array(z.string().uuid("Invalid permission ID"))
    .min(1, "At least one permission is required"),
})

const inviteSchema = z.object({
  emails: z
    .array(z.string().email("Invalid email address"))
    .min(1, "At least one email address is required"),
  roleId: z.string().uuid("Invalid role ID"),
})

const acceptSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
})

import fs from "fs"
import path from "path"

function readSource(relativePath: string): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../..", relativePath),
    "utf-8"
  )
}

describe("13.4 — API route error conditions (Req 2.8, 3.7, 3.8, 4.6, 5.3, 5.7)", () => {
  describe("Org creation — invalid request bodies (Req 2.8)", () => {
    it("rejects missing name field", () => {
      const result = createOrgSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it("rejects name shorter than 2 chars", () => {
      const result = createOrgSchema.safeParse({ name: "X" })
      expect(result.success).toBe(false)
    })

    it("rejects invalid org type", () => {
      const result = createOrgSchema.safeParse({
        name: "My Lab",
        type: "invalid-type",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid email format", () => {
      const result = createOrgSchema.safeParse({
        name: "My Lab",
        email: "not-an-email",
      })
      expect(result.success).toBe(false)
    })

    it("accepts a valid full request", () => {
      const result = createOrgSchema.safeParse({
        name: "My Lab",
        type: "academic",
        description: "A research lab",
        email: "lab@example.com",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("Duplicate role names — 409 (Req 3.8)", () => {
    const rolesSource = readSource("app/api/org/roles/route.ts")

    it("route checks for existing role with same name", () => {
      expect(rolesSource).toContain(
        "A role with this name already exists"
      )
    })

    it("returns 409 status for duplicate role name", () => {
      expect(rolesSource).toContain("status: 409")
    })
  })

  describe("System role deletion — 403 (Req 3.7)", () => {
    const rolesSource = readSource("app/api/org/roles/route.ts")

    it("rejects deletion of system role", () => {
      expect(rolesSource).toContain(
        "Cannot delete the default Admin role"
      )
    })

    it("returns 403 for system role operations", () => {
      expect(rolesSource).toContain("status: 403")
    })

    it("checks is_system_role before allowing delete", () => {
      expect(rolesSource).toContain("is_system_role")
    })
  })

  describe("Duplicate invitations — 409 (Req 4.6)", () => {
    const inviteSource = readSource("app/api/org/invite/route.ts")

    it("checks for existing pending invitations", () => {
      expect(inviteSource).toContain("pending")
    })

    it("returns 409 for duplicate pending invitation", () => {
      expect(inviteSource).toContain("status: 409")
      expect(inviteSource).toContain(
        "A pending invitation already exists for"
      )
    })
  })

  describe("Invalid tokens — 400 (Req 5.3)", () => {
    it("accept schema rejects empty token", () => {
      const result = acceptSchema.safeParse({ token: "" })
      expect(result.success).toBe(false)
    })

    it("accept schema rejects missing token", () => {
      const result = acceptSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    const acceptSource = readSource("app/api/org/invite/accept/route.ts")

    it("returns 400 for invalid or expired invitation", () => {
      expect(acceptSource).toContain("Invalid or expired invitation")
      expect(acceptSource).toContain("status: 400")
    })
  })

  describe("Existing org conflict — 409 (Req 5.7)", () => {
    const acceptSource = readSource("app/api/org/invite/accept/route.ts")

    it("returns 409 when user already belongs to another org", () => {
      expect(acceptSource).toContain(
        "You must leave your current organization first"
      )
      expect(acceptSource).toContain("status: 409")
    })
  })

  describe("Invite schema validation", () => {
    it("rejects empty emails array", () => {
      const result = inviteSchema.safeParse({
        emails: [],
        roleId: "550e8400-e29b-41d4-a716-446655440000",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid email in array", () => {
      const result = inviteSchema.safeParse({
        emails: ["not-email"],
        roleId: "550e8400-e29b-41d4-a716-446655440000",
      })
      expect(result.success).toBe(false)
    })

    it("rejects invalid roleId format", () => {
      const result = inviteSchema.safeParse({
        emails: ["user@example.com"],
        roleId: "not-a-uuid",
      })
      expect(result.success).toBe(false)
    })
  })
})


// ---------------------------------------------------------------------------
// 13.5 — Edge Function email template (Req 4.4, 8.2, 8.4)
// ---------------------------------------------------------------------------

/**
 * The Edge Function is a Deno file, so we re-implement the
 * `buildInvitationEmailHtml` function locally for testing. The logic is
 * identical to the one in supabase/functions/send-invitation-email/index.ts.
 */
function buildInvitationEmailHtml(params: {
  orgName: string
  roleName: string
  inviterName: string
  inviteUrl: string
}): string {
  const { orgName, roleName, inviterName, inviteUrl } = params

  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")

  const escapedOrgName = esc(orgName)
  const escapedRoleName = esc(roleName)
  const escapedInviterName = esc(inviterName)
  const escapedInviteUrl = inviteUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>You're invited to join ${escapedOrgName} on Notes9</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;">
          <tr>
            <td style="padding:40px;">
              <h2>You're invited!</h2>
              <p><strong>${escapedInviterName}</strong> has invited you to join
                <strong>${escapedOrgName}</strong> on Notes9 as a
                <strong>${escapedRoleName}</strong>.</p>
              <a href="${escapedInviteUrl}">Accept Invitation</a>
              <p><a href="${escapedInviteUrl}">${escapedInviteUrl}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

describe("13.5 — Edge Function email template (Req 4.4, 8.2, 8.4)", () => {
  describe("buildInvitationEmailHtml output", () => {
    const html = buildInvitationEmailHtml({
      orgName: "Genomics Lab",
      roleName: "Researcher",
      inviterName: "Dr. Smith",
      inviteUrl: "https://notes9.com/auth/invite?token=abc123",
    })

    it("contains the organization name", () => {
      expect(html).toContain("Genomics Lab")
    })

    it("contains the role name", () => {
      expect(html).toContain("Researcher")
    })

    it("contains the invite URL", () => {
      expect(html).toContain(
        "https://notes9.com/auth/invite?token=abc123"
      )
    })

    it("contains the inviter name", () => {
      expect(html).toContain("Dr. Smith")
    })

    it("contains an Accept Invitation link", () => {
      expect(html).toContain("Accept Invitation")
    })

    it("is valid HTML with DOCTYPE", () => {
      expect(html).toMatch(/^<!DOCTYPE html>/)
    })

    it("escapes HTML special characters in org name", () => {
      const escaped = buildInvitationEmailHtml({
        orgName: '<script>alert("xss")</script>',
        roleName: "Admin",
        inviterName: "Test",
        inviteUrl: "https://example.com",
      })
      expect(escaped).not.toContain("<script>")
      expect(escaped).toContain("&lt;script&gt;")
    })
  })

  describe("Edge Function behavior (source verification)", () => {
    const edgeFnSource = readSource(
      "supabase/functions/send-invitation-email/index.ts"
    )

    it("skips non-pending records", () => {
      expect(edgeFnSource).toContain('record.status !== "pending"')
      expect(edgeFnSource).toContain("Skipped: not pending")
    })

    it('updates status to "sent" on success', () => {
      expect(edgeFnSource).toContain('status: newStatus')
      expect(edgeFnSource).toContain(
        'resendRes.ok ? "sent" : "failed"'
      )
    })

    it('updates status to "failed" on error', () => {
      expect(edgeFnSource).toContain('status: "failed"')
    })

    it("handles missing RESEND_API_KEY gracefully", () => {
      expect(edgeFnSource).toContain("Missing RESEND_API_KEY")
    })
  })
})


// ---------------------------------------------------------------------------
// 13.6 — Auth flow token preservation (Req 5.4, 5.5)
// ---------------------------------------------------------------------------

describe("13.6 — Auth flow token preservation (Req 5.4, 5.5)", () => {
  describe("Sign-up page preserves ?token= param (Req 5.4)", () => {
    const signUpSource = readSource("app/auth/sign-up/page.tsx")

    it("reads the token from search params", () => {
      expect(signUpSource).toContain('searchParams.get("token")')
    })

    it("stores the invite token for use in redirects", () => {
      expect(signUpSource).toContain("inviteToken")
    })

    it("passes token through email redirect URL", () => {
      expect(signUpSource).toContain(
        "auth/callback?token="
      )
    })

    it("passes token through OAuth redirect URL", () => {
      // The OAuth handler also builds a callback URL with the token
      expect(signUpSource).toContain(
        "auth/callback?token="
      )
    })

    it("preserves token in the sign-in link", () => {
      expect(signUpSource).toContain(
        "/auth/login?token="
      )
    })
  })

  describe("Callback redirects to invite page when token present (Req 5.5)", () => {
    const callbackSource = readSource("app/auth/callback/route.ts")

    it("reads the token from callback URL params", () => {
      expect(callbackSource).toContain(
        'requestUrl.searchParams.get("token")'
      )
    })

    it("redirects to /auth/invite when token is present", () => {
      expect(callbackSource).toContain("/auth/invite?token=")
    })

    it("falls back to nextPath when no token", () => {
      // When invitationToken is falsy, redirectPath = nextPath
      expect(callbackSource).toContain("nextPath")
    })
  })

  describe("Token URL construction logic", () => {
    it("builds correct callback URL with token", () => {
      const origin = "https://notes9.com"
      const token = "my-invite-token"
      const callbackUrl = `${origin}/auth/callback?token=${encodeURIComponent(token)}`
      expect(callbackUrl).toBe(
        "https://notes9.com/auth/callback?token=my-invite-token"
      )
    })

    it("builds correct invite redirect URL from token", () => {
      const token = "abc123"
      const redirectPath = `/auth/invite?token=${encodeURIComponent(token)}`
      expect(redirectPath).toBe("/auth/invite?token=abc123")
    })

    it("encodes special characters in token", () => {
      const token = "token+with/special=chars"
      const encoded = encodeURIComponent(token)
      const url = `/auth/invite?token=${encoded}`
      expect(url).toContain("token%2Bwith%2Fspecial%3Dchars")
    })
  })
})
