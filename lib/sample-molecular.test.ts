import { describe, expect, it } from "vitest"
import {
  alignDnaSequences,
  cleanDnaSequence,
  findCrisprGuides,
  formatSampleTags,
  inferSampleFileKind,
  isAllowedSampleMolecularFile,
  parseTagInput,
  shouldParseSequenceTextOnUpload,
} from "./sample-molecular"

describe("sample molecular helpers", () => {
  it("detects plasmid and sequence file types", () => {
    expect(inferSampleFileKind("vector.gbk", "text/plain")).toBe("plasmid")
    expect(inferSampleFileKind("insert.fasta", "text/plain")).toBe("sequence")
    expect(inferSampleFileKind("model.pdb", "chemical/x-pdb")).toBe("protein_structure")
    expect(inferSampleFileKind("snapgene-vector.dna", "")).toBe("plasmid")
    expect(inferSampleFileKind("notes.pdf", "application/pdf")).toBe("other")
  })

  it("allows molecular file extensions and text sequence files", () => {
    expect(isAllowedSampleMolecularFile("map.gb", "text/plain")).toBe(true)
    expect(isAllowedSampleMolecularFile("structure.mmcif", "text/plain")).toBe(true)
    expect(isAllowedSampleMolecularFile("sequence.weird", "text/plain")).toBe(true)
    expect(isAllowedSampleMolecularFile("archive.zip", "application/zip")).toBe(false)
  })

  it("defers binary SnapGene files to the plasmid viewer parser", () => {
    expect(shouldParseSequenceTextOnUpload("vector.dna")).toBe(false)
    expect(shouldParseSequenceTextOnUpload("vector.gbk")).toBe(true)
  })

  it("normalizes sample tags without duplicates", () => {
    expect(parseTagInput(" plasmid, qc, plasmid ,, freezer ")).toEqual(["plasmid", "qc", "freezer"])
    expect(formatSampleTags(["plasmid", "qc"])).toBe("plasmid, qc")
  })

  it("cleans pasted DNA and aligns sequences", () => {
    expect(cleanDnaSequence(">seq\nacgu-12")).toBe("ACGT")
    const result = alignDnaSequences("ACGT", "ACCT")
    expect(result.matches).toBe(3)
    expect(result.identity).toBe(75)
  })

  it("finds SpCas9 NGG guide candidates on both strands", () => {
    const guides = findCrisprGuides("AAAACCCCGGGGTTTTAAAACCCCGGGAACCCCGGGG", 10)
    expect(guides.length).toBeGreaterThan(0)
    expect(guides[0].guide).toHaveLength(20)
    expect(guides[0].pam.endsWith("GG")).toBe(true)
  })
})
