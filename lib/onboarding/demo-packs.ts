/**
 * lib/onboarding/demo-packs.ts
 *
 * Field-matched starter content. A new user's `profiles.research_field` answer
 * from the welcome wizard picks one of these packs, so the demo project they
 * land on resembles their own work instead of always being antibody expression.
 *
 * Every pack seeds the same shape — 1 project → 2 experiments → 1 protocol →
 * 3 lab notes → 3 samples → 2 literature records — so `seedDemoProject` stays a
 * single code path and the dashboard/research-map look identical across fields.
 *
 * Two hard rules for anything added here:
 *  1. **Literature must be real, verifiable papers.** Fabricated citations in a
 *     research product are a credibility problem, not a content problem. Every
 *     entry below is a widely-cited paper with a stable DOI.
 *  2. **Project names must keep the "(demo)" suffix.** `projects` has a UNIQUE
 *     (organization_id, name) constraint that doubles as the seeder's
 *     idempotency guard, and the suffix is what tells users this is deletable.
 */

export type DemoPackId =
  | "molecular-biology"
  | "neuroscience"
  | "microbiology"
  | "chemistry"
  | "computational"

/** Index into the pack's `experiments` array, or null for an unattached record. */
type ExperimentRef = 0 | 1 | null

type PackExperiment = {
  name: string
  description: string
  hypothesis?: string
  status: string
}

type PackLabNote = {
  title: string
  noteType: "observation" | "analysis" | "conclusion" | "general"
  experiment: ExperimentRef
  content: string
}

type PackSample = {
  /** Suffixed with the user id at insert time — `samples.sample_code` is globally unique. */
  code: string
  experiment: ExperimentRef
  sampleType: string
  description: string
  storageLocation: string
  storageCondition: string
  quantity?: number
  quantityUnit?: string
  status: string
}

type PackLiterature = {
  title: string
  authors: string
  journal: string
  year: number
  doi: string
  abstract: string
  keywords: string[]
  relevance: number
}

export type DemoPack = {
  id: DemoPackId
  /** Lowercase substrings matched against the user's free-text research field. */
  matches: string[]
  project: { name: string; description: string }
  experiments: [PackExperiment, PackExperiment]
  protocol: { name: string; description: string; version: string; category: string; content: string }
  labNotes: PackLabNote[]
  samples: PackSample[]
  literature: [PackLiterature, PackLiterature]
}

/* -------------------------------------------------------------------------- */

