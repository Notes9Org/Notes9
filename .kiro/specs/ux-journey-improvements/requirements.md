# Requirements Document

## Introduction

This specification documents the complete user journeys through the Notes9 research lab management application, identifies UX bugs and gaps discovered through code analysis, and defines requirements for improvements. The scope covers every authenticated section from login through dashboard, projects, experiments, lab notes, samples, equipment, protocols, literature reviews, papers/writing, research map, catalyst AI, reports, and settings.

## Glossary

- **App_Shell**: The authenticated layout wrapper (`AppLayout`) containing the left sidebar, header with breadcrumbs, main content area, and optional right AI sidebar
- **Navigation_Loader**: The full-screen branded loading overlay (`NavigationLoader`) shown during route transitions between pages
- **Left_Sidebar**: The collapsible navigation panel (`AppSidebar`) containing main nav links, search, recent projects tree, and user menu
- **Right_Sidebar**: The AI assistant panel (`RightSidebar`) accessible via the sparkles icon in the header
- **Resource_List_Page**: Any page that displays a filterable, grid/table-togglable list of entities (projects, experiments, samples, equipment, protocols, lab notes, literature, papers)
- **Empty_State**: The placeholder UI shown when a resource list contains zero items
- **Breadcrumb_Bar**: The header navigation trail showing the current location within the app hierarchy
- **Form_Page**: Any page containing a creation or edit form (new project, new experiment, new sample, new equipment, settings profile)
- **Detail_Page**: Any page showing a single entity with tabs and actions (project detail, experiment detail, literature detail, equipment detail)
- **Auth_Flow**: The set of pages handling authentication: login, sign-up, forgot-password, reset-password, OAuth callback, error, and sign-up-success
- **Toast_System**: The notification system using both `Toaster` (shadcn) and `Sonner` for user feedback messages

---

## User Journeys

### Journey 1: Authentication Flow

1. Unauthenticated user visits `/` → sees marketing landing page
2. User clicks "Sign In" → navigates to `/auth/login`
3. User can sign in via Google OAuth, Microsoft OAuth, or email/password
4. On success → redirected to `/dashboard`
5. Alternative: User clicks "Sign up" → `/auth/sign-up` → fills form → `/auth/sign-up-success`
6. Alternative: User clicks "Forgot password" → `/auth/forgot-password` → receives email → `/auth/reset-password`
7. OAuth errors → `/auth/error` with contextual message

### Journey 2: Dashboard → Project Creation → Exploration

1. User lands on `/dashboard` → sees welcome message, quick actions, recent experiments, recent notes, to-do panel
2. User clicks "Create New Project" quick action → `/projects/new`
3. User fills project form (name, description, priority, dates) → submits → redirected to `/projects/{id}`
4. Project detail shows overview tab (description, workspace with literature/protocols/experiments), team tab, reports tab
5. From project workspace, user can navigate to scoped experiments, literature, protocols

### Journey 3: Experiments Workflow

1. User navigates to `/experiments` from sidebar → sees filterable grid/table of experiments
2. User clicks "New experiment" → `/experiments/new` → fills form → redirected to experiment detail
3. Experiment detail (`/experiments/{id}`) shows tabs: Notes, Steps, Protocols, Samples, Data Files
4. User can create lab notes within experiment, link protocols, upload files, manage samples

### Journey 4: Lab Notes

1. User navigates to `/lab-notes` from sidebar → sees grid/table of all lab notes with project/experiment filters
2. Clicking a note that belongs to an experiment → redirected to `/experiments/{id}?noteId={noteId}`
3. User can create new lab notes via dialog, which are linked to experiments

### Journey 5: Resource Management (Samples, Equipment, Protocols)

1. Each resource has a list page with status overview cards, filters, grid/table toggle
2. Each has a "new" creation form and detail pages
3. Protocols can be linked to experiments; samples belong to experiments; equipment is standalone

### Journey 6: Literature & Writing

1. `/literature-reviews` → search papers, manage reference library with tabs (search, repo, staging)
2. `/papers` → writing workspace with tab-based document switching, AI-assisted writing
3. Both support project scoping via URL params

### Journey 7: Research Map & Catalyst AI

1. `/research-map` → visual graph of connected entities (projects, experiments, protocols, papers)
2. `/catalyst` → AI chat interface for research assistance

### Journey 8: Settings

