# 🧪 TipTap Integration Plan for Notes9 Lab Notes

## Executive Summary

Complete integration plan for implementing TipTap as the primary rich text editor for lab notes in Notes9. This document covers all available features, responsive design strategy, AI components, and implementation roadmap.

**TipTap Licensing**: TipTap is **100% Free and Open Source** under the **MIT License** for the core editor and most extensions. This means you can use, modify, and distribute it freely in commercial and non-commercial projects without restrictions.

---

## 🆓 TipTap Open Source Status

### Core Editor
- **License**: MIT License (Free Forever)
- **Cost**: $0
- **Repository**: https://github.com/ueberdosis/tiptap
- **Status**: Production-ready, actively maintained
- **Community**: 27,000+ GitHub stars, active Discord community

### What's Free vs Paid

| Category | Free (MIT License) | Paid (Pro/Business Plans) |
|----------|-------------------|---------------------------|
| **Core Editor** | ✅ Full access | N/A |
| **Basic Extensions** | ✅ 50+ extensions | N/A |
| **Recently Open-Sourced** | ✅ 8 premium extensions (June 2025) | N/A |
| **AI Toolkit** | ❌ Limited (DIY with OpenAI) | ✅ Full AI agent system |
| **Collaboration** | ❌ (DIY with Yjs possible) | ✅ Managed service |
| **Comments System** | ❌ | ✅ Full inline comments |
| **Version History** | ❌ (DIY possible) | ✅ Managed history |
| **Document Conversion** | ❌ Limited | ✅ DOCX, ODT, Markdown |
| **Cloud Storage** | ❌ | ✅ Managed cloud |

### Recently Open-Sourced Extensions (June 2025)

These were **previously paid** but are now **100% free (MIT License)**:

| Extension | Previous Price | Now Free | Description |
|-----------|---------------|----------|-------------|
| **Details** | Pro | ✅ Free | Expandable content sections (collapsible) |
| **DetailsContent** | Pro | ✅ Free | Content wrapper for Details |
| **DetailsSummary** | Pro | ✅ Free | Summary/title for Details |
| **Emoji** | Pro | ✅ Free | Native emoji picker and support |
| **DragHandle** | Pro | ✅ Free | Drag-and-drop for blocks |
| **FileHandler** | Pro | ✅ Free | File upload handling (images, documents) |
| **InvisibleCharacters** | Pro | ✅ Free | Show whitespace, line breaks |
| **Mathematics** | Pro | ✅ Free | LaTeX/KaTeX equation rendering |
| **TableOfContents** | Pro | ✅ Free | Auto-generate table of contents |
| **UniqueID** | Pro | ✅ Free | Unique IDs for all nodes |

**Total Savings**: ~$1,200/year per developer (based on previous Pro pricing)

---

## 🎯 Project Goals

1. **Production-Ready**: Stable, tested, deployable editor
2. **Responsive**: Works seamlessly on desktop, tablet, and mobile
3. **Feature-Rich**: All essential lab note capabilities
4. **AI-Powered**: Smart suggestions and automation (DIY with OpenAI)
5. **Lightweight**: Fast load times, minimal bundle size
6. **Easy to Use**: Intuitive interface for scientists
7. **Cost-Effective**: 100% free open source solution

---

## 📱 Responsive Design Strategy

### Device Support
- **Desktop**: Full toolbar, keyboard shortcuts, drag-and-drop
- **Tablet**: Touch-optimized, condensed toolbar, gesture support  
- **Mobile**: Bottom toolbar, minimal UI, swipe gestures

### Responsive Toolbar Design
```
Desktop (≥1024px): Full horizontal toolbar with all buttons
Tablet (768-1023px): Scrollable toolbar with grouped items
Mobile (<768px): Bottom sheet toolbar with category tabs
```

### Touch Optimization
- Larger touch targets (44×44px minimum)
- Long-press for context menus
- Swipe gestures for formatting
- Pull-to-dismiss keyboard on mobile

---

## 🧩 Complete TipTap Extensions & Components

### 📦 Starter Kit (All Free - MIT License)

The `@tiptap/starter-kit` bundle includes 16 essential extensions in one package:

| Extension | Included | Description | Package Name |
|-----------|----------|-------------|--------------|
| **Blockquote** | ✅ | Quote blocks for citations | `@tiptap/extension-blockquote` |
| **Bold** | ✅ | Bold text formatting | `@tiptap/extension-bold` |
| **BulletList** | ✅ | Unordered lists | `@tiptap/extension-bullet-list` |
| **Code** | ✅ | Inline code formatting | `@tiptap/extension-code` |
| **CodeBlock** | ✅ | Multi-line code blocks | `@tiptap/extension-code-block` |
| **Document** | ✅ | Root document node | `@tiptap/extension-document` |
| **Dropcursor** | ✅ | Visual cursor for drag/drop | `@tiptap/extension-dropcursor` |
| **Gapcursor** | ✅ | Cursor in non-editable areas | `@tiptap/extension-gapcursor` |
| **HardBreak** | ✅ | Line breaks (Shift+Enter) | `@tiptap/extension-hard-break` |
| **Heading** | ✅ | H1-H6 headings | `@tiptap/extension-heading` |
| **History** | ✅ | Undo/Redo functionality | `@tiptap/extension-history` |
| **HorizontalRule** | ✅ | Horizontal divider lines | `@tiptap/extension-horizontal-rule` |
| **Italic** | ✅ | Italic text formatting | `@tiptap/extension-italic` |
| **ListItem** | ✅ | Individual list items | `@tiptap/extension-list-item` |
| **OrderedList** | ✅ | Numbered lists | `@tiptap/extension-ordered-list` |
| **Paragraph** | ✅ | Standard paragraphs | `@tiptap/extension-paragraph` |
| **Strike** | ✅ | Strikethrough text | `@tiptap/extension-strike` |
| **Text** | ✅ | Basic text node | `@tiptap/extension-text` |

**Install**: `pnpm add @tiptap/starter-kit` (includes all 16 extensions)

---