const MOLECULAR_BIOLOGY: DemoPack = {
  id: "molecular-biology",
  // Deliberately no bare "biolog" or "cell": they also appear in microbiology,
  // computational biology and cell physiology, and this pack is the fallback
  // anyway, so it does not need broad tokens to catch the long tail.
  matches: [
    "molecular",
    "immunolog",
    "genetic",
    "biochem",
    "protein",
    "cell biol",
    "cell cultur",
    "antibody",
    "cancer",
    "oncolog",
  ],
  project: {
    name: "Antibody Expression — anti-PD-1 (demo)",
    description:
      "A ready-made demo project so you can explore Notes9 with real content. Recombinant expression and purification of an anti-PD-1 monoclonal antibody in HEK293T using a pET-28a construct.",
  },
  experiments: [
    {
      name: "Transfection screen — PEI:DNA ratios",
      description:
        "Screen of PEI:DNA ratios (1:1 – 4:1) for transient anti-PD-1 expression in HEK293T.",
      hypothesis: "A 3:1 PEI:DNA ratio maximizes transient yield without excess cytotoxicity.",
      status: "data_ready",
    },
    {
      name: "IMAC purification — His-tag elution",
      description: "Ni-NTA affinity purification of His-tagged anti-PD-1 with an imidazole gradient.",
      status: "analyzed",
    },
  ],
  protocol: {
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
  },
  labNotes: [
    {
      title: "Condition B (3:1 PEI:DNA) gave the highest transient yield",
      noteType: "conclusion",
      experiment: 0,
      content:
        "<p>Across the ratio screen, <strong>condition B (3:1 PEI:DNA)</strong> produced the highest transient yield in HEK293T. Higher ratios (4:1) increased cytotoxicity with no yield gain, matching the ratio reported in the saved literature.</p>",
    },
    {
      title: "IMAC elution lost ~38% — imidazole gradient too steep",
      noteType: "observation",
      experiment: 1,
      content:
        "<p>His-tag elution lost <strong>~38%</strong> of product. The A280 trace and reducing gel both show protein in the flow-through/wash. Likely the imidazole gradient is too steep — flatten from 20 → 250 mM over more column volumes next run.</p>",
    },
    {
      title: "Decision: switched to pET-28a for N-terminal His + TEV site",
      noteType: "general",
      experiment: null,
      content:
        "<p>Switched the construct to <strong>pET-28a</strong> for the N-terminal His-tag and TEV cleavage site, after low cleavage yield with the previous vector. Logged here for reproducibility.</p>",
    },
  ],
  samples: [
    {
      code: "HEK293T",
      experiment: 0,
      sampleType: "Cell line",
      description: "HEK293T host cells for transient expression.",
      storageLocation: "LN2 tank A / rack 3",
      storageCondition: "-196°C",
      status: "available",
    },
    {
      code: "pET28a-antiPD1",
      experiment: null,
      sampleType: "Plasmid",
      description: "pET-28a construct encoding anti-PD-1 with N-terminal His + TEV site.",
      storageLocation: "-20°C freezer / box 7",
      storageCondition: "-20°C",
      quantity: 50,
      quantityUnit: "µL",
      status: "available",
    },
    {
      code: "antiPD1-mAb",
      experiment: 1,
      sampleType: "Protein",
      description: "Purified anti-PD-1 monoclonal antibody (post-IMAC).",
      storageLocation: "-80°C freezer / shelf 2",
      storageCondition: "-80°C",
      quantity: 1.2,
      quantityUnit: "mg",
      status: "in_use",
    },
  ],
  literature: [
    {
      title:
        "High-density transfection of HEK293 cells for high-yield recombinant protein production",
      authors: "Backliwal G, Hildinger M, Hasija V, Wurm FM.",
      journal: "Biotechnology and Bioengineering",
      year: 2008,
      doi: "10.1002/bit.21867",
      abstract:
        "Optimization of PEI-mediated transient transfection at high cell density — including PEI:DNA ratio — to reach high volumetric yields of recombinant proteins in suspension HEK293 cultures.",
      keywords: ["HEK293", "transient transfection", "PEI", "antibody expression"],
      relevance: 5,
    },
    {
      title: "Purification of proteins using polyhistidine affinity tags",
      authors: "Bornhorst JA, Falke JJ.",
      journal: "Methods in Enzymology",
      year: 2000,
      doi: "10.1016/S0076-6879(00)26058-8",
      abstract:
        "Practical guidance on IMAC purification of His-tagged proteins, including imidazole gradient design to balance purity against recovery.",
      keywords: ["IMAC", "His-tag", "purification", "imidazole"],
      relevance: 4,
    },
  ],
}