1. `/settings` → tabs for Profile (name, avatar, role), Account (password, sign out), Preferences (theme, notifications)

---

## Requirements

### Requirement 1: Consistent Loading States Across Server-Rendered Pages

**User Story:** As a researcher, I want to see meaningful loading indicators when pages are fetching data, so that I understand the application is working and not frozen.

#### Acceptance Criteria

1. WHEN a server-rendered Resource_List_Page is loading, THE App_Shell SHALL display a skeleton placeholder matching the page layout structure (header area, filter row, and content grid/table area)
2. WHEN the Dashboard page is loading, THE App_Shell SHALL display skeleton placeholders for the welcome section, quick actions card, recent experiments card, recent notes card, and to-do panel
3. WHEN a Detail_Page is loading, THE App_Shell SHALL display a skeleton placeholder matching the header, badge area, and tab content structure
4. IF a page fetch takes longer than 3 seconds, THEN THE App_Shell SHALL continue displaying the skeleton without timeout or error until the server response arrives or a network error occurs

### Requirement 2: Navigation Loader Reliability and Dismissal

**User Story:** As a researcher, I want the full-screen navigation loader to always dismiss when the destination page renders, so that I am never stuck on a loading screen.

#### Acceptance Criteria

1. WHEN the Navigation_Loader is displayed and the destination route renders, THE Navigation_Loader SHALL dismiss within 350 milliseconds of the new pathname being detected
2. THE Navigation_Loader SHALL enforce a maximum display duration of 8 seconds for standard pages and 12 seconds for auth pages, after which the Navigation_Loader SHALL dismiss automatically
3. WHEN the user clicks a link to the current page (same pathname), THE Navigation_Loader SHALL NOT activate
4. WHEN the user clicks an external link or a link with `target="_blank"`, THE Navigation_Loader SHALL NOT activate
5. WHEN the user navigates between marketing pages, THE Navigation_Loader SHALL NOT activate
6. IF the Navigation_Loader safety timeout fires, THEN THE Navigation_Loader SHALL log a warning to the console indicating the destination route that failed to resolve

### Requirement 3: Sidebar Data Loading and Error Recovery

**User Story:** As a researcher, I want the sidebar to load my projects reliably and recover gracefully from errors, so that navigation is never broken.

#### Acceptance Criteria

1. WHILE the Left_Sidebar is fetching project data, THE Left_Sidebar SHALL display skeleton placeholders for the project tree items
2. IF the Left_Sidebar fails to fetch project data, THEN THE Left_Sidebar SHALL display a "No active projects" message and a retry mechanism
3. WHEN the Left_Sidebar detects a missing user profile during data fetch, THE Left_Sidebar SHALL attempt to create the profile and organization automatically before retrying the project fetch
4. THE Left_Sidebar SHALL subscribe to real-time updates for the projects and profiles tables and refresh the project tree when changes are detected
5. WHEN the user collapses the Left_Sidebar to icon mode, THE Left_Sidebar SHALL hide the search input and project tree, showing only navigation icons

### Requirement 4: Form Validation and Error Feedback on Creation Pages

**User Story:** As a researcher, I want clear, immediate feedback when I make errors on creation forms, so that I can correct them without confusion.

#### Acceptance Criteria

1. WHEN the user submits the New Project form with an empty name field, THE Form_Page SHALL prevent submission and display a validation message on the name field
2. WHEN the user sets an end date earlier than the start date on the New Project form, THE Form_Page SHALL display an inline error message indicating the date order violation
3. WHEN a server-side error occurs during project creation (e.g., duplicate name), THE Form_Page SHALL display the error message in a visible error banner within the form
4. WHILE the form is submitting, THE Form_Page SHALL disable the submit button and display a loading indicator with text "Creating..."
5. WHEN the user submits the Sign-Up form with an email that already exists, THE Auth_Flow SHALL display an inline error and offer a link to sign in with that email instead
6. WHEN the user submits the Reset Password form with mismatched passwords, THE Auth_Flow SHALL display an inline error message "Passwords do not match"

### Requirement 5: Empty State Consistency and Actionability

**User Story:** As a new researcher with no data, I want every empty list page to clearly guide me toward creating my first item, so that I am never confused about what to do next.

#### Acceptance Criteria