### 🎨 Text Formatting Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Bold** | `@tiptap/extension-bold` | **Bold text** | Key findings | ⭐⭐⭐ High |
| **Italic** | `@tiptap/extension-italic` | *Italic text* | Species names (*E. coli*) | ⭐⭐⭐ High |
| **Underline** | `@tiptap/extension-underline` | <u>Underlined text</u> | Critical values | ⭐⭐⭐ High |
| **Strike** | `@tiptap/extension-strike` | ~~Strikethrough~~ | Corrections | ⭐⭐ Medium |
| **Code** | `@tiptap/extension-code` | `inline code` | Gene names, formulas | ⭐⭐⭐ High |
| **Subscript** | `@tiptap/extension-subscript` | H₂O formatting | Chemical formulas | ⭐⭐⭐ High |
| **Superscript** | `@tiptap/extension-superscript` | 10² formatting | Exponents, references | ⭐⭐⭐ High |
| **Highlight** | `@tiptap/extension-highlight` | ==Highlighted text== | Color-code results | ⭐⭐⭐ High |
| **TextStyle** | `@tiptap/extension-text-style` | Custom styling wrapper | Advanced formatting | ⭐⭐ Medium |
| **Color** | `@tiptap/extension-color` | Text color changes | Data categorization | ⭐⭐ Medium |
| **FontFamily** | `@tiptap/extension-font-family` | Font selection | Report formatting | ⭐ Low |

---

### 📝 Structure & Layout Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Heading** | `@tiptap/extension-heading` | H1-H6 headings | Section organization | ⭐⭐⭐ High |
| **Paragraph** | `@tiptap/extension-paragraph` | Standard paragraphs | General notes | ⭐⭐⭐ High |
| **Blockquote** | `@tiptap/extension-blockquote` | Quote blocks | Citations | ⭐⭐⭐ High |
| **HorizontalRule** | `@tiptap/extension-horizontal-rule` | Divider line (---) | Section breaks | ⭐⭐ Medium |
| **HardBreak** | `@tiptap/extension-hard-break` | Line break (Shift+Enter) | Formatting control | ⭐⭐⭐ High |
| **TextAlign** | `@tiptap/extension-text-align` | Left/Center/Right/Justify | Document formatting | ⭐⭐ Medium |
| **Indent** | `@tiptap/extension-indent` | Increase indentation | Nested content | ⭐⭐ Medium |

---

### 📋 Lists & Tasks Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **BulletList** | `@tiptap/extension-bullet-list` | Unordered lists | Materials, observations | ⭐⭐⭐ High |
| **OrderedList** | `@tiptap/extension-ordered-list` | Numbered lists | Procedures, protocols | ⭐⭐⭐ High |
| **ListItem** | `@tiptap/extension-list-item` | List item nodes | Required for lists | ⭐⭐⭐ High |
| **TaskList** | `@tiptap/extension-task-list` | Checkable task lists | Experiment checklists | ⭐⭐⭐ High |
| **TaskItem** | `@tiptap/extension-task-item` | Individual task items | Todo items | ⭐⭐⭐ High |
| **ListKeymap** | `@tiptap/extension-list-keymap` | Enhanced list shortcuts | Keyboard efficiency | ⭐⭐ Medium |

---

### 🔬 Scientific Content Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Mathematics** | `@tiptap/extension-mathematics` | LaTeX/KaTeX equations | Formulas, calculations | ⭐⭐⭐ High |
| **CodeBlock** | `@tiptap/extension-code-block` | Multi-line code | DNA sequences, scripts | ⭐⭐⭐ High |
| **CodeBlockLowlight** | `@tiptap/extension-code-block-lowlight` | Syntax highlighting | 185+ languages | ⭐⭐⭐ High |
| **Table** | `@tiptap/extension-table` | Data tables | Experimental results | ⭐⭐⭐ High |
| **TableRow** | `@tiptap/extension-table-row` | Table rows | Required for tables | ⭐⭐⭐ High |
| **TableCell** | `@tiptap/extension-table-cell` | Table cells | Data entry | ⭐⭐⭐ High |
| **TableHeader** | `@tiptap/extension-table-header` | Table header cells | Column labels | ⭐⭐⭐ High |

**Mathematics Extension** (Now FREE!):
- Supports full LaTeX syntax
- Inline equations: `$E=mc^2$`
- Block equations: `$$\int_0^\infty e^{-x^2} dx$$`
- Requires KaTeX library: `pnpm add katex`

**CodeBlockLowlight** (185+ Languages Supported):
```typescript
// Supported languages include:
python, javascript, typescript, r, matlab, julia, bash, sql,
dna, fasta, json, yaml, markdown, latex, xml, css, html,
c, cpp, java, go, rust, ruby, php, swift, kotlin, scala
// And 150+ more!
```

---

### 🖼️ Media Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Image** | `@tiptap/extension-image` | Image insertion & resizing | Microscopy, charts | ⭐⭐⭐ High |
| **Link** | `@tiptap/extension-link` | Hyperlinks with validation | Citations, protocols | ⭐⭐⭐ High |
| **Youtube** | `@tiptap/extension-youtube` | Embedded YouTube videos | Tutorial references | ⭐ Low |
| **FileHandler** | `@tiptap/extension-file-handler` | Drag & drop file uploads | Image/file upload | ⭐⭐⭐ High |

---

### 🎁 Recently Open-Sourced Extensions (Free Since June 2025!)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Details** | `@tiptap/extension-details` | Collapsible sections | Hide methodology | ⭐⭐⭐ High |
| **DetailsContent** | `@tiptap/extension-details-content` | Content wrapper | Required for Details | ⭐⭐⭐ High |
| **DetailsSummary** | `@tiptap/extension-details-summary` | Summary/title | Section headers | ⭐⭐⭐ High |
| **Emoji** | `@tiptap/extension-emoji` | Native emoji picker 😀🔬 | Quick reactions | ⭐⭐ Medium |
| **DragHandle** | `@tiptap/extension-drag-handle` | Drag blocks to reorder | Document reorganization | ⭐⭐⭐ High |
| **FileHandler** | `@tiptap/extension-file-handler` | File upload handling | Images, PDFs | ⭐⭐⭐ High |
| **InvisibleCharacters** | `@tiptap/extension-invisible-characters` | Show whitespace | Debug formatting | ⭐⭐ Medium |
| **TableOfContents** | `@tiptap/extension-table-of-contents` | Auto TOC generation | Long reports | ⭐⭐⭐ High |
| **UniqueID** | `@tiptap/extension-unique-id` | Unique node IDs | Cross-referencing | ⭐⭐ Medium |

**Value**: These 9 extensions were previously ~$99/month per seat. Now **100% FREE (MIT)**.

---

### 🛠️ Utility Extensions (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **Placeholder** | `@tiptap/extension-placeholder` | Empty editor hint text | User guidance | ⭐⭐⭐ High |
| **CharacterCount** | `@tiptap/extension-character-count` | Live word/char counter | Report limits | ⭐⭐ Medium |
| **Focus** | `@tiptap/extension-focus` | Focus mode for paragraphs | Distraction-free | ⭐ Low |
| **Dropcursor** | `@tiptap/extension-dropcursor` | Visual drop indicator | Drag & drop | ⭐⭐⭐ High |
| **Gapcursor** | `@tiptap/extension-gapcursor` | Cursor in gaps | Navigation | ⭐⭐⭐ High |
| **Typography** | `@tiptap/extension-typography` | Smart quotes, dashes | Professional writing | ⭐⭐ Medium |
| **Collaboration** | `@tiptap/extension-collaboration` | Real-time editing (Yjs) | Team collaboration | ⭐⭐⭐ High |
| **CollaborationCursor** | `@tiptap/extension-collaboration-cursor` | Show user cursors | Multi-user awareness | ⭐⭐⭐ High |