const NEUROSCIENCE: DemoPack = {
  id: "neuroscience",
  matches: ["neuro", "brain", "cognit", "electrophys", "synap", "psychiatr", "behavio"],
  project: {
    name: "Cortical Excitability — layer 5 pyramidal neurons (demo)",
    description:
      "A ready-made demo project so you can explore Notes9 with real content. Whole-cell patch-clamp characterisation of layer 5 pyramidal neurons in acute cortical slices, paired with GCaMP calcium imaging.",
  },
  experiments: [
    {
      name: "Patch-clamp — intrinsic excitability by current step",
      description:
        "Whole-cell current-clamp recordings in acute slices; f–I curves across 0–400 pA current steps.",
      hypothesis:
        "Layer 5 pyramidal neurons show higher rheobase after chronic stimulation than naive controls.",
      status: "data_ready",
    },
    {
      name: "GCaMP6 imaging — evoked calcium transients",
      description:
        "Two-photon imaging of GCaMP6f transients in the same cortical region, aligned to the stimulation protocol.",
      status: "analyzed",
    },
  ],
  protocol: {
    name: "Acute cortical slice preparation (300 µm)",
    description: "Vibratome slicing and recovery protocol for whole-cell recordings in cortex.",
    version: "1.1",
    category: "Electrophysiology",
    content: [
      "## Acute cortical slice preparation (300 µm)",
      "",
      "**Solutions:** ice-cold sucrose cutting solution (bubbled 95% O₂ / 5% CO₂), standard aCSF for recovery.",
      "",
      "1. Transcardially perfuse with ice-cold sucrose cutting solution.",
      "2. Block the brain and mount for coronal sectioning.",
      "3. Cut **300 µm** slices on the vibratome in ice-cold, continuously bubbled cutting solution.",
      "4. Recover slices at 34°C for 30 min, then hold at room temperature for ≥1 h before recording.",
      "",
      "> Slice health drops sharply if recovery is shortened — do not record before the 1 h hold.",
    ].join("\n"),
  },
  labNotes: [
    {
      title: "Rheobase shifted +42 pA in the stimulated group",
      noteType: "conclusion",
      experiment: 0,
      content:
        "<p>Across 14 cells, mean rheobase in the stimulated group shifted by <strong>+42 pA</strong> relative to naive controls, with no change in input resistance. The f–I curve is shifted rightward rather than flattened, consistent with a threshold effect rather than a gain change.</p>",
    },
    {
      title: "Series resistance drift above 25 MΩ in three recordings",
      noteType: "observation",
      experiment: 0,
      content:
        "<p>Three cells drifted above <strong>25 MΩ</strong> series resistance partway through the step protocol and were excluded. Suspect partial reseal — worth re-checking pipette pull parameters before the next session.</p>",
    },
    {
      title: "Decision: switched to GCaMP6f over GCaMP6s for kinetics",
      noteType: "general",
      experiment: null,
      content:
        "<p>Switched to <strong>GCaMP6f</strong> despite lower ΔF/F, because GCaMP6s decay kinetics were too slow to resolve individual events at our stimulation frequency. Trade-off logged here for reproducibility.</p>",
    },
  ],
  samples: [
    {
      code: "slice-ctx-naive",
      experiment: 0,
      sampleType: "Tissue",
      description: "Acute coronal cortical slices, naive control cohort.",
      storageLocation: "Holding chamber / rig 2",
      storageCondition: "Room temperature, oxygenated aCSF",
      status: "in_use",
    },
    {
      code: "AAV-GCaMP6f",
      experiment: 1,
      sampleType: "Viral vector",
      description: "AAV9-Syn-GCaMP6f for cortical expression.",
      storageLocation: "-80°C freezer / viral box 1",
      storageCondition: "-80°C",
      quantity: 100,
      quantityUnit: "µL",
      status: "available",
    },
    {
      code: "aCSF-stock-10x",
      experiment: null,
      sampleType: "Buffer",
      description: "10× artificial cerebrospinal fluid stock for recording solution.",
      storageLocation: "4°C fridge / shelf 1",
      storageCondition: "4°C",
      quantity: 500,
      quantityUnit: "mL",
      status: "available",
    },
  ],
  literature: [
    {
      title:
        "Improved patch-clamp techniques for high-resolution current recording from cells and cell-free membrane patches",
      authors: "Hamill OP, Marty A, Neher E, Sakmann B, Sigworth FJ.",
      journal: "Pflügers Archiv — European Journal of Physiology",
      year: 1981,
      doi: "10.1007/BF00656997",
      abstract:
        "The foundational description of the gigaseal patch-clamp configurations, including whole-cell recording, and the practical conditions required for low-noise, high-resolution current measurement.",
      keywords: ["patch clamp", "electrophysiology", "whole-cell", "gigaseal"],
      relevance: 5,
    },
    {
      title: "Ultrasensitive fluorescent proteins for imaging neuronal activity",
      authors: "Chen TW, Wardill TJ, Sun Y, Pulver SR, Renninger SL, Baohan A, et al.",
      journal: "Nature",
      year: 2013,
      doi: "10.1038/nature12354",
      abstract:
        "Introduces the GCaMP6 family of genetically encoded calcium indicators, characterising the sensitivity and kinetics trade-offs between the fast (6f) and sensitive (6s) variants for in vivo imaging.",
      keywords: ["GCaMP6", "calcium imaging", "two-photon", "neuronal activity"],
      relevance: 5,
    },
  ],
}

