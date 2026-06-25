# Database Connection Guide

This document explains how to connect to the Supabase PostgreSQL database for running SQL scripts, testing, and managing the LIMS application.

## 📋 Table of Contents

- [Connection Methods](#eg6i8sin5zxx)
- [Connection Details](#wf2r0abwcpzj)
- [Using psql (Command Line)](#510ddlp0jx)
- [Common Database Operations](#vcp7uhgsz22t)
- [Running Migration Scripts](#sl4yee2uqqon)
- [Troubleshooting](#gcw6zx42ok3y)

## Connection Methods

There are three ways to connect to the database:

- **Supabase Dashboard (Recommended for beginners)**
- **psql Command Line (Recommended for developers)**
- **pgAdmin or other GUI tools**

## Connection Details

### Direct Connection (Recommended)

Host: db.rutcjpugsrfoobsrufnn.supabase.co  
Port: 5432  
Database: postgres  
User: postgres  
Password: \[Your Supabase Password\]  

### Pooler Connection (For high-concurrency apps)

Host: aws-0-ap-south-1.pooler.supabase.com  
Port: 6543  
Database: postgres  
User: postgres.rutcjpugsrfoobsrufnn  
Password: \[Your Supabase Password\]  

**Note:** Use the **Direct Connection** for running scripts and migrations. Use the **Pooler** for application connections.

## Using psql (Command Line)

### Prerequisites

Install PostgreSQL client:

\# macOS  
brew install postgresql  
<br/>\# Ubuntu/Debian  
sudo apt-get install postgresql-client  
<br/>\# Windows  
\# Download from <https://www.postgresql.org/download/windows/>  

### Basic Connection

PGPASSWORD='YourPassword' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres  

### Connection from Project Root

cd /Users/nithin/Developer/Apps/fills/notes9-prototype  
<br/>PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres  

## Common Database Operations

### 1\. Run a Single SQL Query

PGPASSWORD='YourPassword' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-c "SELECT \* FROM projects LIMIT 5;"  

### 2\. Run a SQL File

PGPASSWORD='YourPassword' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-f scripts/001_create_tables.sql  

### 3\. Run Inline SQL (Multi-line)

PGPASSWORD='YourPassword' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Your SQL commands here  
SELECT table_name  
FROM information_schema.tables  
WHERE table_schema = 'public';  
<br/>EOF  

### 4\. Interactive Mode

PGPASSWORD='YourPassword' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres  

Once connected, you can run SQL commands interactively:

\-- List all tables  
\\dt  
<br/>\-- Describe a table  
\\d projects  
<br/>\-- Run queries  
SELECT \* FROM projects;  
<br/>\-- Exit  
\\q  

## Running Migration Scripts

### Order of Execution

Run scripts in numerical order:

cd /Users/nithin/Developer/Apps/fills/notes9-prototype  
<br/>\# 1. Create tables  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-f scripts/001_create_tables.sql  
<br/>\# 2. Enable RLS  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-f scripts/002_enable_rls.sql  
<br/>\# 3. Seed data (optional)  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-f scripts/003_seed_data.sql  
<br/>\# Continue with other scripts...  

### Run All Scripts at Once

cd /Users/nithin/Developer/Apps/fills/notes9-prototype  
<br/>for script in scripts/\*.sql; do  
echo "Running \$script..."  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-f "\$script"  
echo "✓ Completed \$script"  
echo ""  
done  

## Useful psql Commands

Once connected to the database:

\-- List all databases  
\\l  
<br/>\-- List all tables in current database  
\\dt  
<br/>\-- List all tables with details  
\\dt+  
<br/>\-- Describe a specific table  
\\d table_name  
<br/>\-- List all schemas  
\\dn  
<br/>\-- List all functions  
\\df  
<br/>\-- List all views  
\\dv  
<br/>\-- List all RLS policies  
\\d+ table_name  
<br/>\-- Show current user  
SELECT current_user;  
<br/>\-- Show current database  
SELECT current_database();  
<br/>\-- Show all RLS policies for a table  
SELECT \* FROM pg_policies WHERE tablename = 'projects';  
<br/>\-- Check table size  
SELECT  
schemaname as schema,  
tablename as table,  
pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size  
FROM pg_tables  
WHERE schemaname = 'public'  
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;  
<br/>\-- Exit psql  
\\q  

## Testing Database Permissions

### Test RLS Policies

PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Check all RLS policies  
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
<br/>EOF  

### Test User Permissions

PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Test as authenticated user  
SET ROLE authenticated;  
SET request.jwt.claim.sub TO 'user-uuid-here';  
<br/>\-- Try operations  
SELECT \* FROM projects;  
<br/>\-- Reset  
RESET ROLE;  
<br/>EOF  

## Example: Common Tasks

### 1\. Add New RLS Policy

cd /Users/nithin/Developer/Apps/fills/notes9-prototype  
<br/>PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Add new policy  
CREATE POLICY "policy_name"  
ON table_name  
FOR SELECT  
USING (condition);  
<br/>EOF  

### 2\. Update Existing Table

PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Add column  
ALTER TABLE projects ADD COLUMN new_field TEXT;  
<br/>\-- Update values  
UPDATE projects SET new_field = 'default_value';  
<br/>EOF  

### 3\. Backup Database

\# Backup entire database  
PGPASSWORD='Pournami@123' pg_dump \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-F c \\  
\-f backup_\$(date +%Y%m%d_%H%M%S).dump  
<br/>\# Backup specific table  
PGPASSWORD='Pournami@123' pg_dump \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-t projects \\  
\> projects_backup.sql  

## Troubleshooting

### Connection Issues

**Problem:** "connection refused" or "could not connect"

\# Test connectivity  
ping db.rutcjpugsrfoobsrufnn.supabase.co  
<br/>\# Test port  
nc -zv db.rutcjpugsrfoobsrufnn.supabase.co 5432  

**Solution:**

- Check your internet connection
- Verify the host and port are correct
- Ensure your IP is whitelisted in Supabase (Project Settings → Database → Connection Pooling)

**Problem:** "FATAL: password authentication failed"

**Solution:**

- Verify password is correct
- Check if you're using the right user (postgres for direct connection)
- Reset password in Supabase Dashboard if needed

**Problem:** "Tenant or user not found" (when using pooler)

**Solution:**

- Use the direct connection instead
- Ensure you're using the correct format: postgres.rutcjpugsrfoobsrufnn

### RLS Policy Issues

**Problem:** "new row violates row-level security policy"

\# Check policies  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres \\  
\-c "SELECT \* FROM pg_policies WHERE tablename = 'your_table';"  

**Solution:**

- Verify UPDATE policies have both USING and WITH CHECK clauses
- Check if user has proper permissions
- Ensure user is member of required project/organization

### Performance Issues

\# Check slow queries  
PGPASSWORD='Pournami@123' psql \\  
\-h db.rutcjpugsrfoobsrufnn.supabase.co \\  
\-p 5432 \\  
\-U postgres \\  
\-d postgres << 'EOF'  
<br/>\-- Enable query logging  
SELECT \* FROM pg_stat_statements  
ORDER BY mean_exec_time DESC  
LIMIT 10;  
<br/>EOF  

## Quick Reference

### Environment Variables

Add to .env.local:

\# Supabase Configuration  
NEXT_PUBLIC_SUPABASE_URL=<https://rutcjpugsrfoobsrufnn.supabase.co>  
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here  
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here  
<br/>\# Database Connection (for scripts only, not for app)  
DB_HOST=db.rutcjpugsrfoobsrufnn.supabase.co  
DB_PORT=5432  
DB_USER=postgres  
DB_PASSWORD=Pournami@123  
DB_NAME=postgres  

### Connection String Format

postgresql://\[USER\]:\[PASSWORD\]@\[HOST\]:\[PORT\]/\[DATABASE\]  
<br/>\# Example:  
postgresql://postgres:Pournami@<123@db.rutcjpugsrfoobsrufnn.supabase.co>:5432/postgres  

## Additional Resources

- [Supabase CLI Documentation](https://supabase.com/docs/guides/cli)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [psql Command Reference](https://www.postgresql.org/docs/current/app-psql.html)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)