---

### 🎨 UI Components & Menus (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **BubbleMenu** | `@tiptap/extension-bubble-menu` | Floating toolbar on selection | Quick formatting | ⭐⭐⭐ High |
| **FloatingMenu** | `@tiptap/extension-floating-menu` | Menu on empty lines | Block insertion | ⭐⭐⭐ High |
| **Mention** | `@tiptap/extension-mention` | @mention users | Collaboration | ⭐⭐ Medium |

---

### 📊 Advanced Features (Free - MIT License)

| Extension | Package | Description | Lab Use Case | Priority |
|-----------|---------|-------------|--------------|----------|
| **History** | `@tiptap/extension-history` | Undo/Redo with history | Error recovery | ⭐⭐⭐ High |
| **UniqueID** | `@tiptap/extension-unique-id` | Unique IDs for nodes | Cross-references | ⭐⭐ Medium |
| **TextSelection** | Built-in | Text selection handling | Native browser | ⭐⭐⭐ High |
| **Commands** | Built-in | Programmatic control | API integration | ⭐⭐⭐ High |

---

## 🤖 AI-Powered Components

### TipTap AI Offerings Overview

| Feature | Free (DIY) | Paid (AI Toolkit) | Cost |
|---------|-----------|-------------------|------|
| **AI Integration** | ✅ DIY with OpenAI/Claude | ✅ Managed service | Free vs $99+/mo |
| **Autocompletion** | ✅ Custom implementation | ✅ Pre-built | Custom vs $99+/mo |
| **Smart Suggestions** | ✅ Custom with AI API | ✅ Pre-built | API costs vs $99+/mo |
| **Grammar Check** | ✅ LanguageTool (open source) | ✅ Integrated | Free vs $99+/mo |
| **Summarization** | ✅ OpenAI/Claude API | ✅ Pre-built | $0.03/1K tokens vs $99+/mo |
| **Translation** | ✅ DeepL/Google Translate | ✅ Pre-built | Free tier vs $99+/mo |
| **Citation Formatting** | ✅ Custom implementation | ✅ Pre-built | Custom vs $99+/mo |
| **Track Changes** | ✅ DIY with Yjs | ✅ Pre-built UI | Free vs $99+/mo |

### ✅ FREE AI Features (DIY Implementation)

You can implement ALL AI features for FREE using open source tools and APIs:

| Feature | Implementation | Free Tools/APIs | Estimated Cost | Priority |
|---------|---------------|-----------------|----------------|----------|
| **AI Writing Assistant** | OpenAI/Claude API integration | OpenAI GPT-4o-mini ($0.15/1M tokens) | ~$5-20/month | ⭐⭐⭐ High |
| **Auto-completion** | Custom TipTap extension + AI | OpenAI Completion API | ~$2-10/month | ⭐⭐⭐ High |
| **Smart Suggestions** | Context-aware prompts | Claude 3.5 Haiku (cheap) | ~$1-5/month | ⭐⭐⭐ High |
| **Grammar Check** | LanguageTool API | LanguageTool (free tier: 20K chars/day) | $0 or $19/year | ⭐⭐ Medium |
| **Citation Assistant** | OpenAI + DOI.org API | OpenAI + free DOI lookup | ~$2-5/month | ⭐⭐ Medium |
| **Summary Generation** | OpenAI/Claude API | GPT-4o-mini or Claude Haiku | ~$1-3/month | ⭐⭐ Medium |
| **Template Suggestions** | Pattern matching + AI | Local ML model or OpenAI | ~$1-5/month | ⭐⭐ Medium |
| **Scientific Term Autocomplete** | Custom dictionary + fuzzy search | Free (local data) | $0 | ⭐⭐⭐ High |
| **Formula Recognition** | Mathpix OCR API | Free tier: 50 requests/month | $0 or $4.99/month | ⭐⭐ Medium |
| **Spell Check** | Browser native + custom | Free (browser API) | $0 | ⭐⭐⭐ High |

**Total FREE DIY Cost**: ~$10-50/month for full AI features (vs $99-299/month for TipTap Pro)

---

### 🔧 DIY AI Implementation Examples

#### 1. AI Autocomplete Extension (FREE)

```typescript
// extensions/ai-autocomplete.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const AIAutocomplete = Extension.create({
  name: 'aiAutocomplete',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('aiAutocomplete'),
        
        props: {
          handleTextInput(view, from, to, text) {
            // Trigger autocomplete after typing
            const context = view.state.doc.textBetween(0, from, ' ')
            
            if (context.length > 20) {
              // Get AI suggestion
              fetchSuggestion(context).then(suggestion => {
                // Show inline suggestion
                showSuggestionTooltip(view, suggestion)
              })
            }
            
            return false
          }
        }
      })
    ]
  }
})

async function fetchSuggestion(context: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Cheapest: $0.15/1M tokens
    messages: [
      { role: 'system', content: 'You are a scientific writing assistant. Suggest completions for lab notes.' },
      { role: 'user', content: `Complete this text: ${context}` }
    ],
    max_tokens: 50,
    temperature: 0.7
  })
  
  return response.choices[0].message.content
}
```

**Cost**: ~$0.01 per 100 autocomplete requests

---

#### 2. Grammar & Style Check (FREE with LanguageTool)

```typescript
// extensions/grammar-check.ts
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'

export const GrammarCheck = Extension.create({
  name: 'grammarCheck',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('grammarCheck'),
        
        state: {
          init() {
            return { suggestions: [] }
          },
          apply(tr, value) {
            // Check grammar on document changes
            const text = tr.doc.textContent
            
            if (text.length > 100) {
              checkGrammar(text).then(suggestions => {
                // Highlight errors
                markGrammarErrors(tr, suggestions)
              })
            }
            
            return value
          }
        }
      })
    ]
  }
})

async function checkGrammar(text: string) {
  // Free LanguageTool API (20K characters/day)
  const response = await fetch('https://api.languagetooltool.org/v2/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      text: text,
      language: 'en-US',
      enabledOnly: 'false'
    })
  })
  
  const data = await response.json()
  return data.matches // Grammar errors and suggestions
}
```

**Cost**: FREE (up to 20,000 characters/day)

---

#### 3. Smart Chemical Formula Autocomplete (FREE - Local)

