export type SampleFileKind = "plasmid" | "protein_structure" | "sequence" | "other"

export type AlignmentResult = {
  query: string
  subject: string
  matchLine: string
  score: number
  identity: number
  matches: number
  alignedLength: number
}

export type CrisprGuide = {
  id: string
  guide: string
  pam: string
  strand: "+" | "-"
  start: number
  end: number
  gcPercent: number
  hasPolyT: boolean
  selfSeedMatches: number
}

export const SAMPLE_MOLECULAR_EXTENSIONS = [
  ".gb",
  ".gbk",
  ".genbank",
  ".fasta",
  ".fa",
  ".fna",
  ".dna",
  ".json",
  ".pdb",
  ".cif",
  ".mmcif",
  ".ent",
  ".txt",
]

const PLASMID_EXTENSIONS = new Set(["gb", "gbk", "genbank", "dna", "json"])
const SEQUENCE_EXTENSIONS = new Set(["fasta", "fa", "fna", "txt"])
const PROTEIN_STRUCTURE_EXTENSIONS = new Set(["pdb", "cif", "mmcif", "ent"])
const BINARY_SEQUENCE_EXTENSIONS = new Set(["dna"])
const DNA_COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  G: "C",
  C: "G",
  U: "A",
  R: "Y",
  Y: "R",
  S: "S",
  W: "W",
  K: "M",
  M: "K",
  B: "V",
  V: "B",
  D: "H",
  H: "D",
  N: "N",
}

export function getFileExtension(fileName: string): string {
  const clean = fileName.split("?")[0]?.split("#")[0] ?? fileName
  const part = clean.toLowerCase().split(".").pop()
  return part && part !== clean.toLowerCase() ? part : ""
}

export function inferSampleFileKind(fileName: string, _contentType?: string | null): SampleFileKind {
  const ext = getFileExtension(fileName)
  if (PROTEIN_STRUCTURE_EXTENSIONS.has(ext)) return "protein_structure"
  if (PLASMID_EXTENSIONS.has(ext)) return "plasmid"
  if (SEQUENCE_EXTENSIONS.has(ext)) return "sequence"
  return "other"
}

export function isAllowedSampleMolecularFile(fileName: string, contentType?: string | null): boolean {
  const ext = `.${getFileExtension(fileName)}`
  return (
    SAMPLE_MOLECULAR_EXTENSIONS.includes(ext) ||
    Boolean(contentType?.startsWith("text/")) ||
    contentType === "application/json"
  )
}

export function shouldParseSequenceTextOnUpload(fileName: string): boolean {
  const ext = getFileExtension(fileName)
  return !BINARY_SEQUENCE_EXTENSIONS.has(ext)
}

export function parseTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

export function formatSampleTags(tags: string[] | null | undefined): string {
  return (tags ?? []).join(", ")
}

export function cleanDnaSequence(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith(">"))
    .join("")
    .toUpperCase()
    .replace(/U/g, "T")
    .replace(/[^ACGTRYSWKMBDHVN]/g, "")
}

export function reverseComplement(sequence: string): string {
  return cleanDnaSequence(sequence)
    .split("")
    .reverse()
    .map((base) => DNA_COMPLEMENT[base] ?? "N")
    .join("")
}

export function alignDnaSequences(queryInput: string, subjectInput: string): AlignmentResult {
  const query = cleanDnaSequence(queryInput)
  const subject = cleanDnaSequence(subjectInput)
  const rows = query.length + 1
  const cols = subject.length + 1
  const match = 2
  const mismatch = -1
  const gap = -2
  const scores = Array.from({ length: rows }, () => Array(cols).fill(0) as number[])
  const trace = Array.from({ length: rows }, () => Array(cols).fill("") as string[])

  for (let i = 1; i < rows; i++) {
    scores[i][0] = i * gap
    trace[i][0] = "up"
  }
  for (let j = 1; j < cols; j++) {
    scores[0][j] = j * gap
    trace[0][j] = "left"
  }

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const diagonal = scores[i - 1][j - 1] + (query[i - 1] === subject[j - 1] ? match : mismatch)
      const up = scores[i - 1][j] + gap
      const left = scores[i][j - 1] + gap
      const best = Math.max(diagonal, up, left)
      scores[i][j] = best
      trace[i][j] = best === diagonal ? "diag" : best === up ? "up" : "left"
    }
  }

  let i = query.length
  let j = subject.length
  const alignedQuery: string[] = []
  const alignedSubject: string[] = []
  const matchLine: string[] = []

  while (i > 0 || j > 0) {
    const direction = trace[i]?.[j]
    if (direction === "diag") {
      const q = query[i - 1]
      const s = subject[j - 1]
      alignedQuery.unshift(q)
      alignedSubject.unshift(s)
      matchLine.unshift(q === s ? "|" : ".")
      i--
      j--
    } else if (direction === "up" || j === 0) {
      const q = query[i - 1]
      alignedQuery.unshift(q)
      alignedSubject.unshift("-")
      matchLine.unshift(" ")
      i--
    } else {
      const s = subject[j - 1]
      alignedQuery.unshift("-")
      alignedSubject.unshift(s)
      matchLine.unshift(" ")
      j--
    }
  }

  const matches = matchLine.filter((char) => char === "|").length
  const alignedLength = matchLine.length
  return {
    query: alignedQuery.join(""),
    subject: alignedSubject.join(""),
    matchLine: matchLine.join(""),
    score: scores[query.length][subject.length],
    identity: alignedLength > 0 ? Math.round((matches / alignedLength) * 1000) / 10 : 0,
    matches,
    alignedLength,
  }
}