1. WHEN a Resource_List_Page has zero items, THE Resource_List_Page SHALL display an empty state with a relevant icon, a descriptive message, and a primary call-to-action button to create the first item
2. THE Empty_State for Projects SHALL display a "No projects yet" message with a "Create First Project" button linking to `/projects/new`
3. THE Empty_State for Experiments SHALL display a "No experiments yet" message with a "Create First Experiment" button, and when project-scoped, the button SHALL link to `/experiments/new?project={projectId}`
4. THE Empty_State for Samples SHALL display a "No samples recorded" message with a "Create First Sample" button linking to `/samples/new`
5. THE Empty_State for Equipment SHALL display a "No equipment registered" message with a "Create First Equipment" button linking to `/equipment/new`
6. WHEN filters are applied and no items match, THE Resource_List_Page SHALL display a "No items match the selected filters" message distinct from the zero-data empty state

### Requirement 6: Breadcrumb Navigation Accuracy and Mobile Usability

**User Story:** As a researcher navigating deep into project hierarchies, I want breadcrumbs to always reflect my current location and be usable on mobile, so that I can orient myself and navigate back efficiently.

#### Acceptance Criteria

1. WHEN the user is on a project-scoped experiment page, THE Breadcrumb_Bar SHALL display the path: Project Name > Experiment Name
2. WHEN the user is on a non-scoped experiment page, THE Breadcrumb_Bar SHALL display the path: Projects > Project Name > Experiment Name
3. WHILE viewing on a mobile device (viewport width 768px or less), THE Breadcrumb_Bar SHALL be horizontally scrollable with gradient fade indicators on the edges when content overflows
4. WHILE viewing on a mobile device, THE Breadcrumb_Bar SHALL auto-scroll to show the rightmost (current page) segment by default
5. WHEN breadcrumb labels exceed 18 characters on mobile, THE Breadcrumb_Bar SHALL truncate labels with an ellipsis and provide the full label via a title attribute

### Requirement 7: Grid/Table View Toggle Consistency and Persistence

**User Story:** As a researcher, I want the grid/table view toggle to behave consistently across all list pages and respect my device constraints, so that I always see data in the most appropriate format.

#### Acceptance Criteria

1. WHILE the viewport width is 768px or less, THE Resource_List_Page SHALL lock the view to grid mode and disable the table toggle button
2. WHEN the user switches from desktop to mobile viewport, THE Resource_List_Page SHALL automatically switch to grid view
3. THE Resource_List_Page SHALL display the grid/table toggle in a consistent position (top-right of the header row) across all resource types: projects, experiments, samples, equipment, lab notes, and papers

### Requirement 8: Error Handling for Data Fetch Failures

**User Story:** As a researcher, I want to see clear error messages when data fails to load, so that I understand what went wrong and can take action.

#### Acceptance Criteria

1. IF the Lab Notes page fails to fetch notes from the database, THEN THE Lab_Notes_Page SHALL display an Alert component with variant "destructive" containing the error message
2. IF the Papers page fails to fetch papers from the database, THEN THE Papers_Page SHALL display an Alert with the error message and a hint about the required database migration
3. IF the Settings page fails to load the user profile, THEN THE Settings_Page SHALL display a loading state that does not hang indefinitely
4. WHEN any Resource_List_Page encounters a fetch error, THE Resource_List_Page SHALL display the error in a visible, non-dismissable alert above the content area

### Requirement 9: Authentication Flow Completeness and Edge Cases

**User Story:** As a new or returning researcher, I want the authentication flow to handle all edge cases gracefully, so that I can always access my workspace.

#### Acceptance Criteria

1. WHEN an authenticated user visits the root URL `/`, THE App_Shell SHALL redirect the user to `/dashboard`
2. WHEN an unauthenticated user visits any `/(app)` route, THE App_Shell SHALL redirect the user to `/auth/login`
3. WHEN an OAuth callback returns an error, THE Auth_Flow SHALL redirect to `/auth/error` with the error code and description displayed
4. WHEN the user successfully resets their password, THE Auth_Flow SHALL display a success message and auto-redirect to `/auth/login` after 3 seconds
5. WHEN the login page receives an `email` query parameter, THE Auth_Flow SHALL pre-fill the email input field with that value
6. WHEN the Sign-Up page detects an existing email (via debounced check), THE Auth_Flow SHALL display an inline warning and a "Sign in with this email instead" link within 500 milliseconds of the user stopping typing

### Requirement 10: Dashboard Quick Actions and Recent Items

