# Database Connection Guide

This document explains how to connect to the Supabase PostgreSQL database for running SQL scripts, testing, and managing the LIMS application.

---

## 📋 Table of Contents

1. [Connection Methods](#connection-methods)
2. [Connection Details](#connection-details)
3. [Using psql (Command Line)](#using-psql-command-line)
4. [Common Database Operations](#common-database-operations)
5. [Running Migration Scripts](#running-migration-scripts)
6. [Troubleshooting](#troubleshooting)

---

## Connection Methods

There are three ways to connect to the database:

1. **Supabase Dashboard (Recommended for beginners)**
2. **psql Command Line (Recommended for developers)**
3. **pgAdmin or other GUI tools**

---

## Connection Details

### Direct Connection (Recommended)

```
Host:     db.rutcjpugsrfoobsrufnn.supabase.co
Port:     5432
Database: postgres
User:     postgres
Password: [Your Supabase Password]
```

### Pooler Connection (For high-concurrency apps)

```
Host:     aws-0-ap-south-1.pooler.supabase.com
Port:     6543
Database: postgres
User:     postgres.rutcjpugsrfoobsrufnn
Password: [Your Supabase Password]
```

> **Note:** Use the **Direct Connection** for running scripts and migrations. Use the **Pooler** for application connections.

---

## Using psql (Command Line)

### Prerequisites

Install PostgreSQL client:

```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Windows
# Download from https://www.postgresql.org/download/windows/
```

### Basic Connection

```bash
PGPASSWORD='YourPassword' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres
```

### Connection from Project Root

```bash
cd /Users/nithin/Developer/Apps/fills/notes9-prototype

PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres
```

---

## Common Database Operations

### 1. Run a Single SQL Query

```bash
PGPASSWORD='YourPassword' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c "SELECT * FROM projects LIMIT 5;"
```

### 2. Run a SQL File

```bash
PGPASSWORD='YourPassword' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f scripts/001_create_tables.sql
```

### 3. Run Inline SQL (Multi-line)

```bash
PGPASSWORD='YourPassword' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Your SQL commands here
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

EOF
```

### 4. Interactive Mode

```bash
PGPASSWORD='YourPassword' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres
```

Once connected, you can run SQL commands interactively:

```sql
-- List all tables
\dt

-- Describe a table
\d projects

-- Run queries
SELECT * FROM projects;

-- Exit
\q
```

---

## Running Migration Scripts

### Order of Execution

Run scripts in numerical order:

```bash
cd /Users/nithin/Developer/Apps/fills/notes9-prototype

# 1. Create tables
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f scripts/001_create_tables.sql

# 2. Enable RLS
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f scripts/002_enable_rls.sql

# 3. Seed data (optional)
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f scripts/003_seed_data.sql

# Continue with other scripts...
```

### Run All Scripts at Once

```bash
cd /Users/nithin/Developer/Apps/fills/notes9-prototype

for script in scripts/*.sql; do
  echo "Running $script..."
  PGPASSWORD='Pournami@123' psql \
    -h db.rutcjpugsrfoobsrufnn.supabase.co \
    -p 5432 \
    -U postgres \
    -d postgres \
    -f "$script"
  echo "✓ Completed $script"
  echo ""
done
```

---

## Useful psql Commands

Once connected to the database:

```sql
-- List all databases
\l

-- List all tables in current database
\dt

-- List all tables with details
\dt+

-- Describe a specific table
\d table_name

-- List all schemas
\dn

-- List all functions
\df

-- List all views
\dv

-- List all RLS policies
\d+ table_name

-- Show current user
SELECT current_user;

-- Show current database
SELECT current_database();

-- Show all RLS policies for a table
SELECT * FROM pg_policies WHERE tablename = 'projects';

-- Check table size
SELECT 
    schemaname as schema,
    tablename as table,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Exit psql
\q
```

---

## Testing Database Permissions

### Test RLS Policies

```bash
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Check all RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

EOF
```

### Test User Permissions

```bash
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Test as authenticated user
SET ROLE authenticated;
SET request.jwt.claim.sub TO 'user-uuid-here';

-- Try operations
SELECT * FROM projects;

-- Reset
RESET ROLE;

EOF
```

---

## Example: Common Tasks

### 1. Add New RLS Policy

```bash
cd /Users/nithin/Developer/Apps/fills/notes9-prototype

PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Add new policy
CREATE POLICY "policy_name"
  ON table_name
  FOR SELECT
  USING (condition);

EOF
```

### 2. Update Existing Table

```bash
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Add column
ALTER TABLE projects ADD COLUMN new_field TEXT;

-- Update values
UPDATE projects SET new_field = 'default_value';

EOF
```

### 3. Backup Database

```bash
# Backup entire database
PGPASSWORD='Pournami@123' pg_dump \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F c \
  -f backup_$(date +%Y%m%d_%H%M%S).dump

# Backup specific table
PGPASSWORD='Pournami@123' pg_dump \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -t projects \
  > projects_backup.sql
```

---

## Troubleshooting

### Connection Issues

**Problem:** "connection refused" or "could not connect"

```bash
# Test connectivity
ping db.rutcjpugsrfoobsrufnn.supabase.co

# Test port
nc -zv db.rutcjpugsrfoobsrufnn.supabase.co 5432
```

**Solution:**
- Check your internet connection
- Verify the host and port are correct
- Ensure your IP is whitelisted in Supabase (Project Settings → Database → Connection Pooling)

---

**Problem:** "FATAL: password authentication failed"

**Solution:**
- Verify password is correct
- Check if you're using the right user (`postgres` for direct connection)
- Reset password in Supabase Dashboard if needed

---

**Problem:** "Tenant or user not found" (when using pooler)

**Solution:**
- Use the direct connection instead
- Ensure you're using the correct format: `postgres.rutcjpugsrfoobsrufnn`

---

### RLS Policy Issues

**Problem:** "new row violates row-level security policy"

```bash
# Check policies
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -c "SELECT * FROM pg_policies WHERE tablename = 'your_table';"
```

**Solution:**
- Verify UPDATE policies have both `USING` and `WITH CHECK` clauses
- Check if user has proper permissions
- Ensure user is member of required project/organization

---

### Performance Issues

```bash
# Check slow queries
PGPASSWORD='Pournami@123' psql \
  -h db.rutcjpugsrfoobsrufnn.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres << 'EOF'

-- Enable query logging
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

EOF
```

---

## Security Best Practices

1. **Never commit passwords to git**
   - Use environment variables
   - Add `.env` to `.gitignore`

2. **Use connection pooling in production**
   - Use Supabase pooler for app connections
   - Use direct connection for migrations only

3. **Rotate passwords regularly**
   - Update in Supabase Dashboard
   - Update in your `.env.local` file

4. **Limit database access**
   - Use RLS policies for all tables
   - Grant minimum required permissions
   - Use service role key only when necessary

---

## Quick Reference

### Environment Variables

Add to `.env.local`:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://rutcjpugsrfoobsrufnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Database Connection (for scripts only, not for app)
DB_HOST=db.rutcjpugsrfoobsrufnn.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=Pournami@123
DB_NAME=postgres
```

### Connection String Format

```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]

# Example:
postgresql://postgres:Pournami@123@db.rutcjpugsrfoobsrufnn.supabase.co:5432/postgres
```

---

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [psql Command Reference](https://www.postgresql.org/docs/current/app-psql.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Last Updated:** 2025-01-21  
**Database:** Supabase PostgreSQL  
**Project:** LIMS (Laboratory Inventory Management System)

