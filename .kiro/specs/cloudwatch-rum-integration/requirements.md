# Requirements Document

## Introduction

Integrate Amazon CloudWatch RUM (Real User Monitoring) into the Notes9 Next.js 16 application to capture user journey metrics, page load performance, browser errors, and custom business events. The integration must work with the App Router client/server component model, cover both authenticated app routes and public marketing routes, and provide a centralized utility for firing custom events from any component. The solution should be cost-conscious (moderate research portal traffic) and gracefully degrade when RUM is disabled or misconfigured.

## Glossary

- **RUM_Client**: The Amazon CloudWatch RUM web client SDK (`aws-rum-web`) that runs in the browser to collect telemetry
- **RUM_Provider**: A React client component that initializes the RUM_Client and makes it available to the component tree via React Context
- **RUM_Config**: The set of environment variables required to configure the RUM_Client (application ID, identity pool ID, endpoint, region, etc.)
- **Custom_Event**: An application-specific event recorded via the RUM_Client `recordEvent` API to track user actions beyond automatic page views and errors
- **RUM_Hook**: A custom React hook (`useRum`) that provides access to the RUM_Client instance and helper functions for recording Custom_Events
- **Root_Layout**: The top-level Next.js layout at `app/layout.tsx` that wraps all routes
- **App_Layout**: The authenticated layout at `app/(app)/layout.tsx` that wraps all app routes
- **Marketing_Layout**: The public layout at `app/(marketing)/layout.tsx` that wraps marketing pages
- **RUM_Utility**: A standalone helper module (`lib/rum.ts`) that exposes functions for recording Custom_Events without requiring React Context, for use in non-component code such as API route handlers or utility functions

## Requirements

### Requirement 1: RUM Client Initialization

**User Story:** As a developer, I want the CloudWatch RUM web client to initialize automatically when the application loads in the browser, so that telemetry collection begins without manual setup on each page.

#### Acceptance Criteria

1. WHEN the Root_Layout renders in the browser, THE RUM_Provider SHALL initialize the RUM_Client using values from RUM_Config environment variables
2. THE RUM_Provider SHALL be a client component (`"use client"`) rendered inside the Root_Layout `<body>` element
3. WHEN any required RUM_Config environment variable is missing or empty, THE RUM_Provider SHALL skip initialization and log a warning to the browser console
4. THE RUM_Provider SHALL initialize the RUM_Client with automatic page view tracking enabled
5. THE RUM_Provider SHALL initialize the RUM_Client with JavaScript error tracking enabled
6. THE RUM_Provider SHALL initialize the RUM_Client with HTTP request tracking (XMLHttpRequest and fetch) enabled
7. THE RUM_Provider SHALL configure session sampling at 100% to capture all user sessions for the moderate-traffic research portal
8. IF the RUM_Client constructor throws an error, THEN THE RUM_Provider SHALL catch the error, log it to the browser console, and continue rendering the application without RUM

### Requirement 2: Environment Configuration

**User Story:** As a developer, I want RUM configuration managed through environment variables, so that I can configure different RUM applications per environment without code changes.

#### Acceptance Criteria

1. THE RUM_Config SHALL use the following `NEXT_PUBLIC_` prefixed environment variables: `NEXT_PUBLIC_CW_RUM_APP_ID`, `NEXT_PUBLIC_CW_RUM_IDENTITY_POOL_ID`, `NEXT_PUBLIC_CW_RUM_ENDPOINT`, and `NEXT_PUBLIC_CW_RUM_REGION`
2. WHEN `NEXT_PUBLIC_CW_RUM_APP_ID` is not set, THE RUM_Provider SHALL treat RUM as disabled and skip all initialization
3. THE RUM_Config SHALL default `NEXT_PUBLIC_CW_RUM_REGION` to `us-east-1` when not explicitly set
4. WHEN the application runs in a development environment (detected via `process.env.NODE_ENV === 'development'`), THE RUM_Provider SHALL skip initialization unless `NEXT_PUBLIC_CW_RUM_APP_ID` is explicitly set

### Requirement 3: Custom Event Tracking Utility

**User Story:** As a developer, I want a simple API to record custom business events from any component or utility module, so that I can track key user actions in CloudWatch RUM without coupling components to the SDK.

#### Acceptance Criteria

