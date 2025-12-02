import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

export async function POST(request: NextRequest) {
  try {
    const { prompt, action, selectedText } = await request.json()

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      )
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

    // Build context-aware prompts for chemistry/biochemistry
    let systemPrompt = `You are an AI assistant specialized in chemistry and biochemistry documentation. 
You help scientists write clear, accurate, and well-structured scientific notes.

CRITICAL RULES:
1. NEVER add introductory phrases like "Here's the improved text" or "Here is the result"
2. Return ONLY the edited text itself, nothing else
3. Do not explain what you did or add any meta-commentary
4. For chemical formulas, use subscript notation: H₂O, CO₂, CH₃COOH, etc.
5. For chemical equations, use proper arrows: → for reactions, ⇌ for equilibrium
6. For ions, use superscript: Na⁺, Ca²⁺, OH⁻, SO₄²⁻
7. For Greek letters: Δ (delta), α (alpha), β (beta), γ (gamma), etc.
8. For thermodynamic symbols: ΔG (Gibbs free energy), ΔH (enthalpy), ΔS (entropy)
9. Use scientific terminology accurately
10. Keep the writing style professional but accessible

`

    let userPrompt = ''

    switch (action) {
      case 'improve':
        userPrompt = `Improve the following scientific text while maintaining accuracy and proper chemical notation. Return ONLY the improved text without any introductory phrases:\n\n${selectedText}`
        break
      case 'continue':
        userPrompt = `Continue writing this scientific text naturally, maintaining the same style and topic. Return ONLY the continuation without any introductory phrases:\n\n${selectedText}`
        break
      case 'shorter':
        userPrompt = `Make this scientific text more concise while preserving all key information and proper chemical notation. Return ONLY the shortened text without any introductory phrases:\n\n${selectedText}`
        break
      case 'longer':
        userPrompt = `Expand this scientific text with more detail and context, maintaining accuracy. Return ONLY the expanded text without any introductory phrases:\n\n${selectedText}`
        break
      case 'simplify':
        userPrompt = `Simplify this scientific text for easier understanding while maintaining accuracy. Return ONLY the simplified text without any introductory phrases:\n\n${selectedText}`
        break
      case 'grammar':
        userPrompt = `Fix grammar and improve clarity in this scientific text. Return ONLY the corrected text without any introductory phrases:\n\n${selectedText}`
        break
      case 'structure':
        userPrompt = `Analyze this text and format all chemical compounds, formulas, and structures properly with correct notation (subscripts, superscripts, arrows, Greek letters). If it's a chemical equation, balance it if needed. Return ONLY the formatted text without any introductory phrases:\n\n${selectedText}`
        break
      default:
        userPrompt = prompt || selectedText
    }

    const result = await model.generateContent(systemPrompt + userPrompt)
    const response = await result.response
    const text = response.text()

    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Gemini API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process AI request' },
      { status: 500 }
    )
  }
}