**User Story:** As a researcher, I want the dashboard to provide quick access to common actions and show my most recent work, so that I can resume work efficiently.

#### Acceptance Criteria

1. THE Dashboard SHALL display quick action buttons for "Create New Project", "Add Experiment", and "Record Sample"
2. THE Dashboard SHALL display up to 3 recent experiments with name, project, assignee, status badge, and progress bar
3. THE Dashboard SHALL display up to 3 recent lab notes with title, experiment name, project name, note type badge, and last updated date
4. WHEN there are no recent experiments, THE Dashboard SHALL display a "No recent experiments" text message
5. WHEN there are no recent lab notes, THE Dashboard SHALL display a "No recent notes" text message
6. THE Dashboard SHALL display a To-Do panel with task creation (supporting @mentions for experiments and projects), completion toggling, inline editing, priority setting, due dates, and sorting options

### Requirement 11: Settings Page Theme Toggle Hydration Safety

**User Story:** As a researcher, I want the theme toggle to work without visual glitches on page load, so that the interface feels polished.

#### Acceptance Criteria

1. THE Settings_Page SHALL defer rendering of the theme toggle buttons until the component has mounted on the client, preventing hydration mismatch between server and client renders
2. WHEN the user clicks a theme button (Light, Dark, System), THE Settings_Page SHALL apply the theme change immediately without a page reload
3. THE App_Shell header theme toggle SHALL render a fallback icon (Moon) during server render and switch to the correct icon (Sun or Moon) after client mount

### Requirement 12: Project-Scoped Navigation Across Features

**User Story:** As a researcher working within a project, I want to navigate to experiments, literature, and protocols scoped to that project, so that I see only relevant data without manual filtering.

#### Acceptance Criteria

1. WHEN the user navigates to experiments from a project workspace, THE Experiments_Page SHALL pre-filter to show only experiments belonging to that project
2. WHEN the user navigates to literature from a project workspace, THE Literature_Page SHALL pre-filter to show only literature linked to that project
3. WHEN the user navigates to protocols from a project workspace, THE Protocols_Page SHALL pre-filter to show only protocols linked to that project
4. WHEN a project filter is active via URL parameter, THE Resource_List_Page SHALL display a "Remove project filter" button that clears the filter and shows all items
5. WHEN a project filter is active, THE Breadcrumb_Bar SHALL display the project name as a clickable link back to the project detail page

### Requirement 13: Accessible Interactive Elements

**User Story:** As a researcher using assistive technology, I want all interactive elements to have proper labels and keyboard support, so that I can use the application effectively.

#### Acceptance Criteria

1. THE Left_Sidebar mobile menu button SHALL have an `aria-label` of "Open navigation"
2. THE password visibility toggle on the Login page SHALL have an `aria-label` that updates between "Show password" and "Hide password" based on the current state
3. THE grid/table view toggle buttons SHALL be keyboard-focusable and operable via Enter or Space keys
4. THE Navigation_Loader overlay SHALL have `pointer-events: none` so that it does not block keyboard navigation or screen reader interaction with underlying content
5. THE Right_Sidebar Sheet on mobile SHALL have a visually hidden `SheetTitle` for screen reader announcement

### Requirement 14: Dual Toast System Consolidation

**User Story:** As a researcher, I want notification toasts to appear consistently in one location, so that I do not miss important feedback messages.

#### Acceptance Criteria

1. THE App_Shell SHALL render both the shadcn `Toaster` and `Sonner` toast providers in the root layout
2. WHEN a toast notification is triggered, THE Toast_System SHALL display the toast in a consistent screen position across all pages
3. THE Toast_System SHALL support variant types: default (success), destructive (error), and informational

### Requirement 15: Left Sidebar Stale Navigation State

**User Story:** As a researcher, I want the sidebar to always highlight the correct current page, so that I know where I am in the application.

#### Acceptance Criteria

1. WHEN the user navigates to a page, THE Left_Sidebar SHALL highlight the corresponding navigation item by matching the current pathname
2. WHEN the user is on a project-scoped deep link (e.g., `/experiments?project=...`), THE Left_Sidebar SHALL NOT highlight the experiments nav item to avoid confusion with the project context
3. WHILE the Left_Sidebar has not yet mounted on the client, THE Left_Sidebar SHALL NOT apply active styling to any navigation item to prevent hydration mismatch flicker
