# Oxford University Integration - Technical Discussion Preparation Guide

**Last Updated:** January 13, 2026  
**Application:** Notes9 - Laboratory Information Management System (LIMS)  
**Developer Level:** Junior/Mid-Level (Comprehensive Explanations Included)

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Your Application Overview](#your-application-overview)
3. [Critical Questions You'll Be Asked](#critical-questions-youll-be-asked)
4. [Integration Architecture Options](#integration-architecture-options)
5. [Authentication & Authorization](#authentication--authorization)
6. [Security & Compliance](#security--compliance)
7. [Data Management](#data-management)
8. [Infrastructure & Hosting](#infrastructure--hosting)
9. [Performance & Scalability](#performance--scalability)
10. [Maintenance & Support](#maintenance--support)
11. [Technical Deep-Dive: Your Codebase](#technical-deep-dive-your-codebase)
12. [Red Flags & Risk Areas](#red-flags--risk-areas)
13. [Questions You Should Ask Them](#questions-you-should-ask-them)
14. [Glossary of Terms](#glossary-of-terms)

---

## 📌 Executive Summary

### What is Notes9?
Notes9 is a **full-stack web application** for scientific research labs to manage:
- Lab experiments and protocols
- Sample inventory and equipment
- Research documentation and notes
- Team collaboration
- AI-assisted research support

### Current Technology Stack
```
Frontend:  Next.js 16 (React 19.2.0)
Backend:   Next.js API Routes (Server-side)
Database:  Supabase (PostgreSQL with Row Level Security)
Auth:      Supabase Auth (email/password)
Styling:   Tailwind CSS v4
AI:        Google Gemini API + Vercel AI SDK
Hosting:   (Currently local development - needs deployment plan)
```

---

## 🏗️ Your Application Overview

### Architecture Pattern
Your app follows a **modern serverless architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                       │
│  (Next.js React App - runs in user's browser)          │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTPS
                    ▼
┌─────────────────────────────────────────────────────────┐
│               NEXT.JS SERVER (Node.js)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  API Routes (Your Backend)                       │  │
│  │  - /api/chat (AI chat)                          │  │
│  │  - /api/context (fetch experiment data)         │  │
│  │  - /api/files (file uploads)                    │  │
│  │  - /api/search-papers (literature search)       │  │
│  └──────────────────────────────────────────────────┘  │
└───────────┬────────────────────────┬────────────────────┘
            │                        │
            │                        │
            ▼                        ▼
  ┌─────────────────┐      ┌─────────────────────┐
  │  SUPABASE       │      │  GOOGLE GEMINI API  │
  │  (Database)     │      │  (AI Service)       │
  │  - PostgreSQL   │      │                     │
  │  - File Storage │      │                     │
  │  - Auth         │      │                     │
  └─────────────────┘      └─────────────────────┘
```

**Simple Explanation:**
- **Frontend (Client):** The user interface users see and interact with
- **Backend (Server):** Your API routes that process requests and talk to databases
- **Database:** Where all lab data is stored (experiments, samples, users)
- **AI Service:** External service for AI assistant features

---

## ❓ Critical Questions You'll Be Asked

### CATEGORY 1: Integration Method

#### Question 1.1: "How do you envision this being integrated into our portal?"

**What They're Really Asking:**  
Do you want to embed your app inside their existing website (like a widget), or will it be a standalone application that users access separately?

**Your Answer Options:**

**Option A: Embedded (iFrame)**
```html
<!-- Your app lives inside their portal -->
<iframe src="https://notes9.yourdomain.com" 
        width="100%" 
        height="100%"
        sandbox="allow-same-origin allow-scripts">
</iframe>
```
- **Pros:** Seamless user experience, appears integrated
- **Cons:** Limited screen space, potential security restrictions, harder to debug

**Option B: Standalone with SSO**
```
Their Portal → Click "Lab Notes" → Opens notes9.yourdomain.com
                                   (User automatically logged in via SSO)
```
- **Pros:** Full control, better performance, easier development
- **Cons:** Requires separate domain, users leave main portal

**Option C: API Integration Only**
```
Their System → Calls your API → Gets/Sends data
                                (No UI from your side)
```
- **Pros:** Most flexible, they build their own UI
- **Cons:** Requires exposing all functionality via API

**RECOMMENDED:** Start with **Option B (Standalone with SSO)** - it's the most practical.

---

#### Question 1.2: "Does your application support Single Sign-On (SSO)?"

**What They're Really Asking:**  
Can Oxford users log into your app using their Oxford credentials, or do they need to create separate accounts?

**Current State:**  
❌ **NO** - You currently use Supabase email/password authentication only

**What You Need:**  
✅ Implement **SAML 2.0** or **OAuth 2.0 / OpenID Connect** authentication

**Oxford Likely Uses:**
- **Shibboleth** (a SAML-based SSO system common in UK universities)
- **Oxford Single Sign-On (SSO)** service
- Federation: UK Access Management Federation

**Technical Implementation Required:**
```typescript
// Current: lib/supabase/middleware.ts
const { data: { user } } = await supabase.auth.getUser()

// Need to add: SAML authentication provider
import { SAMLAuth } from '@boxyhq/saml-jackson'; // Example library

// OR integrate with Supabase SAML SSO (paid feature)
const { data, error } = await supabase.auth.signInWithSSO({
  domain: 'ox.ac.uk',
  options: {
    redirectTo: 'https://your-app.com/auth/callback'
  }
})
```

**Key Terms to Know:**
- **SAML:** Security Assertion Markup Language - protocol for SSO
- **Identity Provider (IdP):** Oxford's authentication system
- **Service Provider (SP):** Your application
- **Metadata Exchange:** XML files exchanged between IdP and SP to configure trust

**What Oxford Will Provide:**
1. **IdP Metadata URL** - e.g., `https://shibboleth.ox.ac.uk/metadata.xml`
2. **Entity ID** - Unique identifier for Oxford's IdP
3. **SSO URL** - Where to redirect users for authentication
4. **Attribute Mappings** - What user data they'll send (email, name, department)

**What You Need to Provide:**
1. **SP Metadata URL** - Your app's SAML configuration
2. **Assertion Consumer Service (ACS) URL** - Where Oxford sends auth responses
3. **Entity ID** - Your app's unique identifier
4. **Certificate** - For signing/encryption (x.509 certificate)

---

### CATEGORY 2: Authentication & User Management

#### Question 2.1: "How do you handle user provisioning and deprovisioning?"

**What They're Really Asking:**  
When an Oxford researcher joins or leaves, how do you create/delete their account?

**Options:**

**A. Just-In-Time (JIT) Provisioning (RECOMMENDED)**
```typescript
// User logs in via SSO → Your app automatically creates account
async function handleSAMLCallback(samlResponse) {
  const { email, firstName, lastName, department } = parseSAML(samlResponse);
  
  // Check if user exists
  const existingUser = await supabase
    .from('profiles')
    .select()
    .eq('email', email)
    .single();
  
  if (!existingUser) {
    // Auto-create user on first login
    await supabase.from('profiles').insert({
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'researcher',
      organization_id: OXFORD_ORG_ID
    });
  }
  
  // Log them in
  return createSession(email);
}
```

**B. SCIM Provisioning (Advanced)**
- System for Cross-domain Identity Management
- Oxford pushes user changes to your API
- More complex but better for large deployments

**C. Manual Provisioning**
- Oxford sends you a list of users to create
- Not scalable, not recommended

---

#### Question 2.2: "How do you handle organization/department isolation?"

**What They're Really Asking:**  
Can different Oxford departments use your app without seeing each other's data?

**Your Current Implementation:**  
✅ **GOOD!** You already have this via **Row Level Security (RLS)**

**Explanation:**
```sql
-- Your existing code: scripts/002_enable_rls.sql

-- Users can only see data from their organization
CREATE POLICY "Users can view projects in their organization"
  ON projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**What This Means:**
- Each user has an `organization_id` in their profile
- Database automatically filters ALL queries to only show data for their organization
- Even if you accidentally write bad code, users can't access other orgs' data

**Oxford Setup:**
```typescript
// Map Oxford departments to organizations
const OXFORD_DEPARTMENTS = {
  'chemistry': { org_id: 'uuid-chem-dept' },
  'biology': { org_id: 'uuid-bio-dept' },
  'physics': { org_id: 'uuid-physics-dept' }
};

// On user creation, assign to correct org
const userDepartment = samlResponse.attributes.department;
const organizationId = OXFORD_DEPARTMENTS[userDepartment].org_id;
```

---

### CATEGORY 3: Security & Compliance

#### Question 3.1: "What security certifications do you have?"

**What They're Really Asking:**  
Have you been audited for security? Do you comply with standards?

**Your Current State:**  
❌ None (you're a prototype)

**What They Expect (for production):**
- **ISO 27001** - Information Security Management
- **SOC 2 Type II** - Service Organization Controls
- **Cyber Essentials Plus** (UK-specific)
- **GDPR Compliance** - EU data protection

**Your Answer:**
> "Notes9 is currently in prototype phase. For production deployment, we would undergo:
> 1. Security audit by certified third party
> 2. Penetration testing
> 3. GDPR compliance review
> 4. ISO 27001 certification process
> We follow security best practices including encrypted data transmission (HTTPS), database-level encryption at rest, Row Level Security for data isolation, and secure authentication flows."

---

#### Question 3.2: "Where is data stored and who has access?"

**Current State:**
```
Database:     Supabase (AWS infrastructure, EU/US regions)
File Storage: Supabase Storage (S3-compatible)
Backups:      Supabase automated daily backups
```

**They Want to Know:**
1. **Data Residency:** Is data stored in UK/EU or overseas?
   - **Answer:** Currently US region, can be changed to EU
   
2. **Data Ownership:** Who owns the data?
   - **Answer:** Client (Oxford) owns all research data
   
3. **Data Access:** Who can access the database?
   - **Answer:** Only authorized admins via secured connections
   
4. **Encryption:**
   - **At Rest:** ✅ Supabase encrypts stored data (AES-256)
   - **In Transit:** ✅ HTTPS/TLS 1.3
   - **Application Level:** ⚠️ Not implemented (you don't encrypt fields)

5. **Backup & Recovery:**
   - **Answer:** Daily automated backups, 7-day retention (Supabase default)

---

#### Question 3.3: "How do you handle sensitive research data?"

**What They're Really Asking:**  
Is your app suitable for confidential research, patient data, or commercially sensitive information?

**Your Current Capabilities:**

✅ **Have:**
- Database-level encryption
- Row Level Security (users can't see each other's data)
- HTTPS for all connections
- Authentication required for all data access

❌ **Don't Have:**
- Field-level encryption (encrypting specific columns like hypotheses)
- Audit logging (tracking who accessed what data)
- Data Loss Prevention (DLP)
- Compliance with HIPAA, GxP (pharmaceutical), or similar

**Classification System You Should Propose:**
```typescript
// Add to experiments table
data_classification: 'public' | 'internal' | 'confidential' | 'restricted'

// Implement additional controls based on classification
if (experiment.data_classification === 'restricted') {
  // Require 2FA
  // Log all access
  // Encrypt specific fields
  // Disable exports
}
```

---

#### Question 3.4: "What about GDPR compliance?"

**What is GDPR?**  
General Data Protection Regulation - EU law about personal data protection

**Your Compliance Status:**

✅ **Already Compliant (mostly):**
1. **Data Minimization:** You only collect necessary data
2. **Purpose Limitation:** Clear purpose (lab management)
3. **User Consent:** Users create accounts willingly
4. **Security:** Database encryption, RLS
5. **Data Portability:** Users can export data (via API)

⚠️ **Need to Add:**
1. **Privacy Policy** - Explain data collection
2. **Cookie Consent** - If you use analytics
3. **Right to Deletion** - API to delete user and all their data
4. **Data Processing Agreement (DPA)** - Contract with Oxford
5. **Data Breach Notification** - Process for reporting breaches within 72h

**Implementation:**
```typescript
// app/api/gdpr/delete-user/route.ts
export async function DELETE(req: Request) {
  const { userId } = await req.json();
  
  // Verify user consent and identity
  // ...
  
  // Delete all user data
  await supabase.from('profiles').delete().eq('id', userId);
  // Cascade deletes will remove experiments, notes, etc.
  
  // Log deletion for audit
  await logGDPRRequest('deletion', userId);
  
  return new Response('User data deleted', { status: 200 });
}
```

---

### CATEGORY 4: Data Management

#### Question 4.1: "What data formats do you support for import/export?"

**Your Current Capabilities:**

**File Upload (via `/api/files/route.ts`):**
- Accepts: ANY file type
- Storage: Supabase Storage buckets
- Associated with: experiments, protocols, samples

**File Types Used in Your Test Files:**
```
test-files/
├── experiment-data.json      # JSON data
├── sample-data.csv           # Tabular data
├── experiment-protocol.pdf   # Documents
├── lab-notes.txt            # Text
├── sequencing-data.fasta    # Bioinformatics
├── analysis-results.xml     # Structured data
├── gel-electrophoresis.jpg  # Images
└── microscope-image.png     # Images
```

**Export Capabilities:**
```typescript
// You have: app/api/export-docx/route.ts
// Exports: Lab notes to Microsoft Word (.docx)
// Missing: CSV export, JSON export, PDF reports
```

**What Oxford Will Ask:**

1. **"Can you export to our institutional repository format?"**
   - You'll need to ask what format (likely XML-based like METS/MODS)

2. **"Can you import from our existing LIMS?"**
   - Need to know their current system (LabWare, Thermo Fisher, etc.)
   - Probably CSV or database direct connection

3. **"Do you support bulk operations?"**
   - Currently: ❌ No batch import
   - Need to add: Bulk upload CSV of samples, experiments, etc.

---

#### Question 4.2: "How do you handle data versioning?"

**What They're Really Asking:**  
If a researcher edits an experiment note, can you see the history?

**Your Current State:**  
❌ **NO VERSIONING** - Edits overwrite previous data

**Example of the Problem:**
```sql
-- User edits experiment hypothesis
UPDATE experiments 
SET hypothesis = 'New hypothesis' 
WHERE id = 'experiment-123';

-- Old hypothesis is LOST FOREVER!
```

**What You Should Implement:**

**Option A: Audit Log (Partial versioning)**
```sql
-- Your existing table: audit_log
-- Currently unused! Should be populated via triggers:

CREATE TRIGGER track_experiment_changes
BEFORE UPDATE ON experiments
FOR EACH ROW
EXECUTE FUNCTION log_changes();

-- Function to store old values
CREATE FUNCTION log_changes() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    user_id
  ) VALUES (
    TG_TABLE_NAME,
    NEW.id,
    'update',
    to_jsonb(OLD),
    to_jsonb(NEW),
    auth.uid()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Option B: Full Versioning (Git-like)**
```sql
-- Store every version as a new row
CREATE TABLE experiment_versions (
  id UUID PRIMARY KEY,
  experiment_id UUID,
  version_number INTEGER,
  hypothesis TEXT,
  methodology TEXT,
  -- ... all fields ...
  created_at TIMESTAMPTZ,
  created_by UUID
);

-- Current version points to latest
experiments.current_version_id → experiment_versions.id
```

---

#### Question 4.3: "What's your data retention policy?"

**What They're Really Asking:**  
How long do you keep data? Can users delete data? What happens when a project ends?

**Your Current State:**  
⚠️ **NO POLICY** - Data stays forever

**What Oxford Needs:**

1. **Active Projects:** Retain indefinitely
2. **Completed Projects:** Retain for X years (e.g., 7 years for regulatory)
3. **Deleted Data:** Soft delete (mark as deleted) vs Hard delete (remove completely)

**Implement Soft Deletes:**
```sql
-- Add to all tables
ALTER TABLE experiments ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN deleted_at TIMESTAMPTZ;

-- Modify RLS policies to exclude soft-deleted
CREATE POLICY "Users can view non-deleted projects"
  ON projects FOR SELECT
  USING (
    deleted_at IS NULL AND
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Scheduled job to hard-delete after retention period
CREATE FUNCTION cleanup_old_data() RETURNS void AS $$
BEGIN
  DELETE FROM projects 
  WHERE deleted_at < NOW() - INTERVAL '7 years';
END;
$$ LANGUAGE plpgsql;
```

---

### CATEGORY 5: Infrastructure & Deployment

#### Question 5.1: "Where will this be hosted?"

**Your Current State:**  
⚠️ **DEVELOPMENT ONLY** - Running on localhost

**Deployment Options:**

**Option A: You Host (SaaS Model)**
```
Pros:
- You control everything
- Easier updates
- Shared infrastructure = lower cost

Cons:
- Oxford doesn't control their data
- May not meet their security requirements
- Requires your 24/7 support

Recommended Platform: Vercel (optimized for Next.js)
Estimated Cost: $20-200/month depending on usage
```

**Option B: Oxford Hosts (On-Premise)**
```
Pros:
- Oxford controls data completely
- Meets strictest security requirements
- No external dependencies

Cons:
- Oxford needs to manage infrastructure
- Requires Docker/Kubernetes knowledge
- Harder to update
- You need to provide deployment package

Deployment Requirements:
1. Docker container or VM image
2. Database setup scripts
3. Environment configuration guide
4. Monitoring setup
```

**Option C: Oxford's Cloud (Hybrid)**
```
Pros:
- Oxford controls but in cloud
- Scalable
- Reduced Oxford IT burden

Cons:
- Need to support their cloud (AWS/Azure/GCP)
- Integration with their cloud services

Platform: Likely AWS (common in academia)
```

---

#### Question 5.2: "What are your infrastructure requirements?"

**Your Application Needs:**

**Compute (Next.js Server):**
```yaml
Minimum:
  CPU: 2 vCPU
  RAM: 4 GB
  Storage: 20 GB (for application)
  
Recommended:
  CPU: 4 vCPU
  RAM: 8 GB
  Storage: 50 GB
  Auto-scaling: Yes (2-10 instances)
```

**Database (PostgreSQL):**
```yaml
Minimum:
  CPU: 2 vCPU
  RAM: 8 GB (databases are RAM-hungry)
  Storage: 100 GB SSD
  
Recommended:
  CPU: 4 vCPU
  RAM: 16 GB
  Storage: 500 GB SSD
  Backups: Daily, 30-day retention
  Replication: 1 read replica
```

**File Storage:**
```yaml
Object Storage (S3-compatible):
  Initial: 100 GB
  Growth: ~10 GB/month per 50 active users
  Features: Encryption at rest, versioning, lifecycle policies
```

**Network:**
```yaml
Bandwidth: 1 TB/month (for 200 users)
SSL Certificate: Required (Let's Encrypt or purchased)
Domain: notes9.ox.ac.uk or lims.ox.ac.uk
```

**External Services:**
```yaml
Supabase:
  - If self-hosting: Run PostgreSQL + PostgREST + Storage
  - If using Supabase Cloud: $25-$599/month depending on scale

Google Gemini API:
  - $0.00025 per 1K characters input
  - $0.001 per 1K characters output
  - ~$50-200/month for 100 active researchers

Monitoring:
  - Application logs
  - Error tracking (Sentry - $26/month)
  - Uptime monitoring (Pingdom - $10/month)
```

---

#### Question 5.3: "How do we deploy updates?"

**Your Current State:**  
❌ **NO DEPLOYMENT PIPELINE**

**What You Need:**

**1. Containerization (Docker)**
```dockerfile
# Dockerfile (create this)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]
```

**2. CI/CD Pipeline**
```yaml
# .github/workflows/deploy.yml (create this)
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t notes9:latest .
      - name: Run tests
        run: npm test
      - name: Push to registry
        run: docker push registry.ox.ac.uk/notes9:latest
      - name: Deploy to production
        run: kubectl apply -f k8s/
```

**3. Zero-Downtime Deployment**
```
Blue-Green Deployment:
1. Deploy new version alongside old (blue=old, green=new)
2. Run health checks on new version
3. Switch traffic to new version
4. Keep old version running for 30 minutes (for rollback)
5. Shut down old version

Downtime: 0 seconds
```

**4. Database Migrations**
```typescript
// Critical: Migrations must be backward-compatible
// BAD: Dropping columns immediately
ALTER TABLE experiments DROP COLUMN old_field;

// GOOD: Gradual migration
// Step 1: Add new field
ALTER TABLE experiments ADD COLUMN new_field TEXT;

// Step 2: Migrate data
UPDATE experiments SET new_field = old_field;

// Step 3: Deploy new code that uses new_field

// Step 4: (Next release) Drop old field
ALTER TABLE experiments DROP COLUMN old_field;
```

---

### CATEGORY 6: Performance & Scalability

#### Question 6.1: "How many concurrent users can you support?"

**What They're Really Asking:**  
If 500 Oxford researchers use this simultaneously, will it crash?

**Your Current Architecture:**
```typescript
// next.config.mjs
export default {
  // No special optimization configured
  // Default Next.js handles ~100 concurrent users on modest hardware
}
```

**Bottlenecks to Consider:**

**1. Database Connections**
```sql
-- PostgreSQL default: 100 connections
-- Each Next.js instance uses ~10 connections
-- 10 instances = exhausted

-- Solution: Connection pooling
-- Supabase already does this (PgBouncer)
-- Max connections in Supabase: 60 (Pro plan) to 500 (Team plan)
```

**2. API Route Execution Time**
```typescript
// Each request has a timeout
export const maxDuration = 60; // 60 seconds max

// Problem: Long-running operations block other requests
// Solution: Background jobs for heavy operations
```

**3. File Upload Limits**
```typescript
// Default Next.js limit: 4MB
// Your needs: Lab data files can be 100MB+

// Need to increase:
// next.config.mjs
export default {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
}
```

**Scalability Targets:**

| Metric | Current | Target |
|--------|---------|--------|
| Concurrent Users | ~10 | 500+ |
| Response Time | <100ms | <200ms (p95) |
| Database Queries | Unoptimized | <50ms average |
| File Upload | 4MB | 100MB |
| API Throughput | ~10 req/s | 1000 req/s |

**How to Scale:**

1. **Horizontal Scaling** - Add more servers
2. **Database Read Replicas** - Separate read/write
3. **CDN** - Cache static assets (images, JS, CSS)
4. **Redis Cache** - Cache frequent queries
5. **Background Jobs** - Offload heavy processing

---

#### Question 6.2: "What's your API rate limiting strategy?"

**Your Current State:**  
❌ **NO RATE LIMITING** - Anyone can hammer your API

**The Problem:**
```typescript
// Malicious user or bug could do this:
for (let i = 0; i < 1000000; i++) {
  fetch('/api/chat', { method: 'POST', body: { message: 'hi' } });
}
// Your server crashes, costs explode
```

**Solution: Implement Rate Limiting**
```typescript
// middleware.ts - Add rate limiting
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

export async function middleware(request: NextRequest) {
  // Check rate limit
  const ip = request.ip ?? '127.0.0.1';
  const { success, remaining } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response('Too Many Requests', { 
      status: 429,
      headers: {
        'X-RateLimit-Remaining': remaining.toString(),
        'Retry-After': '10'
      }
    });
  }
  
  // Continue with auth check
  return await updateSession(request);
}
```

**Recommended Limits:**
```yaml
API Routes:
  /api/chat: 20 requests/minute/user (AI is expensive)
  /api/experiments: 100 requests/minute/user
  /api/files: 10 uploads/minute/user (large files)
  
Per Organization:
  Total API calls: 10,000 requests/hour
  AI tokens: 1M tokens/day
```

---

### CATEGORY 7: Monitoring & Maintenance

#### Question 7.1: "How do we monitor system health?"

**Your Current State:**  
❌ **NO MONITORING** - You don't know when things break

**What You Need:**

**1. Application Monitoring**
```typescript
// Install Sentry for error tracking
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// Errors automatically reported to Sentry dashboard
```

**2. Uptime Monitoring**
```yaml
Pingdom or UptimeRobot:
  Check every: 1 minute
  Endpoints:
    - https://notes9.ox.ac.uk/api/health
    - https://notes9.ox.ac.uk/auth/login
  Alerts:
    - Email: it-team@ox.ac.uk
    - SMS: On-call engineer
    - Slack: #incidents channel
```

**3. Performance Monitoring**
```typescript
// Add health check endpoint
// app/api/health/route.ts
export async function GET() {
  const start = Date.now();
  
  // Check database
  const dbHealthy = await checkDatabase();
  
  // Check external services
  const geminiHealthy = await checkGemini();
  
  const responseTime = Date.now() - start;
  
  return Response.json({
    status: dbHealthy && geminiHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'up' : 'down',
      gemini_api: geminiHealthy ? 'up' : 'down'
    },
    response_time_ms: responseTime
  });
}

async function checkDatabase() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}
```

**4. Log Aggregation**
```typescript
// Structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Usage
logger.info('User logged in', { 
  userId: user.id, 
  timestamp: new Date(),
  ip: request.ip 
});
```

**5. Metrics Dashboard**
```yaml
Key Metrics to Track:
  - Active users (real-time)
  - API response times (p50, p95, p99)
  - Error rate (%)
  - Database query time
  - File storage used
  - AI API costs
  - Cache hit rate
  
Tools:
  - Grafana (visualization)
  - Prometheus (metrics collection)
  - Datadog (all-in-one, expensive)
```

---

#### Question 7.2: "What's your incident response process?"

**What They're Really Asking:**  
When things break at 2 AM, what happens?

**You Need a Plan:**

**Severity Levels:**
```yaml
P0 (Critical):
  - System completely down
  - Data loss occurring
  - Security breach
  Response: Immediate (wake up on-call engineer)
  
P1 (High):
  - Major feature broken
  - Significant performance degradation
  - Multiple users affected
  Response: Within 1 hour
  
P2 (Medium):
  - Minor feature broken
  - Single user affected
  Response: Within 4 hours (business hours)
  
P3 (Low):
  - Cosmetic issues
  - Feature requests
  Response: Next sprint
```

**Incident Response Steps:**
1. **Detect** - Monitoring alerts team
2. **Triage** - Assess severity, assign engineer
3. **Communicate** - Post status update ("We're investigating...")
4. **Mitigate** - Quick fix or rollback
5. **Resolve** - Full fix deployed
6. **Postmortem** - Document what happened, how to prevent

**Status Page:**
```
https://status.notes9.ox.ac.uk

Displays:
- Current status (All systems operational / Degraded / Down)
- Ongoing incidents
- Scheduled maintenance
- Historical uptime (99.9% uptime)
```

---

### CATEGORY 8: API & Integration

#### Question 8.1: "Do you provide an API for external integrations?"

**Your Current State:**  
⚠️ **INTERNAL ONLY** - Your API routes are for your frontend only

**What Oxford Might Need:**

**1. Read-Only API (Data Export)**
```typescript
// app/api/v1/experiments/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  // Authenticate with API key (not cookies)
  const apiKey = req.headers.get('X-API-Key');
  if (!validateApiKey(apiKey)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Return experiment data
  const experiment = await getExperiment(params.id);
  return Response.json(experiment);
}
```

**2. Webhook Support (Event Notifications)**
```typescript
// Notify Oxford system when experiment completes
interface WebhookConfig {
  url: string;
  events: string[];
  secret: string;
}

async function notifyWebhook(event: string, data: any) {
  const webhooks = await getWebhooks(event);
  
  for (const webhook of webhooks) {
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signPayload(data, webhook.secret)
      },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString()
      })
    });
  }
}

// Usage: Trigger on experiment status change
await notifyWebhook('experiment.completed', experiment);
```

**3. API Documentation**
```
You need: OpenAPI/Swagger specification

Example:
GET /api/v1/experiments/{id}
  Description: Get experiment details
  Auth: Bearer token or API key
  Parameters:
    - id (path, required): Experiment UUID
  Response:
    200: Experiment object
    404: Experiment not found
    401: Unauthorized
```

---

#### Question 8.2: "How do you handle API versioning?"

**The Problem:**
```typescript
// Version 1: Returns name as single field
GET /api/experiments/123
{ "name": "Experiment A" }

// Version 2: Returns first_name and last_name
GET /api/experiments/123
{ "first_name": "Experiment", "last_name": "A" }

// Breaking change! Old clients break!
```

**Solution: Version Your API**
```typescript
// Option A: URL versioning (recommended)
/api/v1/experiments  // Old clients
/api/v2/experiments  // New clients

// Option B: Header versioning
GET /api/experiments
Header: Accept: application/vnd.notes9.v1+json
```

**Maintain Both Versions:**
```typescript
// app/api/v1/experiments/route.ts
export async function GET() {
  const experiments = await fetchExperiments();
  return Response.json(experiments.map(e => ({
    name: e.name // Old format
  })));
}

// app/api/v2/experiments/route.ts
export async function GET() {
  const experiments = await fetchExperiments();
  return Response.json(experiments.map(e => ({
    first_name: e.first_name,
    last_name: e.last_name
  })));
}
```

---

### CATEGORY 9: Cost & Licensing

#### Question 9.1: "What's the pricing model?"

**Your Current Costs (if you host):**

```yaml
Development (current):
  Supabase: $0 (free tier)
  Gemini API: ~$10/month (testing)
  Hosting: $0 (localhost)
  Total: $10/month

Production (you host for Oxford):
  Compute:
    - Vercel Pro: $20/month
    - OR AWS EC2: $100-300/month
  
  Database:
    - Supabase Pro: $25/month (1 org, 8GB database)
    - OR Supabase Team: $599/month (unlimited orgs, 100GB)
    - OR Self-hosted PostgreSQL: $100/month (RDS)
  
  AI API:
    - Gemini API: $50-500/month (depends on usage)
  
  Storage:
    - Supabase: $0.021/GB/month
    - 100GB: $2/month
  
  Monitoring:
    - Sentry: $26/month
    - Uptime: $10/month
  
  Total: $250-1,500/month

Production (Oxford hosts):
  Infrastructure: Oxford's cost
  Your fee: License + support
    - License: $5,000-50,000 one-time
    - Support: $1,000-10,000/year
```

**Pricing Models:**
```
1. SaaS (you host):
   $50/user/year or $10/month/user
   
2. License (they host):
   $20,000 perpetual license + 20% annual support ($4,000/year)
   
3. Hybrid:
   $10,000 license + $2,000/year + $5/user/month for hosted services
```

---

#### Question 9.2: "What's the license for your code?"

**Your Current State:**  
⚠️ **NO LICENSE** - Legally ambiguous

**Options:**

**1. Proprietary (Recommended for Commercial)**
```
Copyright (c) 2026 Your Company
All Rights Reserved

This software is licensed to Oxford University under the terms
of the Software License Agreement dated [DATE].
Unauthorized copying, modification, or distribution is prohibited.
```

**2. Open Source (If giving away)**
```
MIT License - Oxford can do anything
GPL License - Oxford must share modifications
AGPL License - If Oxford modifies and runs it, they must share code
```

**3. Dual License**
```
Open source for academic use (MIT)
Commercial license for industry use
```

---

## 🚨 Red Flags & Risk Areas

### Critical Issues They'll Spot:

#### 1. **No Production Experience**
```
❌ You: "This is a prototype"
✅ Say: "This is a working prototype. For production, we'll implement:
   - Professional security audit
   - Load testing (1000 concurrent users)
   - Disaster recovery plan
   - 99.9% uptime SLA"
```

#### 2. **Single Point of Failure**
```
❌ Problem: If Supabase goes down, everything breaks
✅ Solution: Multi-region deployment, backup database
```

#### 3. **No Backup Strategy**
```
❌ Current: Relying on Supabase automatic backups
✅ Need: 
   - Daily backups to separate location
   - Monthly backup tests
   - Point-in-time recovery (restore to 5 minutes ago)
```

#### 4. **API Keys in Code**
```
❌ Never commit:
GEMINI_API_KEY=abc123...

✅ Use:
- Environment variables
- Secret management (AWS Secrets Manager, HashiCorp Vault)
```

#### 5. **No Testing**
```
❌ Current: No tests
✅ Need:
   - Unit tests (functions work correctly)
   - Integration tests (API endpoints work)
   - E2E tests (user flows work)
   - Load tests (handle 1000 users)
```

---

## 🤔 Questions YOU Should Ask THEM

### Infrastructure:
1. **"What's your preferred hosting environment? AWS, Azure, GCP, or on-premise?"**
   - This determines your deployment strategy

2. **"Do you have existing infrastructure we should integrate with?"**
   - E.g., LDAP, Active Directory, existing databases

3. **"What's your network architecture? Do you require VPN access?"**
   - May need to deploy inside their network

### Authentication:
4. **"Which SSO provider do you use? Shibboleth, SAML, OAuth, or other?"**
   - Determines your auth implementation

5. **"Can you provide SSO metadata and test credentials?"**
   - You'll need these to develop integration

6. **"Do you need Multi-Factor Authentication (2FA)?"**
   - Additional security requirement

### Data:
7. **"What data residency requirements do you have? Must data stay in UK?"**
   - Affects database location choice

8. **"Do you need to integrate with existing data sources?"**
   - May need to sync with other systems

9. **"What's your data classification scheme?"**
   - Public, Internal, Confidential, etc.

10. **"How long must data be retained? Any legal requirements?"**
    - Affects backup and deletion policies

### Operations:
11. **"Who will be the technical contact for integration?"**
    - Your go-to person for issues

12. **"What's your change management process?"**
    - How to deploy updates

13. **"Do you have a test environment?"**
    - Where to test before production

14. **"What monitoring tools do you use? Can we integrate?"**
    - Grafana, Nagios, Datadog, etc.

### Support:
15. **"What's your expected uptime requirement?"**
    - 99% (7 hours downtime/month) vs 99.9% (43 minutes) vs 99.99% (4 minutes)

16. **"What response time do you expect for critical issues?"**
    - 15 minutes? 1 hour? 24 hours?

17. **"Do you have a preferred ticketing system for support?"**
    - Jira, ServiceNow, etc.

### Legal:
18. **"Do you need a Data Processing Agreement (DPA)?"**
    - Required for GDPR compliance

19. **"Are there any export control restrictions on the research data?"**
    - Some research is controlled (e.g., defense-related)

20. **"Do you need Professional Indemnity Insurance from us?"**
    - They may require £1M+ coverage

---

## 📚 Glossary of Terms

### Technical Terms You'll Hear:

**API (Application Programming Interface)**
- How software talks to other software
- Your app's API routes are examples

**Authentication vs Authorization**
- **Authentication:** Proving who you are (login)
- **Authorization:** Proving you're allowed to do something (permissions)

**Backward Compatible**
- New version works with old clients
- Important for updates

**CDN (Content Delivery Network)**
- Servers worldwide that cache your static files
- Makes your app faster globally

**Container (Docker)**
- Package of your app + dependencies
- "Works on my machine" → "Works anywhere"

**Horizontal vs Vertical Scaling**
- **Horizontal:** Add more servers (scale out)
- **Vertical:** Make server bigger (scale up)

**IdP (Identity Provider)**
- The system that authenticates users (Oxford's SSO)

**LIMS (Laboratory Information Management System)**
- What your app is!
- Software for managing lab operations

**Metadata**
- Data about data
- E.g., file size, creation date, author

**Middleware**
- Code that runs between request and response
- Your middleware.ts checks authentication

**OAuth / SAML / Shibboleth**
- Different protocols for SSO
- SAML is most common in universities

**REST API**
- Style of API using HTTP
- GET/POST/PUT/DELETE

**RLS (Row Level Security)**
- Database feature you're using
- Filters data at database level

**SLA (Service Level Agreement)**
- Contract guaranteeing uptime, support response, etc.

**SSO (Single Sign-On)**
- Log in once, access multiple systems
- Oxford users want to use their Oxford login

**Zero-Day**
- Security vulnerability that's just discovered
- No patch available yet

---

## 🎯 Summary: Be Ready to Discuss

### Short-Term (MVP for Oxford):
1. ✅ **SSO Integration** - Shibboleth/SAML (MUST HAVE)
2. ✅ **Data Isolation** - Multi-department support (ALREADY HAVE)
3. ✅ **Security Audit** - Third-party assessment
4. ✅ **Deployment Plan** - Docker + CI/CD
5. ✅ **API Documentation** - OpenAPI spec

### Medium-Term (Production):
1. ⏰ **Monitoring** - Sentry + uptime checks
2. ⏰ **Backup Strategy** - Automated + tested
3. ⏰ **Rate Limiting** - Protect against abuse
4. ⏰ **Versioning** - Track changes to experiments
5. ⏰ **Load Testing** - Prove it scales

### Long-Term (Enterprise):
1. 📅 **High Availability** - 99.9% uptime
2. 📅 **Disaster Recovery** - Full DR plan
3. 📅 **Compliance Certs** - ISO 27001, SOC 2
4. 📅 **Advanced Features** - ML/AI, integrations
5. 📅 **Mobile App** - iOS/Android

---

## 📋 Pre-Meeting Checklist

**Documents to Bring:**
- [ ] System architecture diagram (create one!)
- [ ] Database schema (you have: scripts/001_create_tables.sql)
- [ ] Security features list
- [ ] Technology stack overview
- [ ] Deployment options comparison
- [ ] Cost estimates
- [ ] Timeline (realistic!)
- [ ] Reference architecture from similar project

**Information to Gather:**
- [ ] Oxford's SSO provider details
- [ ] Infrastructure preferences
- [ ] Security requirements
- [ ] Data residency needs
- [ ] Expected user count
- [ ] Budget range
- [ ] Timeline expectations
- [ ] Technical contact person

**Be Honest About:**
- [ ] This is a prototype (not production-ready)
- [ ] You'll need 2-3 months for production hardening
- [ ] SSO integration will take 2-4 weeks
- [ ] You'll need their help with testing
- [ ] Ongoing maintenance requirements

---

## 🎤 Sample Answers to Likely Questions

**"Why should we choose your system?"**

> "Notes9 is built specifically for academic research labs using modern, proven technologies. Unlike legacy LIMS systems, it's:
> - **User-friendly** - Researchers can start using it immediately without extensive training
> - **Flexible** - Adapts to different research workflows
> - **Secure** - Database-level security (RLS) means data isolation is enforced at the lowest level
> - **AI-Enhanced** - Integrated AI assistant helps researchers document faster
> - **Cost-effective** - Modern cloud architecture means lower infrastructure costs
> 
> The prototype you see demonstrates core functionality. We're prepared to invest 2-3 months in hardening it for production with proper security audits, SSO integration, and compliance documentation."

**"What happens if you get hit by a bus?"**

> "Valid concern. For production deployment, we'll provide:
> 1. **Complete documentation** - architecture, deployment, troubleshooting
> 2. **Source code access** - Your IT team can maintain it
> 3. **Knowledge transfer** - 2-day training for your developers
> 4. **Support contract** - For ongoing questions
> 5. **Emergency contacts** - Multiple team members, not just me
> 
> The codebase is standard Next.js/React - any modern web developer can understand it."

**"Can this handle our research data compliance requirements?"**

> "Currently, Notes9 implements foundational security:
> - Encryption in transit (HTTPS) and at rest (database encryption)
> - Row-level security for data isolation
> - Authentication for all access
> 
> For your specific compliance needs (GDPR, institutional policies), we'd do a requirements analysis and implement:
> - Audit logging for all data access
> - Data classification and handling
> - Enhanced encryption for sensitive fields
> - Compliance reporting
> 
> We'd work with your compliance team to ensure all requirements are met before production launch."

---

## 🚀 After the Meeting

### Follow-Up Actions:
1. **Send thank-you email** within 24 hours
2. **Document all requirements** they mentioned
3. **Create technical proposal** addressing their specific needs
4. **Prepare demo environment** (if they want to test)
5. **Get quotes** for infrastructure costs
6. **Draft timeline** with milestones
7. **Identify risks** and mitigation strategies

### Red Flags That Mean "No Deal":
- ❌ They want it done in 2 weeks
- ❌ They won't provide SSO metadata
- ❌ Budget is unrealistically low
- ❌ They want you to integrate with ancient systems (SOAP APIs from 2005)
- ❌ They're not willing to do any testing
- ❌ No clear technical contact
- ❌ "We'll handle security later"

### Green Flags That Mean "Good Partnership":
- ✅ They have a clear technical roadmap
- ✅ Realistic timeline (3-6 months)
- ✅ Willing to do pilot with small group first
- ✅ They understand it's an integration project (not just "install it")
- ✅ Have budget for professional services
- ✅ Technical team will work with you
- ✅ Open to iterative development

---

## 📞 Key Contacts & Resources

### Your Tech Stack Documentation:
- **Next.js:** https://nextjs.org/docs
- **Supabase:** https://supabase.com/docs
- **PostgreSQL:** https://www.postgresql.org/docs/
- **Vercel AI SDK:** https://sdk.vercel.ai/docs

### University IT Standards:
- **Janet Network (UK Academic Network):** https://www.jisc.ac.uk/janet
- **UK Federation (SSO):** https://www.ukfederation.org.uk/
- **Cyber Essentials (UK):** https://www.ncsc.gov.uk/cyberessentials

### Security & Compliance:
- **GDPR:** https://gdpr.eu/
- **ISO 27001:** https://www.iso.org/isoiec-27001-information-security.html
- **OWASP (Web Security):** https://owasp.org/

### Tools You Might Need:
- **SAML Library:** https://github.com/boxyhq/jackson
- **Rate Limiting:** https://upstash.com/ratelimit
- **Monitoring:** https://sentry.io, https://uptimerobot.com
- **Load Testing:** https://k6.io, https://jmeter.apache.org

---

## ✅ Final Confidence Boosters

### Remember:
1. **It's okay to say "I don't know"** - Follow with "but I'll find out"
2. **They're evaluating you AND you're evaluating them** - Is this a project you want?
3. **Prototype ≠ Production** - Be clear about what exists vs what needs building
4. **Listen more than you talk** - Understand their actual needs
5. **Take notes** - You'll forget details later

### You've Got This Because:
- ✅ Your architecture is modern and solid
- ✅ You've implemented Row Level Security (many systems don't!)
- ✅ Your code is clean and well-structured
- ✅ The tech stack is proven and scalable
- ✅ You're prepared with this guide!

### If You Get Stuck:
> "That's a great question. Let me take note of that and get back to you with a detailed answer by [tomorrow/end of week]. I want to make sure I give you accurate information rather than guessing."

**This shows professionalism, not weakness.**

---

**Good luck with your technical discussion!** 🎓🔬

You've built something solid. Now it's about demonstrating how it meets their specific needs and showing you understand the path from prototype to production.

Remember: They need you as much as you need them. Oxford is looking for solutions to real problems. You have a solution. The conversation is about finding the right fit.

**Go get 'em!** 💪