```typescript
// lib/chemical-autocomplete.ts
const COMMON_CHEMICALS = [
  { formula: 'H₂O', name: 'Water' },
  { formula: 'H₂SO₄', name: 'Sulfuric Acid' },
  { formula: 'NaCl', name: 'Sodium Chloride' },
  { formula: 'CH₃COOH', name: 'Acetic Acid' },
  { formula: 'C₆H₁₂O₆', name: 'Glucose' },
  // ... add 1000+ common chemicals
]

export function autoCompleteChemical(input: string) {
  const matches = COMMON_CHEMICALS.filter(chem =>
    chem.name.toLowerCase().includes(input.toLowerCase()) ||
    chem.formula.toLowerCase().includes(input.toLowerCase())
  )
  
  return matches.slice(0, 10) // Top 10 matches
}

// Usage in TipTap extension
export const ChemicalAutocomplete = Extension.create({
  name: 'chemicalAutocomplete',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('chemicalAutocomplete'),
        
        props: {
          handleKeyDown(view, event) {
            if (event.key === '@') {
              // Show chemical formula picker
              const suggestions = autoCompleteChemical('')
              showAutocompleteMenu(view, suggestions)
            }
            return false
          }
        }
      })
    ]
  }
})
```

**Cost**: $0 (completely free, runs locally)

---

#### 4. AI Summary Generation (FREE with OpenAI)

```typescript
// lib/ai-summary.ts
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateSummary(labNoteContent: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Only $0.15 per 1M input tokens
    messages: [
      {
        role: 'system',
        content: 'You are a scientific summarizer. Create concise summaries of lab notes, highlighting key findings, methods, and conclusions.'
      },
      {
        role: 'user',
        content: `Summarize this lab note:\n\n${labNoteContent}`
      }
    ],
    max_tokens: 300,
    temperature: 0.3 // Lower temp for factual summaries
  })
  
  return response.choices[0].message.content
}

// Usage in UI component
async function handleSummarize() {
  const content = editor.getText()
  const summary = await generateSummary(content)
  
  // Insert summary at top of document
  editor.commands.insertContentAt(0, {
    type: 'blockquote',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: summary }] }
    ]
  })
}
```

**Cost**: ~$0.003 per summary (1,000 words ≈ $0.003)

---

#### 5. Citation Formatter (FREE)

```typescript
// lib/citation-formatter.ts
// Use DOI.org API (FREE) + OpenAI for formatting

export async function formatCitation(doi: string, style: 'APA' | 'MLA' | 'Chicago') {
  // Step 1: Get paper metadata from DOI.org (FREE)
  const response = await fetch(`https://api.crossref.org/works/${doi}`)
  const data = await response.json()
  
  const paper = data.message
  
  // Step 2: Format citation using OpenAI
  const citation = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Format this citation in ${style} style.`
      },
      {
        role: 'user',
        content: JSON.stringify(paper)
      }
    ],
    max_tokens: 200
  })
  
  return citation.choices[0].message.content
}

// Usage
const formattedCitation = await formatCitation('10.1038/nature12373', 'APA')
// Output: "Smith, J., et al. (2013). Title. Nature, 123(4), 456-789."
```

**Cost**: $0 for DOI lookup + ~$0.001 per citation formatting

---

### ❌ PAID AI Features (TipTap Pro/Business)

These require TipTap Pro subscription ($99-299/month):

| Feature | Paid Plan Required | DIY Alternative | Difficulty |
|---------|-------------------|-----------------|------------|
| **AI Agent Toolkit** | Business ($299/mo) | OpenAI + Custom extensions | Medium |
| **Real-time AI Collaboration** | Business ($299/mo) | Yjs + OpenAI webhooks | Hard |
| **AI Track Changes UI** | Pro ($99/mo) | Custom UI + Yjs history | Medium |
| **Multi-Document AI Agent** | Business ($299/mo) | Custom orchestration | Hard |
| **AI Style Suggestions** | Pro ($99/mo) | LanguageTool + OpenAI | Easy |
| **AI Proofreader** | Pro ($99/mo) | Grammarly API + OpenAI | Easy |
| **AI Comments System** | Pro ($99/mo) | Custom comment extension | Medium |

---

### 🆓 Recommended FREE AI Stack for Lab Notes

```typescript
// Recommended free AI implementation
const AI_STACK = {
  // Text Generation & Completion
  textGeneration: 'OpenAI GPT-4o-mini ($0.15/1M tokens)',
  
  // Grammar & Spelling
  grammarCheck: 'LanguageTool Free API (20K chars/day)',
  spellCheck: 'Browser Native API (free)',
  
  // Scientific Features
  chemicalFormulas: 'Local database (free)',
  equationRecognition: 'Mathpix Free tier (50/month)',
  
  // Citations
  citationLookup: 'CrossRef DOI API (free)',
  citationFormatting: 'OpenAI GPT-4o-mini',
  
  // Summarization
  summarization: 'OpenAI GPT-4o-mini',
  
  // Collaboration
  realTimeSync: 'Yjs (free, self-hosted)',
  
  // Storage
  storage: 'Supabase Free tier (500MB)',
  
  // Total Monthly Cost: ~$10-30/month for 100 users
}
```

---

### 📊 Cost Comparison: DIY vs TipTap Pro

| Feature | DIY (Free) | TipTap Pro | Savings |
|---------|-----------|------------|---------|
| **Core Editor** | $0 | $0 | - |
| **AI Features** | $10-30/mo | $99-299/mo | $69-289/mo |
| **Collaboration** | $0 (self-host Yjs) | $99/mo | $99/mo |
| **Storage** | $0 (Supabase free) | Included | - |
| **Setup Time** | 2-4 weeks | 1 week | - |
| **Customization** | Full control | Limited | - |
| **Monthly Cost (10 users)** | $30-50 | $990-2,990 | **$940-2,940/mo** |
| **Annual Cost (10 users)** | $360-600 | $11,880-35,880 | **$11,280-35,280/year** |

**Recommendation**: For a lab notes app, the DIY approach saves **$11,000-35,000/year** and gives you full control.

---

## 📦 Installation & Dependencies

### Complete Installation Guide

#### 1. Core Packages (Required)

```bash
# Core TipTap editor + React integration
pnpm add @tiptap/react @tiptap/core @tiptap/pm

# Starter Kit (16 essential extensions in one package)
pnpm add @tiptap/starter-kit

# Or install extensions individually for smaller bundle:
# pnpm add @tiptap/extension-document @tiptap/extension-paragraph
# pnpm add @tiptap/extension-text @tiptap/extension-bold
# etc...
```

**Bundle Size**: Core + Starter Kit = ~50KB gzipped

---

#### 2. Text Formatting Extensions

