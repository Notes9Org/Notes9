# Mock Supabase Setup for Local Development

This setup allows you to run the Notes9 application locally without needing actual Supabase credentials.

## What's Been Added

### 1. Mock Supabase Client (`lib/supabase/mock-client.ts`)
- Simulates Supabase auth and database operations
- Returns mock data for projects, experiments, lab notes, etc.
- Handles count queries and filtering
- Provides realistic demo data

### 2. Updated Client Files
- `lib/supabase/client.ts` - Falls back to mock client when env vars missing
- `lib/supabase/server.ts` - Falls back to mock client when env vars missing
- `lib/supabase/middleware.ts` - Skips auth checks in mock mode

### 3. Environment Setup
- `.env.local` - Contains commented examples and mock mode flag

## Mock Data Included

### Users
- Demo user: `demo@example.com` (Demo User)

### Projects
- Cancer Drug Discovery Initiative (active)
- Protein Structure Elucidation (active) 
- Gene Expression Analysis (planning)

### Experiments
- Compound Screening Batch A
- Protein Crystallization
- X-ray Diffraction Analysis
- RNA Sequencing Prep

### Lab Notes
- Initial observations
- Crystal formation notes
- Diffraction patterns

## Configuration

### Mock Mode Control
The application uses a simple constant to control mock dependencies:

**File: `lib/config.ts`**
```typescript
export const USE_MOCK_DEPENDENCIES = true // 👈 Change to false for production
```

⚠️ **IMPORTANT**: Always set this to `false` before committing to production!

### Environment Variables
**File: `.env.local`** (only needed for real Supabase)
```bash
# Real Supabase credentials (when USE_MOCK_DEPENDENCIES = false)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url  
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## How to Test

### 1. Update Node.js (Required)
The application requires Node.js >= 20.9.0. You're currently on 18.20.5.

Update Node.js:
```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or download from nodejs.org
```

### 2. Enable Mock Mode
Ensure `lib/config.ts` has:
```typescript
export const USE_MOCK_DEPENDENCIES = true
```

### 3. Run the Application
```bash
npm run dev
```

### 3. Test the Resizable Sidebars
1. Open http://localhost:3000
2. You'll be automatically redirected to `/dashboard` (no auth required in mock mode)
3. Try dragging the borders between:
   - Left sidebar and main content
   - Main content and right sidebar
4. Sidebars should resize smoothly with visual feedback

## Features Working in Mock Mode

✅ **Layout & Navigation**
- Three-panel layout with resizable sidebars
- Left sidebar navigation
- Right sidebar with AI assistant placeholder

✅ **Data Display**
- Project list with mock data
- Experiment hierarchy
- Lab notes structure
- Count badges on navigation items

✅ **Routing**
- All page routes work
- Project and experiment detail pages
- Settings and other sections

## Limitations in Mock Mode

❌ **No Real Data Persistence**
- Changes don't save between sessions
- Form submissions return success but don't persist

❌ **No Real Authentication**
- All users see the same mock data
- No actual login/logout functionality

❌ **No File Uploads**
- File upload dialogs work but files aren't stored

## Switching Between Mock and Real Supabase

### For Local Development (Mock Mode)
1. In `lib/config.ts`, set:
```typescript
export const USE_MOCK_DEPENDENCIES = true
```
2. Run `npm run dev`

### For Production (Real Supabase)
1. Create a Supabase project at https://supabase.com
2. In `lib/config.ts`, set:
```typescript
export const USE_MOCK_DEPENDENCIES = false
```
3. Update `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_actual_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_actual_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
4. Run the SQL scripts in the `scripts/` folder
5. Restart the development server

### ⚠️ Production Checklist
Before deploying:
- [ ] Set `USE_MOCK_DEPENDENCIES = false` in `lib/config.ts`
- [ ] Provide real Supabase environment variables
- [ ] Test with real Supabase locally first

## Testing the Resizable Sidebars

The main feature you requested - draggable sidebar borders - should work perfectly in mock mode:

1. **Left Sidebar**: Drag the right border to resize (200px - 400px range)
2. **Right Sidebar**: Drag the left border to resize (240px - 480px range)
3. **Visual Feedback**: Borders highlight when hovering/dragging
4. **Smooth Resizing**: Uses CSS custom properties for optimal performance

The resize handles are subtle but functional - look for the thin vertical lines at the sidebar edges that change color on hover.