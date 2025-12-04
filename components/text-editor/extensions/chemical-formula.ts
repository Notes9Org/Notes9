import { Mark, mergeAttributes } from '@tiptap/core'

export interface ChemicalFormulaOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chemicalFormula: {
      /**
       * Set a chemical formula mark
       */
      setChemicalFormula: () => ReturnType
      /**
       * Toggle a chemical formula mark
       */
      toggleChemicalFormula: () => ReturnType
      /**
       * Unset a chemical formula mark
       */
      unsetChemicalFormula: () => ReturnType
    }
  }
}

export const ChemicalFormula = Mark.create<ChemicalFormulaOptions>({
  name: 'chemicalFormula',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-chemical-formula]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-chemical-formula': '',
        class: 'chemical-formula',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setChemicalFormula:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name)
        },
      toggleChemicalFormula:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name)
        },
      unsetChemicalFormula:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})

// Helper function to convert text to proper chemical notation
export function formatChemicalFormula(text: string): string {
  let formatted = text

  // Convert Greek letter names to symbols
  const greekLetters: Record<string, string> = {
    'alpha': 'α', 'Alpha': 'α',
    'beta': 'β', 'Beta': 'β',
    'gamma': 'γ', 'Gamma': 'γ',
    'delta': 'δ', 'Delta': 'Δ',
    'epsilon': 'ε', 'Epsilon': 'ε',
    'theta': 'θ', 'Theta': 'θ',
    'lambda': 'λ', 'Lambda': 'λ',
    'mu': 'μ', 'Mu': 'μ',
    'pi': 'π', 'Pi': 'π',
    'sigma': 'σ', 'Sigma': 'σ',
    'omega': 'ω', 'Omega': 'ω',
  }
  
  Object.entries(greekLetters).forEach(([name, symbol]) => {
    formatted = formatted.replace(new RegExp(`\\b${name}\\b`, 'g'), symbol)
  })

  // Convert $\Delta G$ or \Delta G to ΔG
  formatted = formatted.replace(/\$?\\Delta\s*([A-Z])\$?/g, 'Δ$1')
  formatted = formatted.replace(/\$?\\delta\s*([A-Z])\$?/g, 'δ$1')
  
  // Convert numbers after elements to subscripts
  formatted = formatted.replace(/([A-Z][a-z]?)(\d+)/g, (match, element, number) => {
    const subscripts: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'
    }
    const subscriptNumber = number.split('').map((d: string) => subscripts[d]).join('')
    return element + subscriptNumber
  })

  // Convert charge notation to superscripts
  formatted = formatted.replace(/\^(\d*[+-])/g, (match, charge) => {
    const superscripts: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻'
    }
    return charge.split('').map((c: string) => superscripts[c] || c).join('')
  })

  // Replace common arrow notations
  formatted = formatted.replace(/->|→/g, '→')
  formatted = formatted.replace(/<->|⇌/g, '⇌')
  formatted = formatted.replace(/<=>/g, '⇌')

  return formatted
}

