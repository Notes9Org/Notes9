import { describe, it, expect } from "vitest"
import {
  RESOURCES,
  ACTIONS,
  hasPermission,
  isOrgAdmin,
  type PermissionKey,
  type OrgMember,
} from "./permissions"

describe("RESOURCES and ACTIONS constants", () => {
  it("has 7 resources", () => {
    expect(RESOURCES).toHaveLength(7)
  })

  it("has 4 actions", () => {
    expect(ACTIONS).toHaveLength(4)
  })

  it("contains expected resources", () => {
    expect(RESOURCES).toContain("projects")
    expect(RESOURCES).toContain("experiments")
    expect(RESOURCES).toContain("samples")
    expect(RESOURCES).toContain("equipment")
    expect(RESOURCES).toContain("protocols")
    expect(RESOURCES).toContain("lab_notes")
    expect(RESOURCES).toContain("reports")
  })

  it("contains expected actions", () => {
    expect(ACTIONS).toContain("view")
    expect(ACTIONS).toContain("create")
    expect(ACTIONS).toContain("edit")
    expect(ACTIONS).toContain("delete")
  })
})

describe("hasPermission", () => {
  it("returns true when the permission key exists", () => {
    const perms: PermissionKey[] = ["projects.view", "experiments.create"]
    expect(hasPermission(perms, "projects", "view")).toBe(true)
    expect(hasPermission(perms, "experiments", "create")).toBe(true)
  })

  it("returns false when the permission key does not exist", () => {
    const perms: PermissionKey[] = ["projects.view"]
    expect(hasPermission(perms, "projects", "delete")).toBe(false)
    expect(hasPermission(perms, "samples", "view")).toBe(false)
  })

  it("returns false for an empty permissions array", () => {
    expect(hasPermission([], "projects", "view")).toBe(false)
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

  const memberWithNullRole: OrgMember = {
    user_id: "user-4",
    role_id: null,
    is_active: true,
    role: null,
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

  it("returns false for an empty members array", () => {
    expect(isOrgAdmin([], "user-1")).toBe(false)
  })

  it("returns false for a member with null role", () => {
    expect(isOrgAdmin([memberWithNullRole], "user-4")).toBe(false)
  })
})
