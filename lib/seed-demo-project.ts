import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Distinctive name for the seeded demo project. `projects` has a UNIQUE
 * (organization_id, name) constraint, so this also guards idempotency: a second
 * seed attempt hits the conflict on the project insert and returns early.
 */
export const DEMO_PROJECT_NAME = "Antibody Expression — anti-PD-1 (demo)"

/**
 * Seeds a ready-made demo project (project → experiments → protocol → lab notes
 * → samples → literature) for a new user, so their first moment in Notes9 has
 * real content to explore and Catalyst can answer from *their* project.
 *
 * Uses a service-role client (bypasses RLS): it sets `organization_id` on
 * org-scoped tables and `created_by = userId` on owner-scoped tables (samples,
 * lab_notes, literature_reviews) so the rows are visible to the new user.
 * Idempotent: returns early if the demo project already exists.
 */
export async function seedDemoProject(
  admin: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<void> {
  // Namespace globally-unique sample codes per user.
  const suffix = userId.slice(0, 8)

  // 1) Project (unique org+name → also the idempotency guard)
  const projRes = await admin
    .from("projects")
    .insert({
      organization_id: organizationId,
      created_by: userId,
      name: DEMO_PROJECT_NAME,
      description:
        "A ready-made demo project so you can explore Notes9 with real content. Recombinant expression and purification of an anti-PD-1 monoclonal antibody in HEK293T using a pET-28a construct.",
      status: "active",
      priority: "high",
    })
    .select("id")
    .single()

  if (projRes.error) {
    // 23505 = already seeded (concurrent run or retry) — nothing to do.
    if (projRes.error.code === "23505") return
    throw new Error(`seed project failed: ${projRes.error.message}`)
  }
  const projectId = projRes.data.id as string

  // 2) Experiments
  const expRes = await admin
    .from("experiments")
    .insert([
      {
        project_id: projectId,
        created_by: userId,
        name: "Transfection screen — PEI:DNA ratios",
        description:
          "Screen of PEI:DNA ratios (1:1 – 4:1) for transient anti-PD-1 expression in HEK293T.",
        hypothesis:
          "A 3:1 PEI:DNA ratio maximizes transient yield without excess cytotoxicity.",
        status: "data_ready",
      },
      {
        project_id: projectId,
        created_by: userId,
        name: "IMAC purification — His-tag elution",
        description:
          "Ni-NTA affinity purification of His-tagged anti-PD-1 with an imidazole gradient.",
        status: "analyzed",
      },
    ])
    .select("id, name")

  const exps = expRes.data ?? []
  const expTransfection =
    (exps.find((e) => String(e.name).startsWith("Transfection"))?.id as string | undefined) ?? null
  const expPurification =
    (exps.find((e) => String(e.name).startsWith("IMAC"))?.id as string | undefined) ?? null

  // 3) Protocol
  await admin.from("protocols").insert({
    organization_id: organizationId,
    created_by: userId,
    name: "Transient transfection (HEK293T, PEI)",
    description:
      "Standard PEI-mediated transient transfection for recombinant antibody expression.",
    version: "1.2",
    category: "Cell culture",
    content: [
      "## Transient transfection (HEK293T, PEI)",
      "",
      "**Materials:** HEK293T at 70–90% confluency, endotoxin-free plasmid DNA, linear PEI (1 mg/mL), Opti-MEM.",
      "",
      "1. Seed HEK293T to reach ~80% confluency on the day of transfection.",
      "2. Prepare DNA:PEI complexes at a **3:1 PEI:DNA (w/w) ratio** in Opti-MEM. Vortex, incubate 15 min at RT.",
      "3. Add complexes dropwise to the cells; rock the plate gently.",
      "4. Replace medium after 4–6 h. Harvest supernatant at 72–96 h.",
      "",
      "> The 3:1 ratio was the top-yield condition in the transfection screen.",
    ].join("\n"),
  })

  // 4) Lab notes
  await admin.from("lab_notes").insert([
    {
      title: "Condition B (3:1 PEI:DNA) gave the highest transient yield",
      note_type: "conclusion",
      project_id: projectId,
      experiment_id: expTransfection,
      created_by: userId,
      content:
        "<p>Across the ratio screen, <strong>condition B (3:1 PEI:DNA)</strong> produced the highest transient yield in HEK293T. Higher ratios (4:1) increased cytotoxicity with no yield gain, matching the ratio reported in the saved literature.</p>",
    },
    {
      title: "IMAC elution lost ~38% — imidazole gradient too steep",
      note_type: "observation",
      project_id: projectId,
      experiment_id: expPurification,
      created_by: userId,
      content:
        "<p>His-tag elution lost <strong>~38%</strong> of product. The A280 trace and reducing gel both show protein in the flow-through/wash. Likely the imidazole gradient is too steep — flatten from 20 → 250 mM over more column volumes next run.</p>",
    },
    {
      title: "Decision: switched to pET-28a for N-terminal His + TEV site",
      note_type: "general",
      project_id: projectId,
      experiment_id: null,
      created_by: userId,
      content:
        "<p>Switched the construct to <strong>pET-28a</strong> for the N-terminal His-tag and TEV cleavage site, after low cleavage yield with the previous vector. Logged here for reproducibility.</p>",
    },
  ])

  // 5) Samples (sample_code is globally UNIQUE — namespaced per user)
  await admin.from("samples").insert([
    {
      created_by: userId,
      experiment_id: expTransfection,
      sample_code: `HEK293T-${suffix}`,
      sample_type: "Cell line",
      description: "HEK293T host cells for transient expression.",
      storage_location: "LN2 tank A / rack 3",
      storage_condition: "-196°C",
      status: "available",
    },
    {
      created_by: userId,
      sample_code: `pET28a-antiPD1-${suffix}`,
      sample_type: "Plasmid",
      description: "pET-28a construct encoding anti-PD-1 with N-terminal His + TEV site.",
      storage_location: "-20°C freezer / box 7",
      storage_condition: "-20°C",
      quantity: 50,
      quantity_unit: "µL",
      status: "available",
    },
    {
      created_by: userId,
      experiment_id: expPurification,
      sample_code: `antiPD1-mAb-${suffix}`,
      sample_type: "Protein",
      description: "Purified anti-PD-1 monoclonal antibody (post-IMAC).",
      storage_location: "-80°C freezer / shelf 2",
      storage_condition: "-80°C",
      quantity: 1.2,
      quantity_unit: "mg",
      status: "in_use",
    },
  ])

  // 6) Literature attached to the demo project
  await admin.from("literature_reviews").insert([
    {
      organization_id: organizationId,
      created_by: userId,
      project_id: projectId,
      title:
        "High-density transfection of HEK293 cells for high-yield recombinant protein production",
      authors: "Backliwal G, Hildinger M, Hasija V, Wurm FM.",
      journal: "Biotechnology and Bioengineering",
      publication_year: 2008,
      abstract:
        "Optimization of PEI-mediated transient transfection at high cell density — including PEI:DNA ratio — to reach high volumetric yields of recombinant proteins in suspension HEK293 cultures.",
      keywords: ["HEK293", "transient transfection", "PEI", "antibody expression"],
      status: "saved",
      catalog_placement: "repository",
      relevance_rating: 5,
    },
    {
      organization_id: organizationId,
      created_by: userId,
      project_id: projectId,
      title: "Purification of proteins using polyhistidine affinity tags",
      authors: "Bornhorst JA, Falke JJ.",
      journal: "Methods in Enzymology",
      publication_year: 2000,
      abstract:
        "Practical guidance on IMAC purification of His-tagged proteins, including imidazole gradient design to balance purity against recovery.",
      keywords: ["IMAC", "His-tag", "purification", "imidazole"],
      status: "saved",
      catalog_placement: "repository",
      relevance_rating: 4,
    },
  ])
}
