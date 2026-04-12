/**
 * Approximate molecular weights (g/mol) for common lab compounds.
 * For verification only — confirm critical preparations from a primary source.
 */
export type MolecularWeightEntry = {
  /** Canonical display name */
  primary: string
  /** g/mol (4–5 significant figures typical) */
  mw: number
  /** Alternate spellings / formulas (matched case-insensitively) */
  aliases: string[]
}

export const MOLECULAR_WEIGHT_TABLE: MolecularWeightEntry[] = [
  { primary: "Water", mw: 18.015, aliases: ["h2o", "dihydrogen oxide"] },
  { primary: "Ethanol", mw: 46.069, aliases: ["ethyl alcohol", "etoh", "c2h5oh"] },
  { primary: "Methanol", mw: 32.042, aliases: ["meoh", "ch3oh", "methyl alcohol"] },
  { primary: "Isopropanol", mw: 60.096, aliases: ["isopropyl alcohol", "ipa", "2-propanol"] },
  { primary: "Acetone", mw: 58.08, aliases: ["propanone", "ch3coch3"] },
  { primary: "DMSO", mw: 78.13, aliases: ["dimethyl sulfoxide", "me2so"] },
  { primary: "Chloroform", mw: 119.38, aliases: ["trichloromethane", "chcl3"] },
  { primary: "Dichloromethane", mw: 84.93, aliases: ["methylene chloride", "ch2cl2", "dcm"] },
  { primary: "Acetic acid", mw: 60.052, aliases: ["ethanoic acid", "ch3cooh", "hoac"] },
  { primary: "Formic acid", mw: 46.026, aliases: ["methanoic acid", "hcooh"] },
  { primary: "Trifluoroacetic acid", mw: 114.02, aliases: ["tfa", "cf3cooh"] },
  { primary: "Hexane", mw: 86.18, aliases: ["n-hexane", "c6h14"] },
  { primary: "Ethyl acetate", mw: 88.11, aliases: ["etoac", "ch3cooch2ch3"] },
  { primary: "Benzene", mw: 78.11, aliases: ["c6h6"] },
  { primary: "Toluene", mw: 92.14, aliases: ["methylbenzene", "c6h5ch3"] },
  { primary: "Pyridine", mw: 79.1, aliases: ["c5h5n"] },
  { primary: "THF", mw: 72.11, aliases: ["tetrahydrofuran", "oxolane"] },
  { primary: "DMF", mw: 73.09, aliases: ["dimethylformamide", "hcon(ch3)2"] },
  { primary: "Acetonitrile", mw: 41.05, aliases: ["mecn", "ch3cn", "cyanomethane"] },
  { primary: "Sodium chloride", mw: 58.44, aliases: ["nacl", "table salt", "salt"] },
  { primary: "Potassium chloride", mw: 74.55, aliases: ["kcl"] },
  { primary: "Calcium chloride", mw: 110.98, aliases: ["cacl2"] },
  { primary: "Magnesium chloride", mw: 95.21, aliases: ["mgcl2"] },
  { primary: "Sodium hydroxide", mw: 40.0, aliases: ["naoh", "lye", "caustic soda"] },
  { primary: "Potassium hydroxide", mw: 56.11, aliases: ["koh"] },
  { primary: "Hydrochloric acid", mw: 36.46, aliases: ["hcl", "muriatic acid"] },
  { primary: "Sulfuric acid", mw: 98.079, aliases: ["h2so4"] },
  { primary: "Phosphoric acid", mw: 97.994, aliases: ["h3po4", "orthophosphoric acid"] },
  { primary: "Nitric acid", mw: 63.01, aliases: ["hno3"] },
  { primary: "Sodium bicarbonate", mw: 84.01, aliases: ["nahco3", "baking soda"] },
  { primary: "Sodium carbonate", mw: 105.99, aliases: ["na2co3", "soda ash"] },
  { primary: "Sodium phosphate (dibasic)", mw: 141.96, aliases: ["na2hpo4", "dsp", "disodium hydrogen phosphate"] },
  { primary: "Sodium phosphate (monobasic)", mw: 119.98, aliases: ["nah2po4", "msp"] },
  { primary: "Potassium phosphate (dibasic)", mw: 174.18, aliases: ["k2hpo4"] },
  { primary: "Potassium phosphate (monobasic)", mw: 136.09, aliases: ["kh2po4"] },
  { primary: "Tris base", mw: 121.14, aliases: ["tris", "tham", "tromethamine", "tris(hydroxymethyl)aminomethane"] },
  { primary: "Tris–HCl", mw: 157.59, aliases: ["tris hydrochloride", "tris-hcl"] },
  { primary: "HEPES", mw: 238.3, aliases: ["4-(2-hydroxyethyl)piperazine-1-ethanesulfonic acid"] },
  { primary: "MOPS", mw: 209.26, aliases: ["3-(n-morpholino)propanesulfonic acid"] },
  { primary: "EDTA (free acid)", mw: 292.24, aliases: ["edta", "ethylenediaminetetraacetic acid"] },
  { primary: "EDTA disodium dihydrate", mw: 372.24, aliases: ["edta na2", "na2edta.2h2o", "disodium edta"] },
  { primary: "EGTA", mw: 380.35, aliases: ["ethylene glycol-bis(2-aminoethyl ether)-n,n,n',n'-tetraacetic acid"] },
  { primary: "SDS", mw: 288.38, aliases: ["sodium dodecyl sulfate", "sodium lauryl sulfate", "sds"] },
  { primary: "Tween 20", mw: 1228, aliases: ["polysorbate 20"] },
  { primary: "Triton X-100", mw: 647, aliases: ["triton x100"] },
  { primary: "β-Mercaptoethanol", mw: 78.13, aliases: ["bme", "2-mercaptoethanol"] },
  { primary: "DTT", mw: 154.25, aliases: ["dithiothreitol", "cleland's reagent"] },
  { primary: "Glucose", mw: 180.16, aliases: ["d-glucose", "dextrose", "c6h12o6"] },
  { primary: "Sucrose", mw: 342.3, aliases: ["table sugar", "saccharose"] },
  { primary: "Glycine", mw: 75.07, aliases: ["aminoacetic acid", "gly", "glycine free base"] },
  { primary: "Ammonium sulfate", mw: 132.14, aliases: ["(nh4)2so4", "ams"] },
  { primary: "Urea", mw: 60.06, aliases: ["carbamide", "co(nh2)2"] },
  { primary: "Imidazole", mw: 68.08, aliases: ["c3h4n2"] },
  { primary: "PMSF", mw: 174.19, aliases: ["phenylmethylsulfonyl fluoride"] },
  { primary: "Leupeptin", mw: 475.6, aliases: [] },
  { primary: "Pepstatin A", mw: 685.9, aliases: [] },
  { primary: "Aprotinin", mw: 6511, aliases: ["trypsin inhibitor"] },
  { primary: "Ampicillin sodium", mw: 371.39, aliases: ["ampicillin na"] },
  { primary: "Kanamycin sulfate", mw: 582.58, aliases: [] },
  { primary: "Magnesium sulfate heptahydrate", mw: 246.47, aliases: ["mgso4.7h2o", "epsom salt"] },
  { primary: "Calcium chloride dihydrate", mw: 147.01, aliases: ["cacl2.2h2o"] },
  { primary: "Sodium acetate trihydrate", mw: 136.08, aliases: ["ch3coona.3h2o", "naoac"] },
  { primary: "Potassium acetate", mw: 98.14, aliases: ["ch3cook", "koac"] },
  { primary: "Lithium chloride", mw: 42.39, aliases: ["licl"] },
  { primary: "Cesium chloride", mw: 168.36, aliases: ["cscl"] },
  { primary: "Phenol", mw: 94.11, aliases: ["c6h5oh", "carbolic acid"] },
  { primary: "Chloramphenicol", mw: 323.13, aliases: ["cap"] },
  { primary: "IPTG", mw: 238.3, aliases: ["isopropyl β-d-1-thiogalactopyranoside"] },
  { primary: "X-Gal", mw: 408.63, aliases: ["5-bromo-4-chloro-3-indolyl-β-d-galactopyranoside"] },
  { primary: "Boric acid", mw: 61.83, aliases: ["h3bo3"] },
  { primary: "Sodium borohydride", mw: 37.83, aliases: ["nabh4"] },
  { primary: "TCEP", mw: 250.19, aliases: ["tris(2-carboxyethyl)phosphine"] },
  { primary: "ATP (disodium)", mw: 551.14, aliases: ["adenosine triphosphate"] },
  { primary: "cAMP", mw: 329.21, aliases: ["cyclic amp"] },
  { primary: "NAD+", mw: 663.43, aliases: ["nad", "nicotinamide adenine dinucleotide"] },
  { primary: "NADH", mw: 665.43, aliases: [] },
  { primary: "BSA (typical)", mw: 66430, aliases: ["bsa", "bovine serum albumin", "albumin bovine"] },
]

function normalizeCompoundKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[‐‑‒–—−]/g, "-")
}

/** Map normalized lookup string → { mw, primary } */
function buildLookup(): Map<string, { mw: number; primary: string }> {
  const m = new Map<string, { mw: number; primary: string }>()
  for (const e of MOLECULAR_WEIGHT_TABLE) {
    const keys = new Set<string>()
    keys.add(normalizeCompoundKey(e.primary))
    for (const a of e.aliases) {
      keys.add(normalizeCompoundKey(a))
    }
    for (const k of keys) {
      if (!k) continue
      m.set(k, { mw: e.mw, primary: e.primary })
    }
  }
  return m
}

const LOOKUP = buildLookup()

export function lookupMolecularWeightByName(query: string): { mw: number; primary: string } | null {
  const k = normalizeCompoundKey(query)
  if (!k) return null
  return LOOKUP.get(k) ?? null
}

const NUMERIC_MW = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/

export type ResolvedMwInput =
  | { ok: true; mw: number; source: "numeric" | "compound"; compoundName?: string }
  | { ok: false; message: string }
  | { ok: "empty" }

/**
 * Accepts a positive number (g/mol) or a compound name from the built-in list.
 */
export function resolveMolecularWeightInput(raw: string): ResolvedMwInput {
  const t = raw.trim()
  if (!t) return { ok: "empty" }
  if (NUMERIC_MW.test(t)) {
    const v = parseFloat(t)
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, message: "Formula weight must be a positive number (g/mol)." }
    }
    return { ok: true, mw: v, source: "numeric" }
  }
  const hit = lookupMolecularWeightByName(t)
  if (hit) {
    return { ok: true, mw: hit.mw, source: "compound", compoundName: hit.primary }
  }
  return {
    ok: false,
    message: `Unknown compound “${t}”. Enter MW in g/mol or a name from the list (try the field suggestions).`,
  }
}

/** Sorted primary names for datalist / autocomplete. */
export function listMolecularWeightPrimaryNames(): string[] {
  const s = new Set<string>()
  for (const e of MOLECULAR_WEIGHT_TABLE) {
    s.add(e.primary)
  }
  return [...s].sort((a, b) => a.localeCompare(b))
}

/** Filter names containing query (case-insensitive). */
export function searchMolecularWeightNames(query: string, limit = 30): { primary: string; mw: number }[] {
  const q = normalizeCompoundKey(query)
  if (!q) {
    return MOLECULAR_WEIGHT_TABLE.slice(0, limit).map((e) => ({ primary: e.primary, mw: e.mw }))
  }
  const out: { primary: string; mw: number }[] = []
  for (const e of MOLECULAR_WEIGHT_TABLE) {
    const hay = `${e.primary} ${e.aliases.join(" ")}`.toLowerCase()
    if (e.primary.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))) {
      out.push({ primary: e.primary, mw: e.mw })
    }
    if (out.length >= limit) break
  }
  return out
}