function gcPercent(sequence: string): number {
  const clean = cleanDnaSequence(sequence)
  if (!clean) return 0
  const gc = clean.split("").filter((base) => base === "G" || base === "C").length
  return Math.round((gc / clean.length) * 1000) / 10
}

function countSeedMatches(sequence: string, seed: string): number {
  if (!seed) return 0
  let count = 0
  for (let i = 0; i <= sequence.length - seed.length; i++) {
    if (sequence.slice(i, i + seed.length) === seed) count++
  }
  return count
}

export function findCrisprGuides(sequenceInput: string, maxGuides = 50): CrisprGuide[] {
  const sequence = cleanDnaSequence(sequenceInput)
  const reverse = reverseComplement(sequence)
  const guides: CrisprGuide[] = []

  const collect = (strandSequence: string, strand: "+" | "-") => {
    for (let i = 0; i <= strandSequence.length - 23; i++) {
      const guide = strandSequence.slice(i, i + 20)
      const pam = strandSequence.slice(i + 20, i + 23)
      if (!/^.[G][G]$/.test(pam)) continue
      const seed = guide.slice(-12)
      const start = strand === "+" ? i + 1 : sequence.length - (i + 20) + 1
      const end = strand === "+" ? i + 20 : sequence.length - i
      guides.push({
        id: `${strand}${start}-${end}`,
        guide,
        pam,
        strand,
        start,
        end,
        gcPercent: gcPercent(guide),
        hasPolyT: /TTTT/.test(guide),
        selfSeedMatches: countSeedMatches(sequence, seed) + countSeedMatches(reverse, seed),
      })
    }
  }

  collect(sequence, "+")
  collect(reverse, "-")

  return guides
    .sort((a, b) => {
      const aPenalty = Math.abs(a.gcPercent - 50) + (a.hasPolyT ? 25 : 0) + Math.max(0, a.selfSeedMatches - 1) * 10
      const bPenalty = Math.abs(b.gcPercent - 50) + (b.hasPolyT ? 25 : 0) + Math.max(0, b.selfSeedMatches - 1) * 10
      return aPenalty - bPenalty
    })
    .slice(0, maxGuides)
}

export function parseSequenceText(fileName: string, text: string): Record<string, unknown> {
  if (!shouldParseSequenceTextOnUpload(fileName)) {
    return {
      name: fileName,
      circular: true,
      sequence: "",
      features: [],
      parse_deferred: "Binary sequence files are parsed in the plasmid viewer.",
    }
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return { name: fileName, circular: true, sequence: "", features: [] }
  }

  if (getFileExtension(fileName) === "json") {
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed[0] ?? {} : parsed
    } catch {
      return { name: fileName, circular: true, sequence: "", features: [], parse_warning: "Invalid JSON" }
    }
  }

  if (trimmed.startsWith(">")) {
    const lines = trimmed.split(/\r?\n/)
    const header = lines[0]?.replace(/^>/, "").trim()
    return {
      name: header || fileName,
      circular: false,
      sequence: lines.slice(1).join("").replace(/[^A-Za-z]/g, "").toUpperCase(),
      features: [],
    }
  }

  const originMatch = trimmed.match(/ORIGIN([\s\S]*?)(\/\/)?$/i)
  if (originMatch?.[1]) {
    const locus = trimmed.match(/^LOCUS\s+(\S+)/im)?.[1]
    return {
      name: locus || fileName,
      circular: /circular/i.test(trimmed.split(/\r?\n/)[0] ?? ""),
      sequence: originMatch[1].replace(/[^A-Za-z]/g, "").toUpperCase(),
      features: [],
    }
  }

  return {
    name: fileName,
    circular: true,
    sequence: trimmed.replace(/[^A-Za-z]/g, "").toUpperCase(),
    features: [],
  }
}
