---
title: Database Connection Guide
created: 2026-06-24
updated: 2026-06-24
status: current
---

# Database Connection Guide

This guide explains how to connect to the Notes9 Supabase PostgreSQL database for running SQL scripts, migrations, and diagnostics.

> **Note:** The connection details below use placeholder values. Never commit real passwords or keys to version control. Store them in `.env.local` and consult a team member or your Supabase project dashboard for live credentials.

---

## Connection Methods

| Method | Best For |
|--------|----------|
| **Supabase Dashboard SQL Editor** | Quick queries, one-off operations, beginners |
| **`psql` (command line)** | Running migrations, scripted operations, CI |
| **pgAdmin / TablePlus** | Visual exploration, complex query authoring |

---

## Connection Details

### Direct Connection (use for migrations and scripts)

```
Host:     db.<project-ref>.supabase.co
Port:     5432
Database: postgres
User:     postgres
Password: [Your Supabase DB password]
```

### Pooler Connection (use for application connections)

```
Host:     aws-0-<region>.pooler.supabase.com
Port:     6543
Database: postgres
User:     postgres.<project-ref>
Password: [Your Supabase DB password]
```

**Rule of thumb:** Use Direct for scripts/migrations. Use Pooler for the running app. The app itself connects via the Supabase JS client (anon key / service role key), not psql.

---

## Prerequisites

```bash
# macOS
brew install postgresql

# Ubuntu / Debian
sudo apt-get install postgresql-client

# Windows: download from https://www.postgresql.org/download/windows/
```

---

## Basic psql Connection

```bash
PGPASSWORD='<your-db-password>' psql \
  -h db.<project-ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres
```

---

## Common Operations

### Run a single query

```bash
PGPASSWORD='<password>' psql \
  -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;"
```

### Run a SQL file

```bash
PGPASSWORD='<password>' psql \
  -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
  -f scripts/000_full_script.sql
```

### Run a heredoc (inline multi-line SQL)

```bash
PGPASSWORD='<password>' psql \
  -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres << 'EOF'

SELECT * FROM projects LIMIT 5;

EOF
```

---

## Running Migrations

Migrations live in `scripts/`. The baseline schema is `scripts/000_full_script.sql`. Incremental migrations are numbered `001_...`, `002_...`, etc.

**Always apply in order:**

```bash
for script in scripts/*.sql; do
  echo "Running $script ..."
  PGPASSWORD='<password>' psql \
    -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
    -f "$script"
  echo "Done: $script"
done
```

> **Before writing any new migration:** read `scripts/000_full_script.sql` and all existing numbered migrations to understand the current schema. Never infer column names, FK names, or policy names from memory.

---

## Useful psql Commands (interactive mode)

```sql
\dt           -- list all tables
\dt+          -- list with sizes
\d table_name -- describe table (columns, indexes)
\d+ table_name -- also shows RLS policies
\dn           -- list schemas
\df           -- list functions
\dv           -- list views

SELECT current_user;
SELECT current_database();

-- Check RLS policies on a specific table
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'projects';

-- Check table sizes
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

\q            -- exit
```

---

## Testing RLS Policies

To simulate a specific user without leaving the postgres superuser:

```sql
-- Simulate an authenticated user
SET ROLE authenticated;
SET request.jwt.claims TO '{"sub": "your-user-uuid", "role": "authenticated"}';

SELECT * FROM projects;   -- should only return rows the user is allowed to see

RESET ROLE;               -- return to postgres superuser
```

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `connection refused` | Wrong host or port | Re-check host from Supabase Dashboard → Settings → Database |
| `FATAL: password authentication failed` | Wrong password | Reset in Dashboard or check `.env.local` |
| `Tenant or user not found` (pooler) | Wrong user format | Use `postgres.<project-ref>` for pooler user |
| `new row violates row-level security policy` | RLS check fails | Check UPDATE policy has `USING` + `WITH CHECK`; confirm user is org member |

### Check slow queries

```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Environment Variables (app)

These go in `.env.local` for the Next.js app. **Do not commit real values.**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_JWT_SECRET=<jwt-secret>
```

The DB password is only needed for direct psql/migration work, not for the running app.

---

## Security Best Practices

1. Never commit passwords or service role keys to git.
2. Use Direct Connection for migrations only; use the Pooler (or the JS client) for application connections.
3. Enable RLS on every table — see `docs/row-level-security-policies.md` and `docs/rls-quick-reference.md`.
4. Use `SUPABASE_SERVICE_ROLE_KEY` only in server-side code (never in client bundles).
5. Rotate passwords periodically via Supabase Dashboard.

---

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [psql Command Reference](https://www.postgresql.org/docs/current/app-psql.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- Notes9 RLS reference: `docs/row-level-security-policies.md` and `docs/rls-quick-reference.md`
