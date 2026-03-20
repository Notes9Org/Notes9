export type MarketingDocument = {
  slug: string
  title: string
  audience: string
  format: string
  downloadHref: string
  summary: string
  bullets: string[]
}

export const marketingDocuments: MarketingDocument[] = [
  {
    slug: "quickstart-guide",
    title: "Quickstart Guide",
    audience: "New teams and pilot users",
    format: "Markdown",
    downloadHref: "/docs/notes9-quickstart-guide.md",
    summary:
      "A practical first-run guide for setting up one live workflow with projects, experiments, notes, and supporting literature.",
    bullets: [
      "How to pick the first workflow to model",
      "Setup sequence for project, experiment, note, and literature",
      "Minimum standards for a usable pilot",
    ],
  },
  {
    slug: "workflow-playbook",
    title: "Workflow Playbook",
    audience: "Researchers and operations leads",
    format: "Markdown",
    downloadHref: "/docs/notes9-workflow-playbook.md",
    summary:
      "Detailed operating guidance for how projects, experiments, lab notes, and literature should work together in daily use.",
    bullets: [
      "Recommended working pattern before, during, and after execution",
      "Naming guidance and reporting flow",
      "Operational checklist for consistent team usage",
    ],
  },
  {
    slug: "ai-usage-and-review-policy",
    title: "AI Usage and Review Policy",
    audience: "Any team using AI-supported features",
    format: "Markdown",
    downloadHref: "/docs/notes9-ai-usage-and-review-policy.md",
    summary:
      "A concrete policy for responsible use of summarization, citation support, drafting, and human review requirements.",
    bullets: [
      "Approved and restricted AI use cases",
      "Reviewer obligations before saving content",
      "Citation selection and bibliography review guidance",
    ],
  },
  {
    slug: "governance-and-data-controls",
    title: "Governance and Data Controls",
    audience: "Workspace owners, PIs, and admins",
    format: "Markdown",
    downloadHref: "/docs/notes9-governance-and-data-controls.md",
    summary:
      "Governance guidance for role ownership, access review, provenance expectations, exports, and operational controls.",
    bullets: [
      "Role model for ownership and review",
      "Record quality and provenance expectations",
      "Review cadence, export, and retention considerations",
    ],
  },
]
