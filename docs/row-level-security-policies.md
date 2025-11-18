# Row Level Security (RLS) Policies Documentation

This document provides a comprehensive overview of all Row Level Security policies implemented in the LIMS application database.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Security Model](#security-model)
3. [Helper Functions](#helper-functions)
4. [Tables and Policies](#tables-and-policies)
5. [Policy Patterns](#policy-patterns)
6. [Testing Policies](#testing-policies)
7. [Common Issues](#common-issues)

---

## Overview

Row Level Security (RLS) is a PostgreSQL feature that allows you to control which rows users can access in a table. All 19 tables in this database have RLS enabled to ensure proper data isolation and security.

### RLS Enabled Tables

The following tables have RLS enabled:

| Table | Description | Isolation Level |
|-------|-------------|-----------------|
| `organizations` | Lab/Organization entities | Organization-based |
| `profiles` | User profiles | Organization-based |
| `projects` | Research projects | Organization-based |
| `project_members` | Project team membership | Project-based |
| `experiments` | Experimental procedures | Project/Organization-based |
| `protocols` | Standard Operating Procedures | Organization-based |
| `experiment_protocols` | Protocol-Experiment links | Inherited from experiments |
| `assays` | Assay definitions | Organization-based |
| `experiment_assays` | Assay-Experiment links | Inherited from experiments |
| `samples` | Biological/chemical samples | Experiment/Organization-based |
| `equipment` | Laboratory equipment | Organization-based |
| `equipment_usage` | Equipment usage logs | Organization-based |
| `equipment_maintenance` | Maintenance records | Organization-based |
| `experiment_data` | Experimental data files | Experiment/Organization-based |
| `lab_notes` | Laboratory notes | Project/Experiment-based |
| `literature_reviews` | Literature references | Organization-based |
| `reports` | Generated reports | Project-based |
| `quality_control` | QC records | Experiment-based |
| `audit_log` | System audit trail | System-level |

---

## Security Model

### Multi-Tenant Architecture

The application uses a **single-tenant per user** model:

- Each user gets their own organization upon signup
- All data is scoped to the user's organization
- Users can only see/modify data within their organization

### Key Principles

1. **Organization Isolation**: Users can only access data in their organization
2. **Ownership**: Users typically have full control over records they create
3. **Project Membership**: Some operations require explicit project membership
4. **Creator Rights**: Creators have special privileges (update, delete)

---

## Helper Functions

### `get_user_organization_id(user_id uuid)`

**Purpose**: Retrieves the organization ID for a given user.

```sql
CREATE FUNCTION public.get_user_organization_id(user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT organization_id FROM public.profiles WHERE id = user_id;
$function$
```

**Usage in Policies**:
- Used extensively to check if data belongs to user's organization
- Provides consistent organization checking across all policies

---

### `handle_new_user()`

**Purpose**: Automatically creates organization and profile when a new user signs up.

**Trigger**: Fires after INSERT on `auth.users`

**Actions**:
1. Creates a new organization named "{User's Name}'s Lab"
2. Creates a profile record linked to the organization
3. Ensures data isolation from signup

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

### `add_creator_to_project_members()`

**Purpose**: Automatically adds project creator as a lead member.

**Trigger**: Fires after INSERT on `projects`

**Actions**:
1. Inserts creator into `project_members` with role 'lead'
2. Ensures creators can always access their projects
3. Enables project-scoped RLS policies to work correctly

```sql
CREATE TRIGGER add_project_creator_as_member
  AFTER INSERT ON projects
  FOR EACH ROW
  WHEN (NEW.created_by IS NOT NULL)
  EXECUTE FUNCTION add_creator_to_project_members();
```

---

## Tables and Policies

### 1. Organizations

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view their organization` | SELECT | User's organization only |

```sql
-- SELECT: Users can only view their own organization
USING (id = get_user_organization_id(auth.uid()))
```

**Notes**:
- Read-only access to organization data
- No INSERT/UPDATE/DELETE policies (managed by system)

---

### 2. Profiles

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view their own profile` | SELECT | Own profile |
| `Users can view profiles in their organization` | SELECT | Same organization |
| `Users can update their own profile` | UPDATE | Own profile only |

```sql
-- SELECT (Own): View your own profile
USING (auth.uid() = id)

-- SELECT (Organization): View colleagues' profiles
USING (organization_id IS NOT NULL 
       AND organization_id = get_user_organization_id(auth.uid()))

-- UPDATE: Update your own profile only
USING (auth.uid() = id)
```

**Notes**:
- Users can see all profiles in their organization
- Can only modify their own profile

---

### 3. Projects

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view projects in their organization` | SELECT | Organization-scoped |
| `projects_select_own_org` | SELECT | Organization via profile |
| `Users can create projects in their organization` | INSERT | Organization check |
| `Users can update projects they're members of` | UPDATE | Member or creator |
| `Users can delete projects they created` | DELETE | Creator only |

```sql
-- SELECT: View projects in your organization
USING (organization_id = get_user_organization_id(auth.uid()))

-- INSERT: Create projects in your organization
WITH CHECK (organization_id = get_user_organization_id(auth.uid()))

-- UPDATE: Update if you're a member or creator
USING (id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
       OR created_by = auth.uid())

-- DELETE: Delete only your own projects
USING (created_by = auth.uid())
```

**Foreign Keys**:
- `organization_id` → `organizations.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)

---

### 4. Project Members

**Table Structure**:
```sql
project_members (
  project_id UUID → projects.id (CASCADE)
  user_id UUID → profiles.id (CASCADE)
  role TEXT (lead|member|observer)
)
```

**Notes**:
- Join table linking users to projects
- Automatically populated when projects are created
- Used extensively in other policies

---

### 5. Experiments

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view experiments in their projects` | SELECT | Project member |
| `experiments_select_via_project` | SELECT | Organization via project |
| `Users can create experiments in their projects` | INSERT | Organization check |
| `Users can update experiments they created or are assigned to` | UPDATE | Creator or assignee |
| `Users can delete experiments they created` | DELETE | Creator only |

```sql
-- SELECT (Project Members): View via project membership
USING (project_id IN (SELECT project_id FROM project_members 
                      WHERE user_id = auth.uid()))

-- SELECT (Organization): View via organization
USING (project_id IN (SELECT id FROM projects 
                      WHERE organization_id = get_user_organization_id(auth.uid())))

-- INSERT: Create in projects within your organization
WITH CHECK (project_id IN (SELECT id FROM projects 
                           WHERE organization_id = get_user_organization_id(auth.uid())))

-- UPDATE: Update if creator or assigned
USING (created_by = auth.uid() OR assigned_to = auth.uid())
WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid())

-- DELETE: Delete your own experiments
USING (created_by = auth.uid())
```

**Foreign Keys**:
- `project_id` → `projects.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)
- `assigned_to` → `profiles.id` (SET NULL)

**Key Notes**:
- Two SELECT policies provide access via membership OR organization
- Creators and assignees can both update experiments
- Only creators can delete

---

### 6. Protocols

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Organization members can view protocols` | SELECT | Organization-scoped |
| `Users can create protocols in their organization` | INSERT | Creator + org check |
| `Organization members can update protocols` | UPDATE | Organization-scoped |
| `Organization members can delete protocols` | DELETE | Organization-scoped |

```sql
-- SELECT: View protocols in your organization
USING (organization_id = get_user_organization_id(auth.uid()))

-- INSERT: Create protocols in your organization
WITH CHECK (created_by = auth.uid() 
            AND organization_id = get_user_organization_id(auth.uid()))

-- UPDATE/DELETE: Modify protocols in your organization
USING (organization_id = get_user_organization_id(auth.uid()))
```

**Foreign Keys**:
- `organization_id` → `organizations.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)

---

### 7. Samples

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view samples` | SELECT | Creator or via organization |
| `Users can create samples` | INSERT | Creator check |
| `Users can update samples they created` | UPDATE | Creator only |
| `Users can delete their own samples` | DELETE | Creator only |

```sql
-- SELECT: View your samples or organization samples
USING (created_by = auth.uid() 
       OR experiment_id IN (
         SELECT e.id FROM experiments e 
         JOIN projects p ON e.project_id = p.id
         WHERE p.organization_id = get_user_organization_id(auth.uid())
       ))

-- INSERT/UPDATE/DELETE: Full control over your own samples
WITH CHECK (created_by = auth.uid())
USING (created_by = auth.uid())
```

**Foreign Keys**:
- `experiment_id` → `experiments.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)

---

### 8. Equipment

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view equipment in their organization` | SELECT | Organization-scoped |
| `Users can create equipment in their organization` | INSERT | Organization check |
| `Organization members can update equipment` | UPDATE | Organization-scoped |
| `Organization members can delete equipment` | DELETE | Organization-scoped |

```sql
-- All operations: Organization-scoped
USING (organization_id = get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()))
```

**Foreign Keys**:
- `organization_id` → `organizations.id` (CASCADE)

**Key Notes**:
- Equipment is shared within an organization
- All members have equal access

---

### 9. Equipment Usage

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view equipment usage in their organization` | SELECT | Via equipment org |
| `Users can create equipment usage logs` | INSERT | User + equipment check |
| `Users can update their own equipment usage logs` | UPDATE | Own logs only |
| `Users can delete their own equipment usage logs` | DELETE | Own logs only |

```sql
-- SELECT: View usage in your organization
USING (equipment_id IN (SELECT id FROM equipment 
                        WHERE organization_id = get_user_organization_id(auth.uid())))

-- INSERT: Log usage for your organization's equipment
WITH CHECK (user_id = auth.uid() 
            AND equipment_id IN (SELECT id FROM equipment 
                                 WHERE organization_id = get_user_organization_id(auth.uid())))

-- UPDATE/DELETE: Manage your own logs
USING (user_id = auth.uid())
```

**Foreign Keys**:
- `equipment_id` → `equipment.id` (CASCADE)
- `experiment_id` → `experiments.id` (SET NULL)
- `user_id` → `profiles.id` (CASCADE)

---

### 10. Equipment Maintenance

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view equipment maintenance in their organization` | SELECT | Via equipment org |
| `Users can create equipment maintenance records` | INSERT | Via equipment org |
| `Users can update maintenance records they created` | UPDATE | Performer only |
| `Users can delete maintenance records they created` | DELETE | Performer only |

```sql
-- SELECT/INSERT: Organization equipment
USING/WITH CHECK (equipment_id IN (SELECT id FROM equipment 
                                    WHERE organization_id = get_user_organization_id(auth.uid())))

-- UPDATE/DELETE: Your own maintenance records
USING (performed_by = auth.uid())
```

**Foreign Keys**:
- `equipment_id` → `equipment.id` (CASCADE)
- `performed_by` → `profiles.id` (SET NULL)

---

### 11. Lab Notes

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view lab notes in their projects/experiments` | SELECT | Project or experiment access |
| `Users can create lab notes` | INSERT | Creator check |
| `Users can update their own lab notes` | UPDATE | Creator only |

```sql
-- SELECT: View notes in your projects or experiments
USING (project_id IN (SELECT project_id FROM project_members 
                      WHERE user_id = auth.uid())
       OR experiment_id IN (SELECT e.id FROM experiments e
                            JOIN project_members pm ON e.project_id = pm.project_id
                            WHERE pm.user_id = auth.uid()))

-- INSERT: Create your own notes
WITH CHECK (created_by = auth.uid())

-- UPDATE: Update your own notes
USING (created_by = auth.uid())
```

**Foreign Keys**:
- `project_id` → `projects.id` (CASCADE)
- `experiment_id` → `experiments.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)

**Notes**:
- No DELETE policy (notes are permanent audit trail)

---

### 12. Literature Reviews

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view literature in their organization` | SELECT | Organization-scoped |
| `Users can create literature in their organization` | INSERT | Creator + org check |
| `Users can update literature they created` | UPDATE | Creator only |
| `Users can delete literature they created` | DELETE | Creator only |

```sql
-- SELECT: View in your organization
USING (organization_id = get_user_organization_id(auth.uid()))

-- INSERT: Create in your organization
WITH CHECK (created_by = auth.uid() 
            AND organization_id = get_user_organization_id(auth.uid()))

-- UPDATE/DELETE: Your own literature
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid())
```

**Foreign Keys**:
- `organization_id` → `organizations.id` (CASCADE)
- `project_id` → `projects.id` (SET NULL)
- `experiment_id` → `experiments.id` (SET NULL)
- `created_by` → `profiles.id` (SET NULL)

---

### 13. Experiment Data

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view experiment data in their projects` | SELECT | Via experiment/project/org |
| `Users can upload experiment data` | INSERT | Uploader + org check |
| `Users can update their own experiment data` | UPDATE | Uploader only |
| `Users can delete their own experiment data` | DELETE | Uploader only |

```sql
-- SELECT: View data in your organization's experiments
USING (experiment_id IN (SELECT e.id FROM experiments e
                         JOIN projects p ON e.project_id = p.id
                         WHERE p.organization_id = get_user_organization_id(auth.uid())))

-- INSERT: Upload to your organization's experiments
WITH CHECK (uploaded_by = auth.uid() 
            AND experiment_id IN (SELECT e.id FROM experiments e
                                  JOIN projects p ON e.project_id = p.id
                                  WHERE p.organization_id = get_user_organization_id(auth.uid())))

-- UPDATE/DELETE: Your own uploads
USING (uploaded_by = auth.uid())
```

**Foreign Keys**:
- `experiment_id` → `experiments.id` (CASCADE)
- `uploaded_by` → `profiles.id` (SET NULL)

---

### 14. Reports

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Users can view reports in their projects` | SELECT | Project member |
| `Users can create reports` | INSERT | Generator check |
| `Users can update their own reports` | UPDATE | Generator only |

```sql
-- SELECT: View reports in your projects
USING (project_id IN (SELECT project_id FROM project_members 
                      WHERE user_id = auth.uid()))

-- INSERT: Generate reports
WITH CHECK (generated_by = auth.uid())

-- UPDATE: Update your own reports
USING (generated_by = auth.uid())
```

**Foreign Keys**:
- `project_id` → `projects.id` (CASCADE)
- `experiment_id` → `experiments.id` (CASCADE)
- `generated_by` → `profiles.id` (SET NULL)

---

### 15. Assays

**RLS Policies**:

| Policy Name | Operation | Logic |
|------------|-----------|-------|
| `Organization members can view assays` | SELECT | Organization-scoped |

```sql
-- SELECT: View assays in your organization
USING (organization_id = get_user_organization_id(auth.uid()))
```

**Foreign Keys**:
- `organization_id` → `organizations.id` (CASCADE)
- `created_by` → `profiles.id` (SET NULL)

**Notes**:
- Currently read-only via RLS
- INSERT/UPDATE/DELETE may be managed at application level

---

## Policy Patterns

### Pattern 1: Organization-Scoped (Shared Resources)

Used for: Equipment, Protocols, Literature Reviews, Assays

```sql
-- All operations check organization
USING (organization_id = get_user_organization_id(auth.uid()))
WITH CHECK (organization_id = get_user_organization_id(auth.uid()))
```

**Characteristics**:
- All organization members have equal access
- Shared resources within the organization

---

### Pattern 2: Creator-Owned (Personal Resources)

Used for: Samples, Equipment Usage, Lab Notes

```sql
-- Only creator can modify
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid())

-- Others can view via organization
USING (created_by = auth.uid() OR <organization_check>)
```

**Characteristics**:
- Creator has full control
- Others can view but not modify

---

### Pattern 3: Project-Scoped (Collaborative Resources)

Used for: Experiments, Reports

```sql
-- Access via project membership
USING (project_id IN (SELECT project_id FROM project_members 
                      WHERE user_id = auth.uid()))
```

**Characteristics**:
- Requires explicit project membership
- Enables team collaboration

---

### Pattern 4: Hierarchical Access (Inherited Permissions)

Used for: Experiment Data, Lab Notes

```sql
-- Access via parent resource
USING (experiment_id IN (
  SELECT e.id FROM experiments e
  JOIN projects p ON e.project_id = p.id
  WHERE p.organization_id = get_user_organization_id(auth.uid())
))
```

**Characteristics**:
- Permissions flow from parent to child
- Simplifies access control

---

## Testing Policies

### Manual Testing via psql

```sql
-- Set user context
SET request.jwt.claims TO '{"sub": "USER_UUID_HERE"}';
SET ROLE authenticated;

-- Test SELECT
SELECT * FROM experiments LIMIT 5;

-- Test INSERT
INSERT INTO experiments (name, project_id, status, created_by)
VALUES ('Test', 'PROJECT_UUID', 'planned', 'USER_UUID');

-- Test UPDATE
UPDATE experiments SET status = 'in_progress' 
WHERE id = 'EXPERIMENT_UUID';

-- Test DELETE
DELETE FROM experiments WHERE id = 'EXPERIMENT_UUID';

-- Reset
RESET ROLE;
```

---

### Verify Policies Exist

```sql
-- Check all policies for a table
SELECT 
    policyname,
    cmd as operation,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies 
WHERE tablename = 'experiments'
ORDER BY cmd, policyname;
```

---

### Check User's Organization

```sql
-- Get user's organization
SELECT 
    p.id as user_id,
    p.email,
    p.organization_id,
    o.name as organization_name
FROM profiles p
LEFT JOIN organizations o ON o.id = p.organization_id
WHERE p.id = auth.uid();
```

---

## Common Issues

### Issue 1: "New row violates row-level security policy"

**Cause**: Missing INSERT policy or WITH CHECK fails

**Solutions**:
1. Verify INSERT policy exists:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'YOUR_TABLE' AND cmd = 'INSERT';
   ```

2. Check organization_id matches:
   ```sql
   SELECT get_user_organization_id(auth.uid());
   ```

3. Ensure required foreign keys are valid

---

### Issue 2: Cannot DELETE records

**Cause**: Missing DELETE policy

**Solution**:
```sql
CREATE POLICY "policy_name"
  ON table_name FOR DELETE
  USING (created_by = auth.uid());
```

---

### Issue 3: Can't see any data after login

**Causes**:
- User has no organization
- Project membership not set up
- Profile not created properly

**Diagnosis**:
```sql
-- Check profile
SELECT * FROM profiles WHERE id = auth.uid();

-- Check organization
SELECT * FROM organizations 
WHERE id = (SELECT organization_id FROM profiles WHERE id = auth.uid());

-- Check project membership
SELECT * FROM project_members WHERE user_id = auth.uid();
```

---

### Issue 4: Policies conflict with each other

**Cause**: Multiple policies with different logic

**Solution**:
- Policies are combined with OR logic
- More permissive policy wins
- Use `RESTRICT` policies if you need AND logic (advanced)

---

## Best Practices

### 1. Always Use Helper Functions

```sql
-- ✅ Good: Consistent, reusable
USING (organization_id = get_user_organization_id(auth.uid()))

-- ❌ Bad: Duplicated logic, hard to maintain
USING (organization_id IN (SELECT organization_id FROM profiles 
                           WHERE id = auth.uid()))
```

---

### 2. Test Policies Before Deployment

```sql
-- Test as actual user before applying to production
SET request.jwt.claims TO '{"sub": "REAL_USER_ID"}';
SET ROLE authenticated;
-- Try operations
RESET ROLE;
```

---

### 3. Document Complex Policies

```sql
-- Always add comments explaining the logic
CREATE POLICY "policy_name"
  ON table_name FOR SELECT
  -- Allow viewing if user is project member OR in same organization
  USING (...);
```

---

### 4. Use Consistent Naming

Follow the pattern:
- `Users can [action] [resource] [condition]`
- Examples:
  - `Users can view projects in their organization`
  - `Users can delete experiments they created`
  - `Organization members can update protocols`

---

## Migration Scripts

All RLS policies are defined in migration scripts:

| Script | Purpose |
|--------|---------|
| `001_create_tables.sql` | Table definitions |
| `002_enable_rls.sql` | Initial RLS policies |
| `005_fix_organization_isolation.sql` | Organization isolation logic |
| `009_fix_samples_rls.sql` | Sample policies |
| `010_auto_add_project_members.sql` | Project membership trigger |
| `011_complete_samples_rls.sql` | Complete sample policies |
| `012_complete_protocols_rls.sql` | Protocol CRUD policies |
| `013_complete_equipment_rls.sql` | Equipment policies |
| `015_fix_update_policies.sql` | Update policy fixes |
| `016_add_experiments_delete_policy.sql` | Experiment DELETE policy |

---

## Quick Reference

### Check RLS Status
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### List All Policies
```sql
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Get Policy Definition
```sql
\d+ table_name  -- Shows table with policies
```

### Test as User
```sql
SET request.jwt.claims TO '{"sub": "user-uuid"}';
SET ROLE authenticated;
-- Your queries here
RESET ROLE;
```

---

**Last Updated**: 2025-01-18  
**Database**: Supabase PostgreSQL  
**Project**: LIMS (Laboratory Inventory Management System)  
**RLS Version**: 2.0 (Multi-tenant with organization isolation)