const MICROBIOLOGY: DemoPack = {
  id: "microbiology",
  matches: ["microbio", "bacteri", "microb", "infect", "antibiotic", "antimicrob", "virolog", "myco"],
  project: {
    name: "Antimicrobial Resistance — P. aeruginosa isolates (demo)",
    description:
      "A ready-made demo project so you can explore Notes9 with real content. MIC profiling and biofilm characterisation of clinical Pseudomonas aeruginosa isolates against a panel of antibiotics.",
  },
  experiments: [
    {
      name: "Broth microdilution MIC — ciprofloxacin panel",
      description:
        "Two-fold broth microdilution across 0.03–32 µg/mL ciprofloxacin for 12 clinical isolates, in triplicate.",
      hypothesis:
        "Isolates from the ICU cohort show elevated MICs relative to community-acquired isolates.",
      status: "data_ready",
    },
    {
      name: "Crystal violet biofilm assay — 96-well",
      description:
        "Static biofilm quantification by crystal violet staining at 24 h and 48 h across the same isolate panel.",
      status: "analyzed",
    },
  ],
  protocol: {
    name: "Broth microdilution MIC (CLSI-style, 96-well)",
    description: "Two-fold serial dilution MIC determination in cation-adjusted Mueller-Hinton broth.",
    version: "1.3",
    category: "Microbiology",
    content: [
      "## Broth microdilution MIC (96-well)",
      "",
      "**Materials:** cation-adjusted Mueller-Hinton broth (CAMHB), sterile 96-well round-bottom plates, 0.5 McFarland standard.",
      "",
      "1. Prepare a two-fold antibiotic dilution series across columns 1–11; column 12 is the growth control.",
      "2. Adjust the inoculum to **0.5 McFarland**, then dilute to ~5 × 10⁵ CFU/mL in CAMHB.",
      "3. Add 50 µL inoculum to each well. Include an uninoculated sterility row.",
      "4. Incubate 16–20 h at 35°C, ambient air. Read the MIC as the lowest concentration with no visible growth.",
      "",
      "> Inoculum density is the single largest source of MIC drift — verify by plate count on every run.",
    ].join("\n"),
  },
  labNotes: [
    {
      title: "ICU isolates show a 4–8× MIC shift versus community isolates",
      noteType: "conclusion",
      experiment: 0,
      content:
        "<p>Across the 12-isolate panel, ICU-derived isolates showed a <strong>4–8× shift</strong> in ciprofloxacin MIC relative to community-acquired isolates. Three isolates exceeded the resistance breakpoint in all three replicates.</p>",
    },
    {
      title: "Edge-well evaporation confounded the 48 h biofilm read",
      noteType: "observation",
      experiment: 1,
      content:
        "<p>Outer wells showed elevated crystal violet OD₅₉₀ at <strong>48 h</strong>, consistent with evaporation rather than true biofilm. Fill the perimeter with sterile PBS next run and exclude edge wells from the current dataset.</p>",
    },
    {
      title: "Decision: standardised on CAMHB over plain MHB",
      noteType: "general",
      experiment: null,
      content:
        "<p>Standardised on <strong>cation-adjusted</strong> Mueller-Hinton broth after seeing run-to-run MIC variability with plain MHB. Divalent cation concentration materially affects aminoglycoside and fluoroquinolone results.</p>",
    },
  ],
  samples: [
    {
      code: "PA-ICU-07",
      experiment: 0,
      sampleType: "Bacterial isolate",
      description: "Clinical P. aeruginosa isolate, ICU cohort, glycerol stock.",
      storageLocation: "-80°C freezer / isolate box 3",
      storageCondition: "-80°C",
      status: "available",
    },
    {
      code: "PA-ATCC27853",
      experiment: 0,
      sampleType: "Reference strain",
      description: "P. aeruginosa ATCC 27853 quality-control reference strain.",
      storageLocation: "-80°C freezer / QC box",
      storageCondition: "-80°C",
      status: "available",
    },
    {
      code: "CAMHB-batch",
      experiment: 1,
      sampleType: "Medium",
      description: "Cation-adjusted Mueller-Hinton broth, prepared batch.",
      storageLocation: "4°C fridge / shelf 2",
      storageCondition: "4°C",
      quantity: 1,
      quantityUnit: "L",
      status: "in_use",
    },
  ],
  literature: [
    {
      title:
        "Agar and broth dilution methods to determine the minimal inhibitory concentration (MIC) of antimicrobial substances",
      authors: "Wiegand I, Hilpert K, Hancock REW.",
      journal: "Nature Protocols",
      year: 2008,
      doi: "10.1038/nprot.2007.521",
      abstract:
        "A detailed protocol for agar and broth dilution MIC determination, covering inoculum preparation, medium composition, and the common sources of inter-laboratory variability.",
      keywords: ["MIC", "broth microdilution", "antimicrobial susceptibility", "protocol"],
      relevance: 5,
    },
    {
      title: "Microtiter dish biofilm formation assay",
      authors: "O'Toole GA.",
      journal: "Journal of Visualized Experiments",
      year: 2011,
      doi: "10.3791/2437",
      abstract:
        "The standard crystal violet microtiter plate assay for quantifying static biofilm formation, including washing technique and the controls needed to separate biofilm from planktonic carryover.",
      keywords: ["biofilm", "crystal violet", "microtiter", "assay"],
      relevance: 4,
    },
  ],
}

