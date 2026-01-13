# RLS Quick Reference Guide

Quick reference for common RLS operations and checks.

---

## 🔍 Quick Diagnostics

### Check if user can access a table
```sql
SET request.jwt.claims TO '{"sub": "YOUR_USER_ID"}';
SET ROLE authenticated;
SELECT COUNT(*) FROM table_name;  -- Should return count, not error
RESET ROLE;
```

### Find missing policies
```sql
-- Check which operations are missing policies
SELECT 
    t.tablename,
    'SELECT' as operation,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies p 
        WHERE p.tablename = t.tablename AND p.cmd = 'SELECT'
    ) THEN '✓' ELSE '✗ MISSING' END as status
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.rowsecurity = true
UNION ALL
SELECT 
    t.tablename,
    'INSERT',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies p 
        WHERE p.tablename = t.tablename AND p.cmd = 'INSERT'
    ) THEN '✓' ELSE '✗ MISSING' END
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.rowsecurity = true
UNION ALL
SELECT 
    t.tablename,
    'UPDATE',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies p 
        WHERE p.tablename = t.tablename AND p.cmd = 'UPDATE'
    ) THEN '✓' ELSE '✗ MISSING' END
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.rowsecurity = true
UNION ALL
SELECT 
    t.tablename,
    'DELETE',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_policies p 
        WHERE p.tablename = t.tablename AND p.cmd = 'DELETE'
    ) THEN '✓' ELSE '✗ MISSING' END
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.rowsecurity = true
ORDER BY tablename, operation;
```

---

## 📊 Policy Summary Table

| Table | SELECT | INSERT | UPDATE | DELETE | Pattern |
|-------|--------|--------|--------|--------|---------|
| organizations | ✓ | ✗ | ✗ | ✗ | System-managed |
| profiles | ✓ | ✗ | ✓ | ✗ | Self + Org |
| projects | ✓ | ✓ | ✓ | ✓ | Org + Creator |
| experiments | ✓ | ✓ | ✓ | ✓ | Project + Creator |
| protocols | ✓ | ✓ | ✓ | ✓ | Organization |
| samples | ✓ | ✓ | ✓ | ✓ | Creator-owned |
| equipment | ✓ | ✓ | ✓ | ✓ | Organization |
| equipment_usage | ✓ | ✓ | ✓ | ✓ | User-owned |
| equipment_maintenance | ✓ | ✓ | ✓ | ✓ | Performer-owned |
| lab_notes | ✓ | ✓ | ✓ | ✗ | Creator-owned |
| literature_reviews | ✓ | ✓ | ✓ | ✓ | Org + Creator |
| reports | ✓ | ✓ | ✓ | ✗ | Project-scoped |
| experiment_data | ✓ | ✓ | ✓ | ✓ | Uploader-owned |
| assays | ✓ | ✗ | ✗ | ✗ | Organization |

---

## 🔧 Common Fixes

### Add Missing DELETE Policy
```sql
CREATE POLICY "Users can delete [resource] they created"
  ON table_name FOR DELETE
  USING (created_by = auth.uid());
```

### Add Missing UPDATE Policy
```sql
CREATE POLICY "Users can update [resource] they created"
  ON table_name FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
```

### Organization-Scoped INSERT
```sql
CREATE POLICY "Users can create [resource] in their organization"
  ON table_name FOR INSERT
  WITH CHECK (
    created_by = auth.uid() 
    AND organization_id = get_user_organization_id(auth.uid())
  );
```

---

## 🧪 Test Commands

### Connect to Database
```bash
PGPASSWORD='YOUR_PASSWORD' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres
```

### Check User Context
```sql
-- Get current user info
SELECT 
    auth.uid() as user_id,
    get_user_organization_id(auth.uid()) as org_id;

-- Get user's organization details
SELECT 
    p.id,
    p.email,
    p.first_name,
    p.last_name,
    p.organization_id,
    o.name as org_name
FROM profiles p
LEFT JOIN organizations o ON o.id = p.organization_id
WHERE p.id = auth.uid();
```

### Test Access to Projects
```sql
-- Projects user can see
SELECT p.id, p.name, p.organization_id
FROM projects p
WHERE p.organization_id = get_user_organization_id(auth.uid());

-- Projects user is a member of
SELECT p.id, p.name, pm.role
FROM projects p
JOIN project_members pm ON pm.project_id = p.id
WHERE pm.user_id = auth.uid();
```

---

## 🚨 Troubleshooting Checklist

- [ ] Check if RLS is enabled: `SELECT rowsecurity FROM pg_tables WHERE tablename = 'X';`
- [ ] Verify policy exists: `SELECT * FROM pg_policies WHERE tablename = 'X' AND cmd = 'Y';`
- [ ] Check user's organization: `SELECT get_user_organization_id(auth.uid());`
- [ ] Verify foreign keys are valid
- [ ] Test as actual user with `SET ROLE authenticated;`
- [ ] Check if project membership exists (for project-scoped resources)
- [ ] Verify trigger functions are working (for auto-added members)

---

## 📝 Policy Templates

### Organization-Scoped Resource
```sql
-- SELECT
CREATE POLICY "Users can view [resource] in their organization"
  ON table_name FOR SELECT
  USING (organization_id = get_user_organization_id(auth.uid()));

-- INSERT
CREATE POLICY "Users can create [resource] in their organization"
  ON table_name FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- UPDATE
CREATE POLICY "Organization members can update [resource]"
  ON table_name FOR UPDATE
  USING (organization_id = get_user_organization_id(auth.uid()));

-- DELETE
CREATE POLICY "Organization members can delete [resource]"
  ON table_name FOR DELETE
  USING (organization_id = get_user_organization_id(auth.uid()));
```

### Creator-Owned Resource
```sql
-- SELECT (view all in org)
CREATE POLICY "Users can view [resource]"
  ON table_name FOR SELECT
  USING (
    created_by = auth.uid() 
    OR organization_id = get_user_organization_id(auth.uid())
  );

-- INSERT
CREATE POLICY "Users can create [resource]"
  ON table_name FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- UPDATE
CREATE POLICY "Users can update [resource] they created"
  ON table_name FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- DELETE
CREATE POLICY "Users can delete [resource] they created"
  ON table_name FOR DELETE
  USING (created_by = auth.uid());
```

### Project-Scoped Resource
```sql
-- SELECT
CREATE POLICY "Users can view [resource] in their projects"
  ON table_name FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid()
    )
  );

-- INSERT
CREATE POLICY "Users can create [resource] in their projects"
  ON table_name FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = auth.uid()
    )
  );
```

---

## 🔐 Security Principles

1. **Default Deny**: If no policy allows an operation, it's denied
2. **Policies are OR'd**: Any matching policy grants access
3. **USING vs WITH CHECK**:
   - `USING`: Which existing rows can be seen/modified
   - `WITH CHECK`: Whether new/updated rows are allowed
4. **SECURITY DEFINER**: Helper functions run with elevated privileges
5. **Organization Isolation**: Primary security boundary

---

## 📞 Support Resources

- Full Documentation: `docs/row-level-security-policies.md`
- Database Connection: `docs/database-connection-guide.md`
- Migration Scripts: `scripts/` directory
- Supabase Docs: https://supabase.com/docs/guides/auth/row-level-security

---

**Quick Access Commands**:
```bash
# View all policies
psql -c "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public';"

# Check specific table
psql -c "\d+ table_name"

# Test as user
psql -c "SET request.jwt.claims TO '{\"sub\": \"USER_ID\"}'; SET ROLE authenticated; SELECT * FROM table_name LIMIT 1;"
```