```bash
# Additional text styling (not in starter kit)
pnpm add @tiptap/extension-underline
pnpm add @tiptap/extension-subscript
pnpm add @tiptap/extension-superscript
pnpm add @tiptap/extension-highlight
pnpm add @tiptap/extension-text-style
pnpm add @tiptap/extension-color
pnpm add @tiptap/extension-font-family
```

**Bundle Size**: ~10KB gzipped

---

#### 3. Scientific Content Extensions

```bash
# Tables (ESSENTIAL for lab data)
pnpm add @tiptap/extension-table @tiptap/extension-table-row
pnpm add @tiptap/extension-table-cell @tiptap/extension-table-header

# Mathematics support (LaTeX/KaTeX) - NOW FREE!
pnpm add @tiptap/extension-mathematics katex

# Code blocks with syntax highlighting
pnpm add @tiptap/extension-code-block-lowlight lowlight

# Images and links
pnpm add @tiptap/extension-image @tiptap/extension-link

# Task lists
pnpm add @tiptap/extension-task-list @tiptap/extension-task-item

# Text alignment
pnpm add @tiptap/extension-text-align
```

**Bundle Size**: ~80KB gzipped (including KaTeX ~150KB)

---

#### 4. Recently Open-Sourced Extensions (FREE!)

```bash
# Collapsible sections
pnpm add @tiptap/extension-details
pnpm add @tiptap/extension-details-content
pnpm add @tiptap/extension-details-summary

# Emoji support
pnpm add @tiptap/extension-emoji

# Drag & drop
pnpm add @tiptap/extension-drag-handle
pnpm add @tiptap/extension-file-handler

# Developer tools
pnpm add @tiptap/extension-invisible-characters
pnpm add @tiptap/extension-table-of-contents
pnpm add @tiptap/extension-unique-id
```

**Bundle Size**: ~30KB gzipped

---

#### 5. Utility Extensions

```bash
# UI components
pnpm add @tiptap/extension-bubble-menu
pnpm add @tiptap/extension-floating-menu

# Collaboration (Yjs-based, FREE!)
pnpm add @tiptap/extension-collaboration
pnpm add @tiptap/extension-collaboration-cursor
pnpm add yjs y-websocket y-indexeddb

# Other utilities
pnpm add @tiptap/extension-placeholder
pnpm add @tiptap/extension-character-count
pnpm add @tiptap/extension-typography
pnpm add @tiptap/extension-mention
pnpm add @tiptap/extension-focus
```

**Bundle Size**: ~40KB gzipped (+ Yjs ~100KB if using collaboration)

---

#### 6. AI & Integration Packages (Optional)

```bash
# OpenAI for AI features
pnpm add openai

# Grammar checking (free tier available)
pnpm add @languagetool/api

# For AI autocomplete
pnpm add @anthropic-ai/sdk  # Claude API

# For formula recognition
pnpm add mathpix-markdown-it

# For citation management
pnpm add citation-js
```

**Bundle Size**: Varies by usage (~50-200KB)

---

### Complete Package List with Sizes

| Package | Size (gzipped) | Purpose | Required |
|---------|---------------|---------|----------|
| `@tiptap/react` | 15KB | React bindings | ✅ Yes |
| `@tiptap/core` | 30KB | Core editor | ✅ Yes |
| `@tiptap/starter-kit` | 25KB | 16 basic extensions | ⭐ Recommended |
| `@tiptap/extension-table` | 20KB | Data tables | ✅ Yes (lab notes) |
| `@tiptap/extension-mathematics` | 5KB | LaTeX equations | ✅ Yes (science) |
| `katex` | 150KB | Math rendering | ✅ Yes (with math) |
| `@tiptap/extension-code-block-lowlight` | 10KB | Syntax highlighting | ⭐ Recommended |
| `lowlight` | 300KB | Language support (185 langs) | ⭐ Optional |
| `@tiptap/extension-collaboration` | 15KB | Real-time editing | ⭐ Optional |
| `yjs` | 100KB | CRDT for sync | ⭐ Optional |
| `@tiptap/extension-image` | 8KB | Image support | ✅ Yes |
| `@tiptap/extension-link` | 5KB | Hyperlinks | ✅ Yes |
| `@tiptap/extension-highlight` | 3KB | Text highlighting | ⭐ Recommended |
| `@tiptap/extension-underline` | 2KB | Underline text | ⭐ Recommended |
| `@tiptap/extension-subscript` | 2KB | Subscript (H₂O) | ✅ Yes (chemistry) |
| `@tiptap/extension-superscript` | 2KB | Superscript (10²) | ✅ Yes (science) |
| `@tiptap/extension-task-list` | 5KB | Checklists | ⭐ Recommended |
| `@tiptap/extension-emoji` | 3KB | Emoji picker | ⚪ Optional |
| `@tiptap/extension-file-handler` | 5KB | Drag & drop files | ⭐ Recommended |
| `@tiptap/extension-drag-handle` | 4KB | Reorder blocks | ⭐ Recommended |
| `@tiptap/extension-details` | 3KB | Collapsible sections | ⭐ Recommended |
| `@tiptap/extension-table-of-contents` | 5KB | Auto TOC | ⚪ Optional |
| `@tiptap/extension-placeholder` | 2KB | Hint text | ✅ Yes |
| `@tiptap/extension-character-count` | 2KB | Word counter | ⚪ Optional |
| **TOTAL (Recommended)** | **~350KB** | All essential features | - |
| **TOTAL (Full Featured)** | **~650KB** | Everything included | - |

---

### Bundle Size Comparison

| Editor | Bundle Size (gzipped) | Notes |
|--------|----------------------|-------|
| **TipTap (Minimal)** | ~50KB | Core + starter-kit only |
| **TipTap (Lab Notes)** | ~350KB | All essential features |
| **TipTap (Full)** | ~650KB | Everything + collaboration |
| BlockSuite | ~2,000KB | Heavy, overkill |
| ProseMirror Raw | ~100KB | Too low-level |
| Quill | ~200KB | Limited extensibility |
| Draft.js | ~300KB | Deprecated |

**Winner**: TipTap offers the best balance of features and size.

---

### Code Splitting Optimization

To reduce initial bundle size, lazy-load heavy extensions:

```typescript
// components/lab-note-editor/lazy-extensions.ts
import { lazy } from 'react'

// Load heavy extensions only when needed
export const Mathematics = lazy(() => 
  import('@tiptap/extension-mathematics').then(m => ({ default: m.Mathematics }))
)

export const CodeBlockLowlight = lazy(() =>
  import('@tiptap/extension-code-block-lowlight').then(m => ({ 
    default: m.CodeBlockLowlight 
  }))
)

export const Collaboration = lazy(() =>
  import('@tiptap/extension-collaboration').then(m => ({ 
    default: m.Collaboration 
  }))
)

// Usage in editor setup
const editor = useEditor({
  extensions: [
    StarterKit,
    // Load math only when user needs it
    ...(needsMath ? [Mathematics] : []),
    // Load collaboration only in multi-user mode
    ...(isCollaborative ? [Collaboration] : []),
  ]
})
```

