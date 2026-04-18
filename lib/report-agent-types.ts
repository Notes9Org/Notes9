/** Types for the data analysis report generation API (`/api/reports/generate`). */

export type ReportGenerationRequest = {
  query: string;
  projectId: string;
  projectName: string;
  experimentIds?: string[];
  experimentNames?: string[];
  /** CSV data extracted from experiment data files, included in the AI prompt. */
  experimentData?: string;
};

export type ReportGenerationResponse = {
  content: string;
};