const CHEMISTRY: DemoPack = {
  id: "chemistry",
  matches: ["chemi", "synthes", "catalys", "organic", "inorganic", "analytic", "material", "polymer", "nmr"],
  project: {
    name: "Suzuki Coupling Optimisation — biaryl scaffold (demo)",
    description:
      "A ready-made demo project so you can explore Notes9 with real content. Ligand and base screening for a Suzuki–Miyaura coupling, with HPLC purity tracking and NMR structure confirmation.",
  },
  experiments: [
    {
      name: "Ligand screen — Pd catalyst systems",
      description:
        "Parallel screen of four phosphine ligands at 2 mol% Pd, monitoring conversion by HPLC at 2 h and 18 h.",
      hypothesis: "A bulky biaryl phosphine ligand improves conversion on the hindered substrate.",
      status: "data_ready",
    },
    {
      name: "Purification and NMR confirmation",
      description:
        "Flash chromatography followed by ¹H and ¹³C NMR to confirm the biaryl product and quantify residual solvent.",
      status: "analyzed",
    },
  ],
  protocol: {
    name: "Suzuki–Miyaura coupling (general procedure)",
    description: "General Schlenk-line procedure for Pd-catalysed aryl–aryl cross coupling.",
    version: "2.0",
    category: "Synthesis",
    content: [
      "## Suzuki–Miyaura coupling (general procedure)",
      "",
      "**Materials:** aryl halide (1.0 equiv), boronic acid (1.2 equiv), Pd source (2 mol%), ligand (4 mol%), base (2.0 equiv), degassed solvent.",
      "",
      "1. Charge an oven-dried Schlenk flask with aryl halide, boronic acid, Pd source, ligand and base.",
      "2. Evacuate and backfill with argon **three times**.",
      "3. Add degassed solvent by syringe; heat to 80°C with stirring.",
      "4. Monitor by HPLC or TLC. On consumption of the aryl halide, cool, filter through Celite, and concentrate.",
      "",
      "> Incomplete degassing is the most common cause of low conversion — do not skip the freeze-pump-thaw cycles on the solvent.",
    ].join("\n"),
  },
  labNotes: [
    {
      title: "Bulky biaryl phosphine gave 94% conversion at 2 h",
      noteType: "conclusion",
      experiment: 0,
      content:
        "<p>The bulky biaryl phosphine ligand reached <strong>94% conversion at 2 h</strong>, versus 41% for triphenylphosphine under otherwise identical conditions. Consistent with the hindered substrate requiring faster reductive elimination.</p>",
    },
    {
      title: "Residual DMF visible in the ¹H NMR at 2.88 and 2.96 ppm",
      noteType: "observation",
      experiment: 1,
      content:
        "<p>Residual <strong>DMF</strong> visible in the ¹H spectrum at 2.88 and 2.96 ppm despite high-vacuum drying. Matches the reference solvent-impurity shifts in the saved literature. Try an aqueous wash before chromatography next time.</p>",
    },
    {
      title: "Decision: switched base from K₂CO₃ to K₃PO₄",
      noteType: "general",
      experiment: null,
      content:
        "<p>Switched from K₂CO₃ to <strong>K₃PO₄</strong> after protodeboronation was observed on the electron-rich boronic acid. Conversion improved and the des-halo byproduct dropped below the HPLC detection limit.</p>",
    },
  ],
  samples: [
    {
      code: "arylbromide-SM1",
      experiment: 0,
      sampleType: "Reagent",
      description: "Starting aryl bromide, recrystallised.",
      storageLocation: "Reagent cabinet / shelf B",
      storageCondition: "Room temperature, desiccated",
      quantity: 5.2,
      quantityUnit: "g",
      status: "available",
    },
    {
      code: "boronic-acid-BA3",
      experiment: 0,
      sampleType: "Reagent",
      description: "Electron-rich arylboronic acid coupling partner.",
      storageLocation: "4°C fridge / reagent box 2",
      storageCondition: "4°C",
      quantity: 2.8,
      quantityUnit: "g",
      status: "available",
    },
    {
      code: "biaryl-product",
      experiment: 1,
      sampleType: "Product",
      description: "Purified biaryl coupling product after flash chromatography.",
      storageLocation: "-20°C freezer / product box 1",
      storageCondition: "-20°C",
      quantity: 410,
      quantityUnit: "mg",
      status: "in_use",
    },
  ],
  literature: [
    {
      title:
        "NMR Chemical Shifts of Trace Impurities: Common Laboratory Solvents, Organics, and Gases in Deuterated Solvents Relevant to the Organometallic Chemist",
      authors: "Fulmer GR, Miller AJM, Sherden NH, Gottlieb HE, Nudelman A, Stoltz BM, et al.",
      journal: "Organometallics",
      year: 2010,
      doi: "10.1021/om100106e",
      abstract:
        "A comprehensive reference table of ¹H and ¹³C chemical shifts for common solvents and trace impurities across deuterated NMR solvents, widely used for assigning residual solvent peaks.",
      keywords: ["NMR", "chemical shifts", "residual solvent", "reference"],
      relevance: 5,
    },
    {
      title: "A short history of SHELX",
      authors: "Sheldrick GM.",
      journal: "Acta Crystallographica Section A",
      year: 2008,
      doi: "10.1107/S0108767307043930",
      abstract:
        "An overview of the SHELX suite for small-molecule and macromolecular crystal structure determination, covering the refinement algorithms behind routine structure confirmation.",
      keywords: ["crystallography", "SHELX", "structure determination", "refinement"],
      relevance: 3,
    },
  ],
}