This reduces initial load from ~650KB to ~150KB, loading other features on-demand.

---

### Minimal Lab Notes Installation

For the **fastest** lab notes editor with all essentials:

```bash
# Step 1: Core editor (50KB)
pnpm add @tiptap/react @tiptap/starter-kit

# Step 2: Scientific essentials (85KB)
pnpm add @tiptap/extension-table @tiptap/extension-table-row \
         @tiptap/extension-table-cell @tiptap/extension-table-header \
         @tiptap/extension-mathematics katex \
         @tiptap/extension-subscript @tiptap/extension-superscript

# Step 3: Enhanced text (15KB)
pnpm add @tiptap/extension-underline @tiptap/extension-highlight \
         @tiptap/extension-text-align

# Step 4: Media & tasks (18KB)
pnpm add @tiptap/extension-image @tiptap/extension-link \
         @tiptap/extension-task-list @tiptap/extension-task-item

# Step 5: Recently free extensions (30KB)
pnpm add @tiptap/extension-details @tiptap/extension-details-content \
         @tiptap/extension-details-summary @tiptap/extension-file-handler

# Total: ~200KB gzipped
```

**Result**: Production-ready lab notes editor in 200KB (vs 2MB BlockSuite)

---

### package.json Example

```json
{
  "dependencies": {
    "@tiptap/react": "^2.10.0",
    "@tiptap/core": "^2.10.0",
    "@tiptap/starter-kit": "^2.10.0",
    "@tiptap/extension-table": "^2.10.0",
    "@tiptap/extension-table-row": "^2.10.0",
    "@tiptap/extension-table-cell": "^2.10.0",
    "@tiptap/extension-table-header": "^2.10.0",
    "@tiptap/extension-mathematics": "^2.10.0",
    "@tiptap/extension-image": "^2.10.0",
    "@tiptap/extension-link": "^2.10.0",
    "@tiptap/extension-underline": "^2.10.0",
    "@tiptap/extension-subscript": "^2.10.0",
    "@tiptap/extension-superscript": "^2.10.0",
    "@tiptap/extension-highlight": "^2.10.0",
    "@tiptap/extension-text-align": "^2.10.0",
    "@tiptap/extension-task-list": "^2.10.0",
    "@tiptap/extension-task-item": "^2.10.0",
    "@tiptap/extension-placeholder": "^2.10.0",
    "@tiptap/extension-character-count": "^2.10.0",
    "@tiptap/extension-code-block-lowlight": "^2.10.0",
    "@tiptap/extension-collaboration": "^2.10.0",
    "@tiptap/extension-collaboration-cursor": "^2.10.0",
    "@tiptap/extension-bubble-menu": "^2.10.0",
    "@tiptap/extension-floating-menu": "^2.10.0",
    "@tiptap/extension-details": "^2.10.0",
    "@tiptap/extension-details-content": "^2.10.0",
    "@tiptap/extension-details-summary": "^2.10.0",
    "@tiptap/extension-emoji": "^2.10.0",
    "@tiptap/extension-drag-handle": "^2.10.0",
    "@tiptap/extension-file-handler": "^2.10.0",
    "@tiptap/extension-table-of-contents": "^2.10.0",
    "katex": "^0.16.9",
    "lowlight": "^3.1.0",
    "yjs": "^13.6.10",
    "y-websocket": "^2.0.4",
    "openai": "^4.77.0"
  }
}
```

---

### TypeScript Types

```bash
# TypeScript definitions (usually included)
pnpm add -D @types/katex
```

All TipTap packages include TypeScript definitions by default.

---

## 🚀 Implementation Phases

### Phase 1: Core Editor (Week 1)
**Goal**: Basic functional editor

- Install TipTap and core extensions
- Create base `LabNotesEditor` component
- Implement toolbar with formatting buttons
- Add text formatting (bold, italic, underline)
- Add lists (bullet, numbered, task)
- Add undo/redo
- Responsive layout
- Save/load from Supabase

### Phase 2: Scientific Features (Week 2)
**Goal**: Lab-specific functionality

- Mathematics extension (LaTeX equations)
- Code blocks with syntax highlighting
- Tables with resize
- Subscript/superscript for formulas
- Highlight with multiple colors
- Image upload and display
- Link insertion

### Phase 3: AI Integration (Week 3)
**Goal**: Smart assistance

- OpenAI API integration
- Auto-complete for chemical formulas
- Smart suggestions for units
- Citation formatting
- Summary generation
- Template recommendations

### Phase 4: Polish & Advanced (Week 4)
**Goal**: Production-ready

- Mobile gesture support
- Keyboard shortcuts guide
- Export to PDF/Word
- Version history
- Performance optimization
- Final testing

---

## 📱 Mobile Optimization

### Touch Gestures

| Gesture | Action |
|---------|--------|
| **Tap** | Place cursor |
| **Double-tap** | Select word |
| **Triple-tap** | Select paragraph |
| **Long-press** | Context menu |
| **Two-finger tap** | Toggle toolbar |
| **Swipe left** | Indent |
| **Swipe right** | Outdent |

---

## 💾 Data Persistence & Database Strategy

### Current Database Schema

The `lab_notes` table is already configured in Supabase with the following structure:

```sql
CREATE TABLE lab_notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experiment_id   UUID REFERENCES experiments(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT,                    -- Legacy HTML/text content
  note_type       TEXT CHECK (note_type IN ('observation', 'analysis', 'conclusion', 'general')),
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  editor_data     JSONB,                   -- TipTap JSON format
  editor_version  TEXT DEFAULT '1.0.0',
  last_edited_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lab_notes_experiment ON lab_notes(experiment_id);
CREATE INDEX idx_lab_notes_project ON lab_notes(project_id);
CREATE INDEX idx_lab_notes_editor_data ON lab_notes USING GIN (editor_data);
```

### Row Level Security (RLS) Policies

Already configured and production-ready:

```sql
-- Users can view notes in their projects/experiments
CREATE POLICY "Users can view lab notes in their projects/experiments"
  ON lab_notes FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members WHERE user_id = auth.uid()
    ) OR
    experiment_id IN (
      SELECT e.id FROM experiments e
      JOIN project_members pm ON e.project_id = pm.project_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Users can create their own lab notes
CREATE POLICY "Users can create lab notes"
  ON lab_notes FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can update their own lab notes
CREATE POLICY "Users can update their own lab notes"
  ON lab_notes FOR UPDATE
  USING (created_by = auth.uid());
```

