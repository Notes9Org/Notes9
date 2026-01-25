# Notes9 - System Architecture Diagrams

**For Oxford University Integration Discussion**

---

## 1. Current Architecture (Development)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Next.js Frontend (React 19)                    │  │
│  │  - Pages: Projects, Experiments, Samples, Notes          │  │
│  │  - Components: Tables, Forms, AI Chat, Rich Editor       │  │
│  │  - Auth: Supabase Auth Client                           │  │
│  └──────────────────┬───────────────────────────────────────┘  │
└────────────────────┼────────────────────────────────────────────┘
                     │ HTTPS (TLS 1.3)
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                   NEXT.JS SERVER (Node.js 20)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Server-Side Rendering (SSR)                             │  │
│  │  - Dynamic pages with database data                      │  │
│  │  - Server Components (React 19)                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Routes (Backend)                                    │  │
│  │  - /api/chat          → AI conversation                 │  │
│  │  - /api/context       → Fetch experiment data           │  │
│  │  - /api/files         → File upload/download            │  │
│  │  - /api/search-papers → Literature search               │  │
│  │  - /api/export-docx   → Document generation             │  │
│  │  - /api/vote          → Feedback system                 │  │
│  └──────────────────┬────────────────┬──────────────────────┘  │
└────────────────────┼────────────────┼─────────────────────────┘
                     │                │
         ┌───────────┘                └──────────┐
         │                                       │
         │ PostgreSQL Protocol                  │ HTTPS
         │ (Port 5432)                          │
         │                                       │
         ▼                                       ▼
┌─────────────────────┐               ┌──────────────────────┐
│    SUPABASE         │               │  GOOGLE GEMINI API   │
│  (Backend-as-a-     │               │  (AI Service)        │
│   Service)          │               │                      │
│  ┌──────────────┐   │               │  - Gemini 2.0 Flash  │
│  │ PostgreSQL   │   │               │  - Streaming         │
│  │ Database     │   │               │  - Context window:   │
│  │ - 18+ Tables │   │               │    1M tokens         │
│  │ - RLS Active │   │               └──────────────────────┘
│  │ - Encrypted  │   │
│  └──────────────┘   │               Cost: ~$0.001/1K chars
│  ┌──────────────┐   │
│  │ Supabase     │   │
│  │ Auth         │   │
│  │ - Email/Pass │   │
│  │ - Sessions   │   │
│  └──────────────┘   │
│  ┌──────────────┐   │
│  │ Supabase     │   │
│  │ Storage      │   │
│  │ - S3-like    │   │
│  │ - Files/PDFs │   │
│  └──────────────┘   │
└─────────────────────┘

Region: US East or EU (configurable)
Encryption: AES-256 at rest, TLS in transit
Backups: Daily automated, 7-day retention
```

---

## 2. Proposed Architecture for Oxford (Option A: SaaS)

**Oxford doesn't host - you provide as a service**

```
┌─────────────────────────────────────────────────────────────────┐
│                    OXFORD UNIVERSITY USERS                      │
│              (Researchers, Lab Technicians, PIs)                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ 1. User clicks "Lab Notes" in Oxford portal
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│             OXFORD SSO (Shibboleth/SAML IdP)                    │
│  - Authenticates user with Oxford credentials                   │
│  - Sends SAML assertion with user attributes:                   │
│    * Email, Name, Department, Employee ID                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ 2. SAML Response redirected to your app
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                    YOUR APPLICATION                             │
│                  (notes9.yourdomain.com)                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  SAML Service Provider (SP)                               │ │
│  │  - Validates SAML assertion                               │ │
│  │  - Extracts user info                                     │ │
│  │  - Creates/updates user profile (JIT provisioning)        │ │
│  │  - Creates session                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Next.js Application (same as current)                    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────┬───────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
┌─────────────────┐      ┌──────────────────┐
│  YOUR DATABASE  │      │  YOUR AI SERVICE │
│  (Multi-tenant) │      │  (Gemini API)    │
│                 │      │                  │
│  ┌───────────┐  │      └──────────────────┘
│  │ Org: Chem │  │
│  │ Org: Bio  │  │      You pay AI costs
│  │ Org: Phys │  │
│  └───────────┘  │
│                 │
│  RLS ensures    │
│  isolation      │
└─────────────────┘