// Common chemistry terms for highlighting
export const chemistryTerms = [
  // Basic chemistry
  'acid', 'base', 'salt', 'buffer', 'catalyst', 'enzyme', 'substrate',
  'product', 'reactant', 'solution', 'solvent', 'solute', 'concentration',
  'molarity', 'molality', 'pH', 'pKa', 'pI', 'equilibrium', 'reaction',
  'ionic', 'covalent', 'hydrogen bond', 'van der Waals', 'dipole',
  
  // Biochemistry - Proteins & Amino Acids
  'protein', 'amino acid', 'peptide', 'polypeptide', 'dipeptide', 'tripeptide',
  'primary structure', 'secondary structure', 'tertiary structure', 'quaternary structure',
  'alpha helix', 'beta sheet', 'random coil', 'protein folding', 'denaturation',
  'glycine', 'alanine', 'valine', 'leucine', 'isoleucine', 'proline',
  'phenylalanine', 'tryptophan', 'methionine', 'serine', 'threonine',
  'cysteine', 'tyrosine', 'asparagine', 'glutamine', 'aspartate',
  'glutamate', 'lysine', 'arginine', 'histidine',
  'essential amino acid', 'nonessential amino acid', 'polar', 'nonpolar',
  'hydrophobic', 'hydrophilic', 'amphipathic', 'zwitterion',
  
  // Biochemistry - Enzymes
  'enzyme', 'coenzyme', 'cofactor', 'apoenzyme', 'holoenzyme', 'prosthetic group',
  'active site', 'allosteric site', 'substrate', 'enzyme-substrate complex',
  'competitive inhibition', 'noncompetitive inhibition', 'uncompetitive inhibition',
  'Michaelis-Menten', 'Km', 'Vmax', 'kcat', 'turnover number',
  'enzyme kinetics', 'catalytic efficiency', 'induced fit', 'lock and key',
  'oxidoreductase', 'transferase', 'hydrolase', 'lyase', 'isomerase', 'ligase',
  
  // Biochemistry - Nucleic Acids
  'DNA', 'RNA', 'nucleotide', 'nucleoside', 'polynucleotide',
  'adenine', 'guanine', 'cytosine', 'thymine', 'uracil',
  'purine', 'pyrimidine', 'base pair', 'Watson-Crick',
  'double helix', 'antiparallel', 'complementary', 'base stacking',
  'mRNA', 'tRNA', 'rRNA', 'snRNA', 'miRNA', 'siRNA',
  'transcription', 'translation', 'replication', 'reverse transcription',
  'codon', 'anticodon', 'start codon', 'stop codon', 'genetic code',
  'exon', 'intron', 'splicing', 'promoter', 'enhancer', 'silencer',
  'polymerase', 'helicase', 'ligase', 'topoisomerase', 'primase',
  
  // Biochemistry - Carbohydrates
  'carbohydrate', 'monosaccharide', 'disaccharide', 'oligosaccharide', 'polysaccharide',
  'glucose', 'fructose', 'galactose', 'ribose', 'deoxyribose',
  'sucrose', 'lactose', 'maltose', 'glycogen', 'starch', 'cellulose',
  'glycosidic bond', 'anomeric carbon', 'reducing sugar', 'aldose', 'ketose',
  'hexose', 'pentose', 'triose', 'glycolysis', 'gluconeogenesis',
  
  // Biochemistry - Lipids
  'lipid', 'fatty acid', 'triglyceride', 'phospholipid', 'glycolipid',
  'steroid', 'cholesterol', 'sphingolipid', 'prostaglandin', 'wax',
  'saturated', 'unsaturated', 'polyunsaturated', 'omega-3', 'omega-6',
  'membrane', 'bilayer', 'micelle', 'liposome', 'lipid raft',
  'hydrophobic', 'amphipathic', 'saponification', 'esterification',
  
  // Biochemistry - Metabolism
  'metabolism', 'catabolism', 'anabolism', 'metabolic pathway',
  'glycolysis', 'gluconeogenesis', 'glycogenesis', 'glycogenolysis',
  'citric acid cycle', 'Krebs cycle', 'TCA cycle', 'pentose phosphate pathway',
  'electron transport chain', 'oxidative phosphorylation', 'chemiosmosis',
  'ATP', 'ADP', 'AMP', 'GTP', 'NAD+', 'NADH', 'NADP+', 'NADPH',
  'FAD', 'FADH2', 'CoA', 'acetyl-CoA', 'coenzyme A',
  'beta-oxidation', 'fatty acid synthesis', 'lipogenesis', 'lipolysis',
  'ketogenesis', 'ketone bodies', 'acetoacetate', 'beta-hydroxybutyrate',
  
  // Biochemistry - Cellular Processes
  'phosphorylation', 'dephosphorylation', 'oxidation', 'reduction', 'hydrolysis',
  'condensation', 'dehydration synthesis', 'redox reaction',
  'signal transduction', 'second messenger', 'G protein', 'kinase', 'phosphatase',
  'receptor', 'ligand', 'hormone', 'neurotransmitter', 'cytokine',
  'apoptosis', 'necrosis', 'autophagy', 'cell cycle', 'mitosis', 'meiosis',
  
  // Biochemistry - Regulation
  'feedback inhibition', 'allosteric regulation', 'covalent modification',
  'phosphorylation cascade', 'ubiquitination', 'acetylation', 'methylation',
  'gene expression', 'transcription factor', 'epigenetics', 'chromatin',
  'histone', 'DNA methylation', 'post-translational modification',
  
  // Organic chemistry
  'alkane', 'alkene', 'alkyne', 'aromatic', 'benzene', 'carboxylic acid',
  'ester', 'ether', 'aldehyde', 'ketone', 'alcohol', 'amine', 'amide',
  'functional group', 'isomer', 'stereoisomer', 'enantiomer', 'diastereomer',
  'chiral', 'achiral', 'racemic', 'optical activity', 'R configuration', 'S configuration',
  
  // Physical chemistry
  'enthalpy', 'entropy', 'Gibbs free energy', 'activation energy',
  'rate constant', 'kinetics', 'thermodynamics', 'electrochemistry',
  'endergonic', 'exergonic', 'endothermic', 'exothermic',
  
  // Lab techniques
  'titration', 'chromatography', 'spectroscopy', 'centrifugation',
  'electrophoresis', 'PCR', 'Western blot', 'ELISA', 'Northern blot', 'Southern blot',
  'gel electrophoresis', 'SDS-PAGE', 'isoelectric focusing', 'mass spectrometry',
  'NMR', 'X-ray crystallography', 'fluorescence microscopy', 'immunofluorescence',
  'flow cytometry', 'HPLC', 'GC-MS', 'sequencing', 'cloning', 'mutagenesis'
]

