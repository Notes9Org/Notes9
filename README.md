# Notes9

A comprehensive, full-stack Laboratory Inventory Management System built with Next.js 16, Supabase, and modern web technologies.

## Features

### Core Functionality
- **Project Management** - Organize research initiatives with team collaboration
- **Experiment Tracking** - Design, execute, and monitor experimental procedures
- **Sample Inventory** - Track laboratory samples with detailed metadata
- **Equipment Management** - Monitor equipment status and maintenance schedules
- **Protocol Library** - Store and manage Standard Operating Procedures (SOPs)
- **Lab Notes** - Rich text editor (Text Block) for documenting observations
- **Reports & Analytics** - Generate comprehensive project and experiment reports
- **User Management** - Role-based access control with Supabase Auth

### User Interface
- **Three-Panel Layout**
  - Left Sidebar: Navigation and active projects
  - Center: Main content area
  - Right Sidebar: AI Assistant, calendar, and recent activity
- **Dark Theme** - Professional scientific aesthetic with proper contrast
- **Responsive Design** - Works on desktop and mobile devices
- **Real-time Updates** - Live data from Supabase

## Tech Stack

- **Framework**: Next.js 16 (App Router, React Server Components)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS v4, shadcn/ui components
- **Language**: TypeScript
- **State Management**: React hooks, SWR for data fetching

## Database Schema

The system includes 18+ tables covering:
- Organizations, Profiles (Users)
- Projects, Experiments, Assays
- Protocols/SOPs
- Samples, Equipment
- Lab Notes, Reports
- Quality Control, Project Members
- Equipment Maintenance, Sample Transfers

All tables have RLS policies for secure multi-tenant data access.

## Getting Started

### 1. Database Setup

Run the SQL scripts in order:
\`\`\`bash
# From Supabase SQL Editor or v0 scripts folder:
1. scripts/001_create_tables.sql
2. scripts/002_enable_rls.sql
3. scripts/003_seed_data.sql
4. scripts/004_create_profile_trigger.sql
\`\`\`

### 2. Environment Variables

Already configured in your v0 project:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Database connection strings

### 3. Run the Application

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000)

## User Stories

### Story 1: Project Design & Setup
**Actor**: Dr. Sarah Chen (Principal Investigator)

1. Login → Dashboard
2. Create new project: "Cancer Drug Discovery Initiative"
3. Add team members and set priority
4. Create first experiment with assays and protocols
5. Schedule equipment and assign researchers

### Story 2: Experiment Execution
**Actor**: Mike Rodriguez (Lab Technician)

1. View assigned experiments in dashboard
2. Access experiment details with protocol steps
3. Record sample information and storage location
4. Upload raw data files (CSV, images)
5. Add lab notes using the text editor
6. Mark experiment as "Data Ready"

### Story 3: Data Analysis & Reporting
**Actor**: Dr. Emily Watson (Data Analyst)

1. Filter completed experiments
2. Review uploaded data and visualizations
3. Document conclusions in experiment report
4. Navigate to project level
5. Generate consolidated project report
6. Export as PDF and share with stakeholders

## Key Pages

- `/dashboard` - Overview with stats and recent activity
- `/projects` - List all projects, create new
- `/projects/[id]` - Project details with experiments and team
- `/experiments` - List all experiments
- `/experiments/[id]` - Experiment detail with tabs (overview, protocol, samples, data, notes)
- `/samples` - Sample inventory with search
- `/equipment` - Equipment status and tracking
- `/protocols` - SOP library
- `/reports` - Analytics and report generation
- `/settings` - User profile and preferences

## Components

### Reusable Components
- `AppLayout` - Three-panel layout wrapper
- `LeftSidebar` - Navigation and projects
- `RightSidebar` - AI assistant and tools
- `Text Block` - Rich text editor for lab notes
- shadcn/ui components (Button, Card, Input, Select, etc.)

## Authentication Flow

1. User visits `/` → redirects to `/auth/login`
2. Sign up creates account and profile
3. Email verification required
4. Protected routes check auth via middleware
5. Sign out from `/settings`

## Data Flow

1. **Server Components** fetch data from Supabase
2. **Client Components** handle forms and interactivity
3. **Supabase Client** for client-side operations
4. **Supabase Server** for server-side queries
5. **RLS Policies** enforce data access rules

## Deployment

This project is ready to deploy on Vercel:

\`\`\`bash
# Push to GitHub
git init
git add .
git commit -m "Initial LIMS system"
git push origin main

# Deploy via Vercel Dashboard or CLI
vercel deploy
\`\`\`

Environment variables are automatically synced from your v0 project.

## Future Enhancements

- Real AI Assistant integration
- Advanced analytics charts
- Batch operations for samples
- Equipment reservation system
- Email notifications
- PDF report generation
- Data export functionality
- Audit logging
- Advanced search and filters
- Mobile app

## Support

For issues or questions, refer to the documentation:
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)