Hosted on: Vercel / AWS / Your choice
Maintenance: You handle
Updates: You deploy
Cost Model: Per-user subscription
```

**Data Flow:**
1. User accesses Oxford portal
2. Clicks "Lab Notes" → Redirected to Oxford SSO
3. User logs in with Oxford credentials
4. SSO sends SAML to your app
5. Your app validates and logs user in
6. User sees Notes9 interface
7. All subsequent requests go directly to your app

**Pros:**
- ✅ Easier for Oxford (minimal IT involvement)
- ✅ You control updates and maintenance
- ✅ Faster deployment (no Oxford infrastructure needed)
- ✅ Lower initial cost for Oxford

**Cons:**
- ❌ Oxford doesn't control infrastructure
- ❌ Data stored outside Oxford (may not meet some security policies)
- ❌ Ongoing dependency on your service

---

## 3. Proposed Architecture for Oxford (Option B: On-Premise)

**Oxford hosts everything on their infrastructure**

```
┌─────────────────────────────────────────────────────────────────┐
│                    OXFORD UNIVERSITY NETWORK                    │
│                         (ox.ac.uk)                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              OXFORD SSO (Shibboleth)                     │  │
│  │              sso.ox.ac.uk                                │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                           │
│                     │ SAML Assertion                            │
│                     │                                           │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │         OXFORD KUBERNETES CLUSTER                        │  │
│  │         (or VM infrastructure)                           │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │  Load Balancer (nginx / HAProxy)                   │ │  │
│  │  │  notes9.ox.ac.uk                                    │ │  │
│  │  └────────────┬───────────────────────────────────────┘ │  │
│  │               │                                          │  │
│  │  ┌────────────▼─────────────┬──────────────────────┐   │  │
│  │  │  Notes9 Instance 1       │  Notes9 Instance 2   │   │  │
│  │  │  (Docker Container)      │  (Docker Container)  │ ... │  │
│  │  │  - Next.js Server        │  - Next.js Server    │   │  │
│  │  │  - Node.js 20            │  - Node.js 20        │   │  │
│  │  │  - API Routes            │  - API Routes        │   │  │
│  │  └──────────┬───────────────┴──────────┬───────────┘   │  │
│  │             │                           │               │  │
│  │             └────────────┬──────────────┘               │  │
│  │                          │                              │  │
│  │  ┌───────────────────────▼──────────────────────────┐  │  │
│  │  │  PostgreSQL Database Cluster                     │  │  │
│  │  │  - Primary (write)                               │  │  │
│  │  │  - Replica (read)                                │  │  │
│  │  │  - Automated backups to Oxford backup system     │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Object Storage (MinIO / S3)                     │  │  │
│  │  │  - Lab files, images, PDFs                       │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Redis (Optional)                                │  │  │
│  │  │  - Session cache                                 │  │  │
│  │  │  - Rate limiting                                 │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Monitoring Stack                                │  │  │
│  │  │  - Prometheus (metrics)                          │  │  │
│  │  │  - Grafana (dashboards)                          │  │  │
│  │  │  - Loki (logs)                                   │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  External API Gateway (for AI - egress only)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Firewall Rule: Allow HTTPS to gemini.googleapis.com     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS (egress only, if AI enabled)
                         │
              ┌──────────▼──────────┐
              │  Google Gemini API  │
              │  (External)         │
              └─────────────────────┘
              
              (Optional - can be disabled
               or replaced with self-hosted AI)