1. THE RUM_Hook SHALL expose a `recordEvent` function that accepts an event type string and an event data object
2. WHEN the RUM_Client is not initialized (RUM disabled or failed), THE RUM_Hook `recordEvent` function SHALL silently no-op without throwing an error
3. THE RUM_Utility SHALL export a `recordRumEvent` function that accepts an event type string and an event data object, for use outside React components
4. WHEN the RUM_Client is not initialized, THE RUM_Utility `recordRumEvent` function SHALL silently no-op without throwing an error
5. THE RUM_Hook SHALL expose the RUM_Client instance directly for advanced use cases

### Requirement 4: Page Navigation Tracking

**User Story:** As a product owner, I want every page navigation tracked automatically in CloudWatch RUM, so that I can analyze user journeys across the application.

#### Acceptance Criteria

1. WHEN a user navigates between routes using Next.js client-side navigation, THE RUM_Client SHALL record a page view event with the new route path
2. THE RUM_Client SHALL track page views for authenticated routes under `app/(app)/`
3. THE RUM_Client SHALL track page views for marketing routes under `app/(marketing)/`
4. THE RUM_Client SHALL track page views for auth routes under `app/auth/`

### Requirement 5: Key User Action Events

**User Story:** As a product owner, I want custom events for key user actions, so that I can understand feature usage and user behavior patterns in the CloudWatch RUM console.

#### Acceptance Criteria

1. WHEN a user creates a new experiment, THE application SHALL record a Custom_Event with type `experiment_created` and include the project ID
2. WHEN a user generates a report, THE application SHALL record a Custom_Event with type `report_generated` and include the project ID and report type
3. WHEN a user creates a new project, THE application SHALL record a Custom_Event with type `project_created`
4. WHEN a user sends a message in Catalyst (AI chat), THE application SHALL record a Custom_Event with type `catalyst_message_sent`
5. WHEN a user creates a new lab note, THE application SHALL record a Custom_Event with type `lab_note_created` and include the experiment ID
6. WHEN a user creates a new protocol, THE application SHALL record a Custom_Event with type `protocol_created`
7. WHEN a user views the Research Map, THE application SHALL record a Custom_Event with type `research_map_viewed`
8. WHEN a user completes a login, THE application SHALL record a Custom_Event with type `user_logged_in`
9. WHEN a user completes a signup, THE application SHALL record a Custom_Event with type `user_signed_up`

### Requirement 6: Performance and Bundle Impact

**User Story:** As a developer, I want the RUM integration to have minimal impact on page load performance, so that the user experience is not degraded.

#### Acceptance Criteria

1. THE RUM_Provider SHALL load the `aws-rum-web` SDK using dynamic import (`next/dynamic` or `import()`) so that the SDK is not included in the initial JavaScript bundle
2. THE RUM_Provider SHALL initialize the RUM_Client after the component mounts (inside a `useEffect` hook) to avoid blocking the initial render
3. THE RUM_Provider SHALL NOT block or delay rendering of child components during RUM_Client initialization

### Requirement 7: Error Resilience

**User Story:** As a developer, I want the RUM integration to be fully resilient to failures, so that a RUM outage or misconfiguration never breaks the application.

#### Acceptance Criteria

1. IF the `aws-rum-web` dynamic import fails, THEN THE RUM_Provider SHALL catch the error, log it to the browser console, and render children normally
2. IF the RUM_Client `recordEvent` call throws an error, THEN THE RUM_Hook SHALL catch the error and log it to the browser console without propagating the error to the calling component
3. IF the RUM_Client `recordEvent` call throws an error, THEN THE RUM_Utility SHALL catch the error and log it to the browser console without propagating the error
4. THE RUM_Provider SHALL wrap all RUM_Client interactions in try-catch blocks to prevent unhandled exceptions from affecting the application

### Requirement 8: Authenticated User Metadata

**User Story:** As a product owner, I want RUM sessions associated with authenticated user IDs, so that I can correlate user behavior with specific accounts in the CloudWatch RUM console.

#### Acceptance Criteria

1. WHEN a user is authenticated via Supabase, THE RUM_Provider SHALL add the user ID as session metadata using the RUM_Client `addSessionMetadata` API
2. WHEN the user logs out, THE RUM_Provider SHALL not carry over the previous user's metadata to the new anonymous session
3. THE RUM_Provider SHALL NOT include any personally identifiable information (email, name) in session metadata — only the opaque Supabase user UUID
