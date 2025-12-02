import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { chemistryTerms, commonFormulas } from './chemical-formula'

export interface ChemistryHighlightOptions {
  types: string[]
}

export const ChemistryHighlight = Extension.create<ChemistryHighlightOptions>({
  name: 'chemistryHighlight',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('chemistryHighlight'),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            const { doc } = state

            // Create regex patterns for chemistry terms and formulas
            const termPattern = new RegExp(
              `\\b(${chemistryTerms.join('|')})\\b`,
              'gi'
            )
            
            // Pattern for chemical formulas (e.g., H2O, CO2, CH3COOH)
            const formulaPattern = /\b([A-Z][a-z]?\d*)+(\^[+-]|\([A-Z][a-z]?\d*\)\d*)?\b/g
            
            // Pattern for chemical equations with arrows
            const equationPattern = /[A-Z][a-z]?\d*(\s*[+]\s*[A-Z][a-z]?\d*)*\s*(->|→|⇌|<=>)\s*[A-Z][a-z]?\d*(\s*[+]\s*[A-Z][a-z]?\d*)*/g

            doc.descendants((node, pos) => {
              if (!this.options.types.includes(node.type.name)) {
                return
              }

              if (!node.isText || !node.text) {
                return
              }

              const text = node.text

              // Highlight chemistry terms
              let match
              while ((match = termPattern.exec(text)) !== null) {
                const from = pos + match.index
                const to = from + match[0].length
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'chemistry-term',
                    'data-term': match[0],
                  })
                )
              }

              // Highlight chemical formulas
              formulaPattern.lastIndex = 0
              while ((match = formulaPattern.exec(text)) !== null) {
                // Check if it's a common formula or looks like a chemical formula
                const formula = match[0]
                if (
                  commonFormulas.some(f => f.toLowerCase() === formula.toLowerCase()) ||
                  /[A-Z][a-z]?\d/.test(formula)
                ) {
                  const from = pos + match.index
                  const to = from + match[0].length
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: 'chemical-formula-highlight',
                      'data-formula': match[0],
                    })
                  )
                }
              }

              // Highlight chemical equations
              equationPattern.lastIndex = 0
              while ((match = equationPattern.exec(text)) !== null) {
                const from = pos + match.index
                const to = from + match[0].length
                decorations.push(
                  Decoration.inline(from, to, {
                    class: 'chemical-equation',
                    'data-equation': match[0],
                  })
                )
              }
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