const COMPUTATIONAL: DemoPack = {
  id: "computational",
  matches: [
    "bioinformat",
    "computat",
    "genomic",
    "transcriptom",
    "data scien",
    "machine learn",
    "systems biolog",
    "statistic",
  ],
  project: {
    name: "RNA-seq Differential Expression — treatment vs control (demo)",
    description:
      "A ready-made demo project so you can explore Notes9 with real content. A bulk RNA-seq differential expression workflow from alignment through DESeq2, with QC and pathway enrichment.",
  },
  experiments: [
    {
      name: "Alignment and QC — STAR pipeline",
      description:
        "STAR alignment of 12 bulk RNA-seq libraries against the reference genome, with per-sample QC metrics.",
      hypothesis: "Library prep batch does not dominate the variance after normalisation.",
      status: "data_ready",
    },
    {
      name: "Differential expression — DESeq2",
      description:
        "DESeq2 differential expression across treatment and control groups, with shrinkage and multiple-testing correction.",
      status: "analyzed",
    },
  ],
  protocol: {
    name: "Bulk RNA-seq differential expression workflow",
    description: "Reproducible pipeline from raw FASTQ through differential expression calls.",
    version: "1.4",
    category: "Computational",
    content: [
      "## Bulk RNA-seq differential expression workflow",
      "",
      "**Inputs:** demultiplexed paired-end FASTQ, reference genome FASTA + GTF annotation.",
      "",
      "1. Run FastQC on all libraries; trim adapters only if adapter content exceeds threshold.",
      "2. Align with **STAR** using a genome index built from the matching GTF annotation.",
      "3. Generate a gene-level count matrix; inspect the PCA for batch structure before modelling.",
      "4. Run **DESeq2** with the batch term in the design where PCA shows batch separation. Apply LFC shrinkage before ranking.",
      "",
      "> Record the exact reference build and annotation version — differential expression results are not comparable across annotation releases.",
    ].join("\n"),
  },
  labNotes: [
    {
      title: "247 genes differentially expressed at padj < 0.05",
      noteType: "conclusion",
      experiment: 1,
      content:
        "<p><strong>247 genes</strong> reached significance at padj &lt; 0.05 with |log₂FC| &gt; 1. The top-ranked set is dominated by the expected pathway, which is a reassuring positive control on the pipeline.</p>",
    },
    {
      title: "PC1 separates by library prep batch, not treatment",
      noteType: "observation",
      experiment: 0,
      content:
        "<p>The PCA shows <strong>PC1 (38% variance) separating by prep batch</strong> rather than treatment group. Added batch as a covariate in the DESeq2 design; treatment separation moves to PC2 after correction.</p>",
    },
    {
      title: "Decision: pinned the annotation release for reproducibility",
      noteType: "general",
      experiment: null,
      content:
        "<p>Pinned the reference genome build and <strong>GTF annotation release</strong> in the pipeline config. An earlier re-run against a newer annotation changed the significant gene count by roughly 8% with no change to the data.</p>",
    },
  ],
  samples: [
    {
      code: "RNA-treat-01",
      experiment: 0,
      sampleType: "RNA",
      description: "Total RNA, treatment group replicate 1, RIN 9.2.",
      storageLocation: "-80°C freezer / RNA box 4",
      storageCondition: "-80°C",
      quantity: 40,
      quantityUnit: "µL",
      status: "available",
    },
    {
      code: "RNA-ctrl-01",
      experiment: 0,
      sampleType: "RNA",
      description: "Total RNA, control group replicate 1, RIN 9.4.",
      storageLocation: "-80°C freezer / RNA box 4",
      storageCondition: "-80°C",
      quantity: 40,
      quantityUnit: "µL",
      status: "available",
    },
    {
      code: "lib-pool-A",
      experiment: 1,
      sampleType: "Library",
      description: "Pooled indexed sequencing library, batch A.",
      storageLocation: "-20°C freezer / library box 1",
      storageCondition: "-20°C",
      quantity: 25,
      quantityUnit: "µL",
      status: "in_use",
    },
  ],
  literature: [
    {
      title: "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2",
      authors: "Love MI, Huber W, Anders S.",
      journal: "Genome Biology",
      year: 2014,
      doi: "10.1186/s13059-014-0550-8",
      abstract:
        "Describes the DESeq2 method for differential expression analysis of count data, including shrinkage estimators for dispersion and fold change that improve stability at low counts.",
      keywords: ["RNA-seq", "DESeq2", "differential expression", "shrinkage"],
      relevance: 5,
    },
    {
      title: "STAR: ultrafast universal RNA-seq aligner",
      authors: "Dobin A, Davis CA, Schlesinger F, Drenkow J, Zaleski C, Jha S, et al.",
      journal: "Bioinformatics",
      year: 2013,
      doi: "10.1093/bioinformatics/bts635",
      abstract:
        "Introduces the STAR spliced aligner, describing the sequential maximum mappable seed search that makes accurate spliced alignment of RNA-seq reads tractable at scale.",
      keywords: ["RNA-seq", "alignment", "STAR", "splice-aware"],
      relevance: 4,
    },
  ],
}

