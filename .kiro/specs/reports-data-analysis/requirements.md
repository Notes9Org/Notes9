# Requirements Document

## Introduction

Enhance the existing Reports page in the LIMS application to support AI-powered data analysis report generation. Users will be able to create data analysis reports for any project by interacting with the Notes9 `/chat` API (same approach as the paper writing assistant), view generated reports, and browse/filter completed reports. The initial implementation uses a custom system prompt with the existing chat endpoint; the backend can later be swapped to a dedicated Biomni `/biomni/data_analysis` endpoint without frontend changes.

## Glossary

- **Reports_Page**: The existing Next.js page at `/reports` that lists and manages research reports
- **Biomni_Agent**: The external AI agent service (accessed via Lambda) that will generate data analysis reports in a future phase; initial implementation uses Notes9 `/chat` API
- **Report_Generator**: The client-side UI component that allows users to configure and trigger new data analysis report generation
- **Report_Detail_View**: The page that displays a single report's full content and metadata
- **Reports_API**: The Next.js API route that calls the Notes9 `/chat` endpoint with a data analysis system prompt
- **Report_Stream_Handler**: (Future phase) The client-side hook for SSE streaming from the Biomni agent
- **SSE**: (Future phase) Server-Sent Events streaming protocol
- **Clarification_Flow**: (Future phase) Interactive exchange where the Biomni agent asks follow-up questions

## Requirements

### Requirement 1: Report Generation via AI

**User Story:** As a researcher, I want to generate data analysis reports for my projects using AI, so that I can get insights from my experimental data.

#### Acceptance Criteria

1. WHEN the user clicks "Generate Report" on the Reports_Page, THE Report_Generator SHALL display a dialog allowing the user to select a project, optionally select experiments, and enter a query describing the desired analysis
2. WHEN the user submits a report generation request, THE Reports_API SHALL forward the request to the Notes9 `/chat` endpoint with a data analysis system prompt
3. WHILE the AI is generating a report, THE Report_Generator SHALL display a loading indicator
4. WHEN the AI returns a completed result, THE Reports_Page SHALL persist the report content and metadata to the Supabase `reports` table
5. IF the AI returns an error, THEN THE Report_Generator SHALL display the error message to the user and allow retry

### Requirement 2: Clarification Flow Support (Future Phase)

**User Story:** As a researcher, I want to answer clarifying questions from the AI agent during report generation, so that the generated report is more relevant to my needs.

> **Note:** This requirement is deferred to a future phase when the Biomni `/biomni/data_analysis` backend is implemented. The initial implementation uses a simple request/response flow.

#### Acceptance Criteria

1. (Future) WHEN the Biomni_Agent emits a `clarify` event during report generation, THE Report_Generator SHALL display the clarification question and any suggested options to the user
2. (Future) WHEN the user selects or types a clarification answer, THE Report_Stream_Handler SHALL send the answer back to the Biomni_Agent and resume streaming
3. (Future) WHEN the user chooses to skip clarification, THE Report_Stream_Handler SHALL re-send the request with `skip_clarify` set to true

### Requirement 3: Reports API for Data Analysis

**User Story:** As a developer, I want a dedicated API route for report generation, so that the AI integration for reports is cleanly separated.

#### Acceptance Criteria

1. THE Reports_API SHALL expose a POST endpoint at `/api/reports/generate` that calls the Notes9 `/chat` endpoint with a data analysis system prompt
2. WHEN a request lacks a valid Bearer token, THE Reports_API SHALL return a 401 status with an error message
3. WHEN neither `NEXT_PUBLIC_NOTES9_API_URL` nor `AI_SERVICE_URL` is configured, THE Reports_API SHALL return a 503 status with a descriptive error message
4. THE Reports_API SHALL forward `query`, `projectName`, and optional `experimentNames` fields, embedding them into the system prompt
5. THE Reports_API SHALL use a data analysis system prompt that instructs the AI to produce a structured markdown report

### Requirement 4: Report Detail View

**User Story:** As a researcher, I want to view the full content of a generated report, so that I can read the analysis, review references, and export the results.

#### Acceptance Criteria

1. WHEN the user clicks "View" on a report card, THE Reports_Page SHALL navigate to `/reports/[id]` showing the Report_Detail_View
2. THE Report_Detail_View SHALL display the report title, status, type, creation date, associated project, and associated experiment
3. THE Report_Detail_View SHALL render the report content as formatted markdown
4. WHERE the report includes structured references, THE Report_Detail_View SHALL display them in a references section
5. IF the requested report does not exist, THEN THE Report_Detail_View SHALL display a "not found" message and a link back to the reports list

### Requirement 5: Report List Filtering and Display

**User Story:** As a researcher, I want to filter and browse my reports, so that I can find specific analyses across my projects.

#### Acceptance Criteria

1. THE Reports_Page SHALL display all reports in reverse chronological order with title, status badge, type badge, project name, and creation date
2. THE Reports_Page SHALL provide filters for project, experiment, status, and report type
3. WHEN no reports exist, THE Reports_Page SHALL display an empty state with a prompt to generate the first report
4. WHEN filters produce no matching reports, THE Reports_Page SHALL display a "no results" message

### Requirement 6: Report Persistence

**User Story:** As a researcher, I want my generated reports to be saved automatically, so that I can access them later without regenerating.

#### Acceptance Criteria

1. WHEN the AI completes report generation, THE Reports_Page SHALL insert a new row into the Supabase `reports` table with the report title, content, status, report_type, project_id, experiment_id, and generated_by fields
2. THE Reports_Page SHALL set the initial status of a newly generated report to "draft"
3. WHEN a report is saved, THE Reports_Page SHALL set the `report_type` field to "data_analysis"
4. IF the Supabase insert fails, THEN THE Report_Generator SHALL display an error message and retain the generated content so the user does not lose the analysis

### Requirement 7: Loading and Error States

**User Story:** As a researcher, I want clear feedback during page loading and errors, so that I understand the current state of the application.

#### Acceptance Criteria

1. WHILE the Reports_Page is loading data from Supabase, THE Reports_Page SHALL display a skeleton loading state
2. IF the Reports_Page fails to load data, THEN THE Reports_Page SHALL display an error message with a retry option
3. WHILE a report is being generated, THE Report_Generator SHALL display a loading indicator
4. WHILE waiting for the AI response, THE Report_Generator SHALL display a loading indicator