```

**Deployment Package You Provide:**
1. **Docker Image:** `notes9:latest`
2. **Kubernetes Manifests:** `k8s/*.yaml`
3. **Database Schema:** `scripts/*.sql`
4. **Configuration Guide:** `deployment-guide.md`
5. **Monitoring Config:** `monitoring/*.yaml`

**What Oxford Manages:**
- Infrastructure (VMs, Kubernetes, storage)
- Database backups
- Network security
- SSL certificates
- Monitoring alerts
- Updates (pull new Docker images)

**What You Provide:**
- Application code (Docker image)
- Database migrations
- Update documentation
- Bug fixes
- Feature development
- Support (via ticket system)

**Pros:**
- ✅ Oxford controls everything
- ✅ Data stays on Oxford infrastructure
- ✅ Meets strictest security requirements
- ✅ No external dependencies (except optional AI)

**Cons:**
- ❌ Oxford needs infrastructure expertise
- ❌ More complex to deploy and maintain
- ❌ Slower to push updates
- ❌ Higher initial setup cost

---

## 4. Data Model (Database Schema Overview)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORGANIZATIONS                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  id, name, address, phone, email                         │  │
│  │  (One per Oxford department: Chemistry, Biology, etc.)   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────────────────┘
                      │
          ┌───────────┴────────────┬─────────────┐
          │                        │             │
          ▼                        ▼             ▼
┌─────────────────┐    ┌─────────────────┐   ┌──────────────┐
│   PROFILES      │    │    EQUIPMENT    │   │  PROTOCOLS   │
│   (Users)       │    │  (Lab Equipment)│   │   (SOPs)     │
│                 │    │                 │   │              │
│  - User info    │    │  - Equipment    │   │  - Procedure │
│  - Role         │    │    tracking     │   │    documents │
│  - org_id ──────┼────┼─  - Maintenance │   │  - Versioned │
└─────────┬───────┘    └─────────────────┘   └──────────────┘
          │                                          ▲
          │                                          │
          │ creates/owns                             │ uses
          │                                          │
          ▼                                          │
┌─────────────────────────────────────────────────────┐
│                 PROJECTS                            │
│  ┌──────────────────────────────────────────────┐  │
│  │  id, name, description, status, priority     │  │
│  │  start_date, end_date, created_by            │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ contains
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                EXPERIMENTS                          │
│  ┌──────────────────────────────────────────────┐  │
│  │  id, project_id, name, description           │  │
│  │  hypothesis, methodology, results            │  │
│  │  status, assigned_to, created_by             │  │
│  └──────────────────────────────────────────────┘  │
└───────┬──────────────┬──────────────┬───────────────┘
        │              │              │
        │              │              │
        ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────┐
│  SAMPLES    │ │  LAB_NOTES  │ │ EXPERIMENT_DATA │
│             │ │             │ │  (Files)        │
│ - Sample    │ │ - Rich text │ │ - PDFs          │
│   inventory │ │ - Markdown  │ │ - CSVs          │
│ - Storage   │ │ - Timestamped│ │ - Images       │
│   location  │ │             │ │                 │
└─────────────┘ └─────────────┘ └─────────────────┘

┌─────────────────────────────────────────────────────┐
│          ROW LEVEL SECURITY (RLS)                   │
│  Every query automatically filtered by org_id:      │
│                                                     │
│  SELECT * FROM projects                             │
│  WHERE organization_id = (                          │
│    SELECT organization_id                           │
│    FROM profiles                                    │
│    WHERE id = current_user_id                       │
│  )                                                  │
│                                                     │
│  ✅ Chemistry dept CANNOT see Biology dept data     │
│  ✅ Enforced at database level (unhackable)         │
└─────────────────────────────────────────────────────┘
```

**Key Tables (18 total):**
- organizations (1) → profiles (N)
- projects (N) → experiments (N) → samples/data/notes (N)
- equipment, protocols, assays (global per org)
- audit_log (tracks all changes)
- chat_sessions, chat_messages (AI assistant)

**Security Model:**
- Every table has `organization_id` (except global lookups)
- RLS policies enforce `WHERE organization_id = user's org`
- Users can only see/modify data in their organization
- Database enforces this - no application bypass possible

---

## 5. Authentication Flow (SSO Integration)

### Current Flow (Email/Password):
```
User → Login Form → Supabase Auth → Session Cookie → App
```

### Proposed Flow (Oxford SSO):
```
┌─────────┐                                    ┌──────────────┐
│  User   │                                    │ Oxford SSO   │
│ (Browser)                                    │ (Shibboleth) │
└────┬────┘                                    └──────┬───────┘
     │                                                │
     │ 1. Access notes9.ox.ac.uk                     │
     ▼                                                │
┌─────────────┐                                      │
│  Your App   │                                      │
│  (Not       │                                      │
│  logged in) │                                      │
└─────┬───────┘                                      │
      │                                              │
      │ 2. Redirect to SSO for auth                  │
      ├──────────────────────────────────────────────►
      │                                              │
      │                                              │ 3. Show login form
      │                                              │    (if not logged in)
      │                                              │
      │                                              │ 4. User enters
      │                                              │    Oxford credentials
      │                                              │
      │ 5. SAML Assertion (signed XML)               │
      ◄──────────────────────────────────────────────┤
      │    <saml:Assertion>                          │
      │      <saml:Subject>                          │
      │        <email>user@ox.ac.uk</email>          │
      │        <name>John Doe</name>                 │
      │        <department>Chemistry</department>    │
      │      </saml:Subject>                         │
      │    </saml:Assertion>                         │
      │                                              │
┌─────▼───────┐                                      │
│  Your App   │                                      │
│             │                                      │
│ 6. Validate SAML signature                        │
│ 7. Extract user attributes                        │
│ 8. Create/update user in database:                │
│    - Check if user@ox.ac.uk exists                │
│    - If not, create new profile                   │
│    - Map department → organization_id             │
│ 9. Create session                                 │
└─────┬───────┘                                      │
      │                                              │
      │ 10. User now logged in, redirect to app      │
      ▼                                              │
┌─────────────┐                                      │
│  App Home   │                                      │
│  (Dashboard)│                                      │
└─────────────┘                                      │
```

**Technical Details:**

**SAML Assertion Example:**
```xml
<samlp:Response>
  <saml:Assertion>
    <saml:Subject>
      <saml:NameID>user123@ox.ac.uk</saml:NameID>
    </saml:Subject>
    <saml:AttributeStatement>
      <saml:Attribute Name="email">
        <saml:AttributeValue>john.doe@ox.ac.uk</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="givenName">
        <saml:AttributeValue>John</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="surname">
        <saml:AttributeValue>Doe</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="eduPersonAffiliation">
        <saml:AttributeValue>member;staff</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="department">
        <saml:AttributeValue>Chemistry</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>
```

**Your Code to Handle This:**
```typescript
// app/auth/saml/callback/route.ts
import { SAMLAuth } from '@boxyhq/saml-jackson';

export async function POST(req: Request) {
  // Parse SAML response
  const samlResponse = await req.formData();
  const assertion = samlAuth.validateResponse(samlResponse);
  
  // Extract attributes
  const email = assertion.email;
  const firstName = assertion.givenName;
  const lastName = assertion.surname;
  const department = assertion.department;
  
  // Map department to organization
  const orgId = await getOrgIdForDepartment(department);
  
  // Create or update user
  const { data: user } = await supabase
    .from('profiles')
    .upsert({
      email,
      first_name: firstName,
      last_name: lastName,
      organization_id: orgId,
      role: 'researcher'
    }, { onConflict: 'email' });
  
  // Create session
  const session = await createSession(user.id);
  
  // Redirect to app
  return redirect('/dashboard');
}
```

---

## 6. Deployment Architecture (Kubernetes)

**If Oxford uses Kubernetes:**

```yaml
┌─────────────────────────────────────────────────────────────────┐
│                  OXFORD KUBERNETES CLUSTER                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Ingress Controller (nginx)                               │ │
│  │  - SSL Termination                                        │ │
│  │  - notes9.ox.ac.uk → notes9-service:3000                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Service: notes9-service (ClusterIP)                      │ │
│  │  - Load balances across pods                              │ │
│  └───────────────┬───────────────────────────────────────────┘ │
│                  │                                              │
│         ┌────────┴────────┬──────────────┐                     │
│         │                 │              │                     │
│         ▼                 ▼              ▼                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │
│  │  Pod 1      │   │  Pod 2      │   │  Pod 3      │         │
│  │ notes9:v1.0 │   │ notes9:v1.0 │   │ notes9:v1.0 │         │
│  │             │   │             │   │             │         │
│  │ Container:  │   │ Container:  │   │ Container:  │         │
│  │ - Next.js   │   │ - Next.js   │   │ - Next.js   │         │
│  │ - Node.js   │   │ - Node.js   │   │ - Node.js   │         │
│  │             │   │             │   │             │         │
│  │ Resources:  │   │ Resources:  │   │ Resources:  │         │
│  │ CPU: 1 core │   │ CPU: 1 core │   │ CPU: 1 core │         │
│  │ RAM: 2 GB   │   │ RAM: 2 GB   │   │ RAM: 2 GB   │         │
│  └─────┬───────┘   └─────┬───────┘   └─────┬───────┘         │
│        │                 │                 │                   │
│        └─────────────────┴─────────────────┘                   │
│                          │                                     │
│                          ▼                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  StatefulSet: postgresql-primary                          │ │
│  │  - Persistent Volume: 500 GB                              │ │
│  │  - Service: postgresql-svc:5432                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  StatefulSet: postgresql-replica (read-only)              │ │
│  │  - Replicates from primary                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  PersistentVolumeClaim: minio-storage                     │ │
│  │  - Object storage for files                               │ │
│  │  - 1 TB initial                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Auto-scaling:
  Min replicas: 2
  Max replicas: 10
  Trigger: CPU > 70% or Memory > 80%
```

**Sample Kubernetes Manifest:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notes9
  namespace: lims
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notes9
  template:
    metadata:
      labels:
        app: notes9
    spec:
      containers:
      - name: notes9
        image: registry.ox.ac.uk/notes9:1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: notes9-secrets
              key: database-url
        - name: NEXTAUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: notes9-secrets
              key: nextauth-secret
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

---

## 7. Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                         │
│                      (Defense in Depth)                         │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Network Security
┌─────────────────────────────────────────────────────────────────┐
│  - Firewall: Only ports 443 (HTTPS) and 80 (HTTP→HTTPS) open   │
│  - DDoS Protection: Cloudflare / AWS Shield                     │
│  - VPN: Optional for admin access                               │
│  - IP Whitelisting: Optional (Oxford IP ranges only)            │
└─────────────────────────────────────────────────────────────────┘

Layer 2: Transport Security
┌─────────────────────────────────────────────────────────────────┐
│  - TLS 1.3: All communication encrypted                         │
│  - HSTS: Force HTTPS, prevent downgrade attacks                 │
│  - Certificate Pinning: Optional for mobile apps                │
└─────────────────────────────────────────────────────────────────┘

Layer 3: Authentication
┌─────────────────────────────────────────────────────────────────┐
│  - SSO (SAML/Shibboleth): Oxford credentials                    │
│  - MFA (Optional): Second factor authentication                 │
│  - Session Timeout: 30 minutes inactive → logout                │
│  - Secure Cookies: HttpOnly, Secure, SameSite flags             │
└─────────────────────────────────────────────────────────────────┘

Layer 4: Authorization
┌─────────────────────────────────────────────────────────────────┐
│  - Role-Based Access Control (RBAC):                            │
│    * Admin: Full access                                         │
│    * Researcher: Create/edit own projects                       │
│    * Technician: View and update assigned experiments           │
│    * Viewer: Read-only access                                   │
│  - Row Level Security (RLS): Database enforces org isolation    │
└─────────────────────────────────────────────────────────────────┘

Layer 5: Data Protection
┌─────────────────────────────────────────────────────────────────┐
│  - Encryption at Rest: AES-256 (database)                       │
│  - Encryption in Transit: TLS 1.3 (all connections)             │
│  - Field-Level Encryption (Optional): Sensitive fields          │
│  - Backup Encryption: Encrypted backup files                    │
└─────────────────────────────────────────────────────────────────┘

Layer 6: Application Security
┌─────────────────────────────────────────────────────────────────┐
│  - Input Validation: Prevent injection attacks                  │
│  - CSRF Protection: Anti-CSRF tokens                            │
│  - XSS Prevention: Content Security Policy (CSP)                │
│  - SQL Injection Prevention: Parameterized queries              │
│  - Rate Limiting: Prevent abuse (10-100 req/min/user)           │
└─────────────────────────────────────────────────────────────────┘

Layer 7: Monitoring & Auditing
┌─────────────────────────────────────────────────────────────────┐
│  - Audit Log: All data access and modifications logged          │
│  - Security Alerts: Failed login attempts, unusual activity     │
│  - Log Retention: 90 days (configurable)                        │
│  - SIEM Integration: Optional (Splunk, ELK)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Disaster Recovery & High Availability

```
┌─────────────────────────────────────────────────────────────────┐
│                DISASTER RECOVERY STRATEGY                       │
└─────────────────────────────────────────────────────────────────┘

Backup Strategy:
┌─────────────────────────────────────────────────────────────────┐
│  Database Backups:                                              │
│  ├─ Full Backup: Daily at 2 AM                                  │
│  ├─ Incremental: Every 6 hours                                  │
│  ├─ Retention: 30 days                                          │
│  └─ Storage: Separate region/location                           │
│                                                                 │
│  File Storage Backups:                                          │
│  ├─ Versioning: Enabled (30-day history)                        │
│  ├─ Replication: To secondary region                            │
│  └─ Lifecycle: Archive to glacier after 90 days                 │
│                                                                 │
│  Application Backups:                                           │
│  ├─ Docker Images: Stored in registry                           │
│  ├─ Git Repository: Source code (external GitHub/GitLab)        │
│  └─ Configuration: Infrastructure as Code (Terraform/K8s YAML)  │
└─────────────────────────────────────────────────────────────────┘

Recovery Objectives:
┌─────────────────────────────────────────────────────────────────┐
│  RTO (Recovery Time Objective): 4 hours                         │
│  - Time to get system back online after disaster                │
│                                                                 │
│  RPO (Recovery Point Objective): 6 hours                        │
│  - Maximum acceptable data loss (restore from 6h old backup)    │
│                                                                 │
│  MTTR (Mean Time To Repair): 2 hours                            │
│  - Average time to fix typical incidents                        │
└─────────────────────────────────────────────────────────────────┘

Failure Scenarios:
┌─────────────────────────────────────────────────────────────────┐
│  1. Single Server Failure:                                      │
│     Auto-healing: K8s restarts pod → 30 seconds                 │
│                                                                 │
│  2. Database Failure:                                           │
│     Failover to replica → 2 minutes                             │
│                                                                 │
│  3. Region Failure (AWS/Data center):                           │
│     Switch to DR site → 4 hours                                 │
│                                                                 │
│  4. Data Corruption:                                            │
│     Restore from backup → 2-4 hours                             │
│                                                                 │
│  5. Security Breach:                                            │
│     Isolate, investigate, restore → 8-24 hours                  │
└─────────────────────────────────────────────────────────────────┘

High Availability Architecture:
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Region 1 (Primary)              Region 2 (DR/Backup)          │
│  ┌─────────────────────┐         ┌─────────────────────┐      │
│  │  Load Balancer      │         │  Load Balancer      │      │
│  └──────────┬──────────┘         └──────────┬──────────┘      │
│             │                               │                  │
│      ┌──────┴──────┐                 ┌──────┴──────┐          │
│      │             │                 │             │          │
│   ┌──▼──┐      ┌──▼──┐           ┌──▼──┐      ┌──▼──┐       │
│   │App1 │      │App2 │           │App1 │      │App2 │       │
│   └──┬──┘      └──┬──┘           └──┬──┘      └──┬──┘       │
│      │            │                 │            │           │
│      └─────┬──────┘                 └─────┬──────┘           │
│            │                              │                  │
│      ┌─────▼─────┐               ┌────────▼────────┐         │
│      │  DB       │─── Replication│  DB Replica     │         │
│      │  Primary  │─────────────→ │  (Read-only)    │         │
│      └───────────┘               └─────────────────┘         │
│                                                               │
│  Uptime: 99.9% (43 min/month downtime)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Cost Estimation

```
┌─────────────────────────────────────────────────────────────────┐
│            MONTHLY OPERATIONAL COSTS (YOU HOST)                 │
└─────────────────────────────────────────────────────────────────┘

Infrastructure (AWS/Vercel):
┌─────────────────────────────────────────────────────────────────┐
│  Compute (EC2 / Vercel):                                        │
│  ├─ 2 instances @ $50/ea = $100                                 │
│  └─ Auto-scaling (2-6 instances) = $100-300                     │
│                                                                 │
│  Database (RDS PostgreSQL):                                     │
│  ├─ Primary (db.t3.large) = $150                                │
│  ├─ Replica (db.t3.medium) = $75                                │
│  └─ Storage (500 GB SSD) = $57.50                               │
│                                                                 │
│  Object Storage (S3):                                           │
│  ├─ 100 GB @ $0.023/GB = $2.30                                  │
│  └─ Data transfer = $10                                         │
│                                                                 │
│  Load Balancer:                                                 │
│  └─ Application LB = $22                                        │
│                                                                 │
│  Backups:                                                       │
│  └─ S3 backup storage (300 GB) = $7                             │
│                                                                 │
│  Total Infrastructure: $424-624/month                           │
└─────────────────────────────────────────────────────────────────┘

Services:
┌─────────────────────────────────────────────────────────────────┐
│  Monitoring (Datadog / Sentry):                                 │
│  └─ $50/month                                                   │
│                                                                 │
│  Uptime Monitoring:                                             │
│  └─ $10/month                                                   │
│                                                                 │
│  AI API (Gemini):                                               │
│  ├─ 100 users × 50 queries/day = 5,000 queries/day             │
│  ├─ ~150,000 queries/month                                      │
│  ├─ ~1,000 tokens/query = 150M tokens                           │
│  └─ @ $0.001/1K tokens = $150/month                             │
│                                                                 │
│  Total Services: $210/month                                     │
└─────────────────────────────────────────────────────────────────┘

Total Monthly Operational Cost: $634-834/month

With 100 users: $6.34-8.34 per user per month
With 500 users: $1.27-1.67 per user per month
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│         ONE-TIME COSTS (OXFORD HOSTS ON-PREMISE)                │
└─────────────────────────────────────────────────────────────────┘

Development/Setup:
┌─────────────────────────────────────────────────────────────────┐
│  SSO Integration Development:                                   │
│  └─ 40 hours @ $100/hr = $4,000                                 │
│                                                                 │
│  Security Hardening:                                            │
│  └─ 80 hours @ $100/hr = $8,000                                 │
│                                                                 │
│  Deployment Package:                                            │
│  └─ 40 hours @ $100/hr = $4,000                                 │
│                                                                 │
│  Documentation:                                                 │
│  └─ 20 hours @ $100/hr = $2,000                                 │
│                                                                 │
│  Testing & QA:                                                  │
│  └─ 40 hours @ $100/hr = $4,000                                 │
│                                                                 │
│  Knowledge Transfer:                                            │
│  └─ 16 hours @ $100/hr = $1,600                                 │
│                                                                 │
│  Total Development: $23,600                                     │
└─────────────────────────────────────────────────────────────────┘

Annual Support (After Deployment):
┌─────────────────────────────────────────────────────────────────┐
│  Bug Fixes & Updates:                                           │
│  └─ $6,000/year                                                 │
│                                                                 │
│  Feature Development:                                           │
│  └─ $10,000/year (40 hours/quarter)                             │
│                                                                 │
│  Security Patches:                                              │
│  └─ $2,000/year                                                 │
│                                                                 │
│  Support (Business Hours):                                      │
│  └─ $4,000/year                                                 │
│                                                                 │
│  Total Annual Support: $22,000/year                             │
└─────────────────────────────────────────────────────────────────┘

Total First Year (Oxford Hosts): ~$45,600
Total Subsequent Years: ~$22,000/year
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Integration Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                IMPLEMENTATION TIMELINE (12 WEEKS)               │
└─────────────────────────────────────────────────────────────────┘

Week 1-2: Requirements & Planning
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Gather detailed requirements                                 │
│  ✓ Technical architecture review                                │
│  ✓ Get SSO metadata from Oxford                                 │
│  ✓ Set up development/staging environments                      │
│  ✓ Create project plan                                          │
│                                                                 │
│  Deliverable: Technical Specification Document                  │
└─────────────────────────────────────────────────────────────────┘

Week 3-5: SSO Integration
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Implement SAML service provider                              │
│  ✓ Configure metadata exchange                                  │
│  ✓ Implement JIT user provisioning                              │
│  ✓ Test with Oxford SSO (test environment)                      │
│  ✓ Handle attribute mapping (dept → org)                        │
│                                                                 │
│  Deliverable: Working SSO authentication                        │
└─────────────────────────────────────────────────────────────────┘

Week 6-7: Security Hardening
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Implement rate limiting                                      │
│  ✓ Add audit logging                                            │
│  ✓ Enhance input validation                                     │
│  ✓ Configure security headers (CSP, HSTS)                       │
│  ✓ Set up monitoring and alerts                                 │
│  ✓ Third-party security audit (optional)                        │
│                                                                 │
│  Deliverable: Security Assessment Report                        │
└─────────────────────────────────────────────────────────────────┘

Week 8-9: Deployment Preparation
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Create Docker container                                      │
│  ✓ Write Kubernetes manifests                                   │
│  ✓ Set up CI/CD pipeline                                        │
│  ✓ Configure monitoring stack                                   │
│  ✓ Write deployment documentation                               │
│  ✓ Create runbooks for operations                               │
│                                                                 │
│  Deliverable: Deployment Package                                │
└─────────────────────────────────────────────────────────────────┘

Week 10: Testing
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Functional testing (all features work)                       │
│  ✓ Integration testing (SSO, APIs)                              │
│  ✓ Performance testing (load test)                              │
│  ✓ Security testing (penetration test)                          │
│  ✓ User acceptance testing (UAT) with Oxford                    │
│  ✓ Bug fixes from testing                                       │
│                                                                 │
│  Deliverable: Test Report & Bug Fixes                           │
└─────────────────────────────────────────────────────────────────┘

Week 11: Pilot Deployment
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Deploy to production (Oxford infrastructure)                 │
│  ✓ Onboard pilot users (10-20 researchers)                      │
│  ✓ Monitor closely for issues                                   │
│  ✓ Gather feedback                                              │
│  ✓ Make adjustments as needed                                   │
│                                                                 │
│  Deliverable: Pilot Deployment                                  │
└─────────────────────────────────────────────────────────────────┘

Week 12: Full Launch & Knowledge Transfer
┌─────────────────────────────────────────────────────────────────┐
│  ✓ Roll out to all users                                        │
│  ✓ Conduct training sessions                                    │
│  ✓ Hand over to Oxford IT team                                  │
│  ✓ Provide documentation & runbooks                             │
│  ✓ Set up support ticketing system                              │
│  ✓ Establish SLA and on-call rotation                           │
│                                                                 │
│  Deliverable: Production System + Training                      │
└─────────────────────────────────────────────────────────────────┘

Critical Path Items (Must Complete):
1. SSO Integration (blocker for auth)
2. Security Hardening (required for production)
3. Deployment Package (can't deploy without it)

Nice-to-Have (Can be post-launch):
- Advanced analytics
- Mobile app
- Additional integrations
- Custom workflows
```

---

## Summary

This document provides visual representations of:
1. **Current Architecture** - How your prototype works today
2. **Proposed SaaS Architecture** - If you host for Oxford
3. **Proposed On-Premise Architecture** - If Oxford hosts
4. **Data Model** - How data is organized and secured
5. **Authentication Flow** - How SSO integration works
6. **Kubernetes Deployment** - Modern container orchestration
7. **Security Layers** - Defense-in-depth approach
8. **Disaster Recovery** - HA and backup strategies
9. **Cost Estimation** - Budget planning
10. **Timeline** - 12-week implementation plan

**Use these diagrams during your technical discussion to:**
- ✅ Show you understand enterprise deployment
- ✅ Demonstrate flexibility in deployment options
- ✅ Illustrate security and scalability considerations
- ✅ Provide realistic timelines and cost estimates

**Good luck with your meeting!** 🎯