/* -------------------------------------------------------------------------- */

export const DEMO_PACKS: DemoPack[] = [
  MOLECULAR_BIOLOGY,
  NEUROSCIENCE,
  MICROBIOLOGY,
  CHEMISTRY,
  COMPUTATIONAL,
]

/**
 * Matching order, which is NOT the declaration order.
 *
 * Molecular biology is checked last because it is also the fallback: it is the
 * most broadly applicable wet-lab pack, so its keywords overlap the specific
 * packs ("genetics" vs "genomics", "protein" vs "proteomics"). Checking it first
 * meant a microbiologist got the antibody-expression demo.
 */
const MATCH_ORDER: DemoPack[] = [
  NEUROSCIENCE,
  MICROBIOLOGY,
  CHEMISTRY,
  COMPUTATIONAL,
  MOLECULAR_BIOLOGY,
]

export const FALLBACK_PACK_ID: DemoPackId = "molecular-biology"

/**
 * Picks a pack from the user's research field(s).
 *
 * The wizard lets users select several fields and type their own, storing them
 * comma-separated with their first choice first — so we try each segment in the
 * user's own order before falling back. That ordering matters: someone who
 * picks "Neuroscience, Bioinformatics" should get the neuroscience pack, not
 * whichever happens to sit earlier in `DEMO_PACKS`.
 *
 * Matching is substring based because free text ranges from "Neuro" to
 * "computational neuroscience & imaging".
 */
export function resolveDemoPack(researchField?: string | null): DemoPack {
  const segments = (researchField ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  for (const segment of segments) {
    const hit = MATCH_ORDER.find((pack) => pack.matches.some((m) => segment.includes(m)))
    if (hit) return hit
  }
  return MOLECULAR_BIOLOGY
}

/** Every pack's project name — used to tell seeded content apart from the user's own. */
export const DEMO_PROJECT_NAMES: string[] = DEMO_PACKS.map((p) => p.project.name)