// Common chemical formulas
export const commonFormulas = [
  // Basic chemistry
  'H2O', 'CO2', 'O2', 'N2', 'H2', 'Cl2', 'H2SO4', 'HCl', 'HNO3', 'H3PO4',
  'NaOH', 'KOH', 'NaCl', 'KCl', 'CaCl2', 'MgCl2', 'NaHCO3',
  'CH4', 'C2H5OH', 'CH3COOH', 'NH3', 'NH4+', 'CaCO3', 'H2O2',
  'SO4^2-', 'PO4^3-', 'NO3^-', 'OH^-', 'H3O^+',
  
  // Biochemistry - Energy molecules
  'ATP', 'ADP', 'AMP', 'GTP', 'GDP', 'CTP', 'UTP',
  'NAD+', 'NADH', 'NADP+', 'NADPH', 'FAD', 'FADH2',
  'CoA', 'CoASH', 'acetyl-CoA',
  
  // Biochemistry - Sugars
  'C6H12O6', 'C12H22O11', 'C5H10O5',
  
  // Biochemistry - Amino acids (abbreviated)
  'Gly', 'Ala', 'Val', 'Leu', 'Ile', 'Pro', 'Phe', 'Trp', 'Met',
  'Ser', 'Thr', 'Cys', 'Tyr', 'Asn', 'Gln', 'Asp', 'Glu', 'Lys', 'Arg', 'His',
  
  // Biochemistry - Nucleotides (abbreviated)
  'AMP', 'ADP', 'ATP', 'GMP', 'GDP', 'GTP', 'CMP', 'CDP', 'CTP',
  'UMP', 'UDP', 'UTP', 'dAMP', 'dADP', 'dATP', 'dGMP', 'dGDP', 'dGTP',
  'dCMP', 'dCDP', 'dCTP', 'dTMP', 'dTDP', 'dTTP',
  
  // Biochemistry - Common ions
  'Ca^2+', 'Mg^2+', 'Na^+', 'K^+', 'Fe^2+', 'Fe^3+', 'Zn^2+', 'Cu^2+',
  'Cl^-', 'HCO3^-', 'HPO4^2-', 'H2PO4^-',
  
  // Organic chemistry
  'CH3', 'CH2', 'COOH', 'NH2', 'OH', 'CHO', 'C=O'
]