### Data Storage Format

#### TipTap JSON Storage (`editor_data` column)

```typescript
interface LabNoteContent {
  // TipTap's native JSON format (stored in editor_data JSONB column)
  json: {
    type: 'doc',
    content: Array<{
      type: string;
      attrs?: Record<string, any>;
      content?: any[];
      marks?: Array<{ type: string; attrs?: any }>;
    }>
  };
  
  // Metadata
  version: string;           // Editor version (stored in editor_version)
  lastEditedAt: Date;        // Auto-updated (last_edited_at column)
}
```

#### Example TipTap JSON Structure

```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Experiment Observations" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Sample " },
        { "type": "text", "marks": [{"type": "bold"}], "text": "ABC-123" },
        { "type": "text", "text": " showed positive reaction with " },
        { "type": "text", "marks": [{"type": "code"}], "text": "H₂SO₄" }
      ]
    },
    {
      "type": "table",
      "content": [
        {
          "type": "tableRow",
          "content": [
            {
              "type": "tableHeader",
              "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Time" }] }]
            },
            {
              "type": "tableHeader",
              "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Temperature (°C)" }] }]
            }
          ]
        },
        {
          "type": "tableRow",
          "content": [
            {
              "type": "tableCell",
              "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "0 min" }] }]
            },
            {
              "type": "tableCell",
              "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "25.4" }] }]
            }
          ]
        }
      ]
    },
    {
      "type": "codeBlock",
      "attrs": { "language": "python" },
      "content": [
        { "type": "text", "text": "# Analysis script\nimport numpy as np\nresult = np.mean([25.4, 26.1, 25.8])" }
      ]
    }
  ]
}
```

### Auto-Save Implementation

```typescript
// hooks/use-auto-save.ts
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { debounce } from 'lodash'

export function useAutoSave({
  noteId,
  experimentId,
  debounceMs = 2000,
}: {
  noteId?: string
  experimentId: string
  debounceMs?: number
}) {
  const { toast } = useToast()
  const supabase = createClient()
  const saveTimeoutRef = useRef<NodeJS.Timeout>()

  const saveToDatabase = async (editorJSON: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const noteData = {
        editor_data: editorJSON,
        editor_version: '2.0.0',
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (noteId) {
        // Update existing note
        const { error } = await supabase
          .from('lab_notes')
          .update(noteData)
          .eq('id', noteId)
          .eq('created_by', user.id) // Security: only update own notes

        if (error) throw error
        
        toast({
          title: 'Saved',
          duration: 1000,
        })
      } else {
        // Create new note (will be handled by parent component)
        return { needsCreation: true, data: noteData }
      }
    } catch (error: any) {
      console.error('Auto-save error:', error)
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const debouncedSave = useRef(
    debounce(saveToDatabase, debounceMs)
  ).current

  const save = (editorJSON: any) => {
    debouncedSave(editorJSON)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel()
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [debouncedSave])

  return { save, saveNow: saveToDatabase }
}
```

### Data Migration Strategy

For existing notes with `content` (HTML/text):

```typescript
// Migration function to convert old content to TipTap JSON
async function migrateOldContent(noteId: string) {
  const supabase = createClient()
  
  const { data: note } = await supabase
    .from('lab_notes')
    .select('content')
    .eq('id', noteId)
    .single()

  if (note?.content && !note.editor_data) {
    // Convert HTML to TipTap JSON
    const editor = new Editor({
      extensions: [/* your extensions */],
      content: note.content, // TipTap can parse HTML
    })

    const editorJSON = editor.getJSON()

    // Save to editor_data
    await supabase
      .from('lab_notes')
      .update({
        editor_data: editorJSON,
        editor_version: '2.0.0',
      })
      .eq('id', noteId)

    editor.destroy()
  }
}
```

### Search & Full-Text Capabilities

The `editor_data` JSONB column has a GIN index for efficient searching:

```sql
-- Search within editor content
SELECT * FROM lab_notes
WHERE editor_data @> '{"content": [{"type": "text", "text": "search term"}]}'::jsonb;

-- Search using containment
SELECT * FROM lab_notes
WHERE editor_data::text ILIKE '%search term%';

-- Full-text search (recommended for production)
ALTER TABLE lab_notes ADD COLUMN content_search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(title, '') || ' ' || 
      COALESCE(editor_data::text, '')
    )
  ) STORED;

CREATE INDEX idx_lab_notes_search ON lab_notes USING GIN (content_search_vector);

-- Search query
SELECT * FROM lab_notes
WHERE content_search_vector @@ to_tsquery('english', 'reaction & temperature');
```

### Backup & Export Strategy

```typescript
// Export note to various formats
export async function exportLabNote(noteId: string, format: 'json' | 'html' | 'markdown' | 'pdf') {
  const supabase = createClient()
  
  const { data: note } = await supabase
    .from('lab_notes')
    .select('*')
    .eq('id', noteId)
    .single()

  if (!note) throw new Error('Note not found')

  // Initialize editor with note data
  const editor = new Editor({
    extensions: [/* your extensions */],
    content: note.editor_data,
  })

  let exportedContent: string

  switch (format) {
    case 'json':
      exportedContent = JSON.stringify(editor.getJSON(), null, 2)
      break
    case 'html':
      exportedContent = editor.getHTML()
      break
    case 'markdown':
      // Requires @tiptap/extension-markdown
      exportedContent = editor.storage.markdown.getMarkdown()
      break
    case 'pdf':
      // Use html-to-pdf library
      const html = editor.getHTML()
      exportedContent = await generatePDF(html, {
        title: note.title,
        author: note.created_by,
        date: note.created_at,
      })
      break
  }

  editor.destroy()
  return exportedContent
}
```

### Version Control & History

```sql
-- Create version history table for lab notes
CREATE TABLE lab_notes_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id         UUID NOT NULL REFERENCES lab_notes(id) ON DELETE CASCADE,
  editor_data     JSONB NOT NULL,
  editor_version  TEXT NOT NULL,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary  TEXT
);

CREATE INDEX idx_lab_notes_versions_note ON lab_notes_versions(note_id, created_at DESC);

-- Trigger to save version on major changes
CREATE OR REPLACE FUNCTION save_lab_note_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Save version every 5 minutes or on major changes
  IF (
    NEW.editor_data IS DISTINCT FROM OLD.editor_data AND
    (OLD.last_edited_at IS NULL OR 
     NOW() - OLD.last_edited_at > INTERVAL '5 minutes')
  ) THEN
    INSERT INTO lab_notes_versions (note_id, editor_data, editor_version, created_by)
    VALUES (OLD.id, OLD.editor_data, OLD.editor_version, OLD.created_by);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER save_version_on_lab_note_update
  BEFORE UPDATE ON lab_notes
  FOR EACH ROW
  EXECUTE FUNCTION save_lab_note_version();
```

### Performance Optimization

```typescript
// Lazy loading for large notes
export function useLazyLoadNote(noteId: string) {
  const [isLoading, setIsLoading] = useState(true)
  const [editorData, setEditorData] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    async function loadNote() {
      // Only load editor_data when needed
      const { data, error } = await supabase
        .from('lab_notes')
        .select('id, title, editor_data, editor_version')
        .eq('id', noteId)
        .single()

      if (!error && data) {
        setEditorData(data.editor_data)
      }
      setIsLoading(false)
    }

    loadNote()
  }, [noteId])

  return { editorData, isLoading }
}

// Pagination for note lists
export async function getLabNotes(experimentId: string, page = 1, limit = 10) {
  const supabase = createClient()
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Don't load editor_data in list view (save bandwidth)
  const { data, error, count } = await supabase
    .from('lab_notes')
    .select('id, title, note_type, created_at, updated_at', { count: 'exact' })
    .eq('experiment_id', experimentId)
    .order('created_at', { ascending: false })
    .range(from, to)

  return { data, count, error }
}
```

### Data Security Best Practices

1. **RLS Enforcement**: All queries use RLS policies (already configured)
2. **JSON Validation**: Validate editor_data structure before save
3. **Size Limits**: Limit note size to prevent abuse
4. **Sanitization**: TipTap sanitizes HTML by default
5. **Audit Trail**: Track all changes via `lab_notes_versions`

```typescript
// Validation before save
const MAX_NOTE_SIZE = 5 * 1024 * 1024 // 5MB

function validateEditorData(data: any): boolean {
  const jsonString = JSON.stringify(data)
  
  if (jsonString.length > MAX_NOTE_SIZE) {
    throw new Error('Note exceeds maximum size (5MB)')
  }
  
  if (!data.type || data.type !== 'doc') {
    throw new Error('Invalid editor data format')
  }
  
  return true
}
```

### Offline Support (Progressive Web App)

```typescript
// Use IndexedDB for offline editing
import { openDB } from 'idb'

const DB_NAME = 'notes9-offline'
const STORE_NAME = 'pending-saves'

async function saveToPendingQueue(noteId: string, editorData: any) {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'noteId' })
    },
  })

  await db.put(STORE_NAME, {
    noteId,
    editorData,
    timestamp: Date.now(),
  })
}

async function syncPendingSaves() {
  const db = await openDB(DB_NAME, 1)
  const pending = await db.getAll(STORE_NAME)

  for (const item of pending) {
    try {
      await saveToDatabase(item.noteId, item.editorData)
      await db.delete(STORE_NAME, item.noteId)
    } catch (error) {
      console.error('Sync failed for', item.noteId, error)
    }
  }
}

// Sync when back online
window.addEventListener('online', syncPendingSaves)
```

---

## 📊 MVP Database Requirements Summary

### ✅ Already Configured (Production-Ready)

1. **Table Structure**: `lab_notes` table with all required columns
2. **RLS Policies**: SELECT, INSERT, UPDATE policies configured
3. **Indexes**: Performance indexes on experiment_id, project_id, editor_data
4. **Foreign Keys**: Proper relationships with experiments, projects, profiles
5. **Triggers**: Auto-update timestamps on changes

### 🆕 Recommended Additions for MVP

```sql
-- 1. Add full-text search capability
ALTER TABLE lab_notes ADD COLUMN content_search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', 
      COALESCE(title, '') || ' ' || 
      COALESCE(editor_data::text, '')
    )
  ) STORED;

CREATE INDEX idx_lab_notes_search ON lab_notes USING GIN (content_search_vector);

-- 2. Add version history table (optional for MVP, recommended for production)
CREATE TABLE lab_notes_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id         UUID NOT NULL REFERENCES lab_notes(id) ON DELETE CASCADE,
  editor_data     JSONB NOT NULL,
  editor_version  TEXT NOT NULL,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary  TEXT
);

CREATE INDEX idx_lab_notes_versions_note ON lab_notes_versions(note_id, created_at DESC);

-- 3. Add RLS for version history
ALTER TABLE lab_notes_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view versions of their notes"
  ON lab_notes_versions FOR SELECT
  USING (
    note_id IN (
      SELECT id FROM lab_notes WHERE created_by = auth.uid()
    )
  );
```

### Storage Estimates (MVP Scale)

Based on typical lab notes:

| Item | Size | Notes |
|------|------|-------|
| Average note (text only) | ~10 KB | 500 words, basic formatting |
| Average note (with images) | ~500 KB | 2-3 small images |
| Large note (complex) | ~2 MB | Multiple images, tables, equations |
| **MVP Target** | **100 notes/user** | ~50 MB/user average |
| **Expected Load** | **100 users** | ~5 GB total storage |

Supabase Free Tier: **500 MB database + 1 GB file storage** - sufficient for MVP

### Monitoring Queries

```sql
-- Check total storage usage
SELECT 
  pg_size_pretty(pg_database_size('postgres')) as total_size,
  pg_size_pretty(pg_total_relation_size('lab_notes')) as lab_notes_size;

-- Check note counts and sizes
SELECT 
  COUNT(*) as total_notes,
  AVG(octet_length(editor_data::text)) as avg_size_bytes,
  MAX(octet_length(editor_data::text)) as max_size_bytes,
  pg_size_pretty(SUM(octet_length(editor_data::text))::bigint) as total_content_size
FROM lab_notes;

-- Check notes per user
SELECT 
  created_by,
  COUNT(*) as note_count,
  pg_size_pretty(SUM(octet_length(editor_data::text))::bigint) as user_storage
FROM lab_notes
GROUP BY created_by
ORDER BY COUNT(*) DESC
LIMIT 10;
```

---

## 🎯 Success Metrics

- ✅ Editor loads in < 1 second
- ✅ Zero TypeScript errors
- ✅ All extensions functional
- ✅ Mobile responsive (tested on 3+ devices)
- ✅ Auto-save working reliably
- ✅ User satisfaction > 4/5 stars

---

## 📞 Resources

- **TipTap Docs**: https://tiptap.dev/docs
- **Examples**: https://tiptap.dev/examples
- **Community**: https://github.com/ueberdosis/tiptap/discussions

---

**Status**: Ready for Implementation  
**Timeline**: 4 weeks to full production  
**Risk**: Low - proven technology  
**ROI**: High - better UX, easier maintenance

---

*Document Version: 1.0*  
*Last Updated: November 20, 2025*