# 📝 BlockSuite Integration Strategy for Notes9

## Executive Summary

This document outlines the production-ready strategy to integrate BlockSuite v0.22.4 into Notes9 for lab notes functionality.

## Problem Analysis

### Issue: BlockSuite npm packages are incompatible with Next.js 16 Turbopack

**Root Causes:**
1. BlockSuite ships TypeScript source files (.ts) instead of compiled JavaScript
2. Empty/incomplete index.ts barrel files cause "The module has no exports" errors
3. Turbopack's strict module resolution fails on broken export paths

**Evidence:**
```bash
Export Container doesn't exist in target module
./node_modules/@blocksuite/global/src/di/index.ts
The module has no exports at all.
```

## Production-Ready Solution

### Option 1: Build BlockSuite from Source (RECOMMENDED ✅)

Since you have the BlockSuite monorepo locally at `/Users/nithin/Developer/Apps/fills/blocksuite`, we can:

1. **Build BlockSuite packages locally**
2. **Use pnpm workspace protocol** to link the local packages
3. **Avoid npm registry issues completely**

**Advantages:**
- ✅ Full control over the build process
- ✅ Latest code from source
- ✅ Proper TypeScript compilation
- ✅ Works with both Turbopack and Webpack
- ✅ No external dependencies on broken npm packages

**Implementation Steps:**

```bash
# Step 1: Build BlockSuite
cd /Users/nithin/Developer/Apps/fills/blocksuite
yarn install
yarn build

# Step 2: Link to notes9-prototype via pnpm workspace
# (See Implementation Plan below)
```

### Option 2: Use Web Components (Alternative)

BlockSuite provides Web Components that can be used in any framework:

```html
<!-- Direct Web Component usage -->
<blocksuite-editor></blocksuite-editor>
```

**Advantages:**
- ✅ Framework agnostic
- ✅ No build pipeline issues
- ✅ Works in any environment

**Disadvantages:**
- ❌ Less React integration
- ❌ Harder to customize
- ❌ Limited TypeScript support

## Implementation Plan: Build from Source

### Phase 1: Build BlockSuite Locally

```bash
cd /Users/nithin/Developer/Apps/fills/blocksuite

# Install dependencies
yarn install

# Build all packages
yarn build

# This compiles TypeScript to JavaScript in dist/ folders
# Creates proper export maps
# Generates type definitions
```

### Phase 2: Integrate with notes9-prototype

**A. Using pnpm link (Development):**

```json
// notes9-prototype/package.json
{
  "dependencies": {
    "@blocksuite/affine": "link:../blocksuite/packages/affine/all",
    "@blocksuite/store": "link:../blocksuite/packages/framework/store",
    "@blocksuite/std": "link:../blocksuite/packages/framework/std"
  }
}
```

**B. Using pnpm workspace (Recommended):**

Create a workspace root:
```json
// fills/pnpm-workspace.yaml
packages:
  - 'blocksuite/packages/**'
  - 'notes9-prototype'
  - 'notes9-landing-page'
```

Then reference:
```json
// notes9-prototype/package.json
{
  "dependencies": {
    "@blocksuite/affine": "workspace:*",
    "@blocksuite/store": "workspace:*"
  }
}
```

### Phase 3: Create BlockSuite Editor Component

```typescript
// components/text-editor/blocksuite-editor.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Schema, DocCollection } from '@blocksuite/store'
import { AffineSchemas } from '@blocksuite/affine/schemas'
import { AffineEditorContainer } from '@blocksuite/affine/blocks/root'

interface BlockSuiteEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  placeholder?: string
  className?: string
}

export function BlockSuiteEditor({
  initialContent,
  onChange,
  placeholder,
  className
}: BlockSuiteEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [collection, setCollection] = useState<DocCollection | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    // Initialize BlockSuite
    const schema = new Schema()
    schema.register(AffineSchemas)

    const collection = new DocCollection({ schema })
    const doc = collection.createDoc({ id: 'doc1' })
    doc.load(() => {
      // Initialize with content
      const pageBlock = doc.addBlock('affine:page', {})
      doc.addBlock('affine:surface', {}, pageBlock)
      const noteBlock = doc.addBlock('affine:note', {}, pageBlock)
      doc.addBlock('affine:paragraph', {
        text: initialContent || ''
      }, noteBlock)
    })

    // Mount editor
    const editor = new AffineEditorContainer()
    editor.doc = doc
    editorRef.current.appendChild(editor)

    // Listen for changes
    doc.collection.doc.on('update', () => {
      const markdown = doc.toMarkdown()
      onChange?.(markdown)
    })

    setCollection(collection)

    return () => {
      collection.remove()
      editor.remove()
    }
  }, [])

  return <div ref={editorRef} className={className} />
}
```

### Phase 4: Replace AffineBlock Component

```bash
# Replace the fake AffineBlock with real BlockSuite
cp components/text-editor/affine-block.tsx components/text-editor/affine-block.tsx.backup
# Implement new BlockSuiteEditor
```

## API Surface Analysis

Based on [BlockSuite API Documentation](https://blocksuite.io/api/), here are the key APIs we'll use:

### Core APIs

1. **@blocksuite/store** - Data management
   ```typescript
   import { DocCollection, Schema } from '@blocksuite/store'
   
   const schema = new Schema()
   const collection = new DocCollection({ schema })
   const doc = collection.createDoc()
   ```

2. **@blocksuite/std** - Standard blocks & utilities
   ```typescript
   import { BlockStdScope } from '@blocksuite/std'
   ```

3. **@blocksuite/affine** - Complete editor with all blocks
   ```typescript
   import { AffineSchemas } from '@blocksuite/affine/schemas'
   import { AffineEditorContainer } from '@blocksuite/affine/blocks/root'
   ```

### Block Types Available

- **Text Blocks**: paragraph, heading, code, list
- **Media Blocks**: image, attachment, embed
- **Layout Blocks**: divider, callout, table
- **Rich Blocks**: database, latex, bookmark
- **Canvas Blocks**: surface, frame (for whiteboard features)

### Data Flow

```typescript
// Save to Supabase
const markdown = doc.toMarkdown()
const json = doc.toJSON()

// Load from Supabase
doc.fromMarkdown(savedMarkdown)
doc.fromJSON(savedJSON)
```

## Configuration for Next.js 16

### next.config.mjs

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable Turbopack for BlockSuite compatibility
  // Can be re-enabled after Next.js 16 stabilizes
  experimental: {
    turbo: false
  },

  // Transpile BlockSuite packages
  transpilePackages: [
    '@blocksuite/affine',
    '@blocksuite/store',
    '@blocksuite/std',
    '@blocksuite/global',
    '@blocksuite/sync'
  ],

  // Webpack config for BlockSuite
  webpack: (config) => {
    // Handle TypeScript files in node_modules
    config.module.rules.push({
      test: /\.ts$/,
      include: /node_modules\/@blocksuite/,
      use: [{
        loader: 'ts-loader',
        options: {
          transpileOnly: true
        }
      }]
    })

    return config
  }
}

export default nextConfig
```

## Testing Strategy

### 1. Local Development Testing

```bash
# Terminal 1: Run BlockSuite playground to verify build
cd /Users/nithin/Developer/Apps/fills/blocksuite
yarn dev

# Terminal 2: Run notes9-prototype
cd /Users/nithin/Developer/Apps/fills/notes9-prototype
pnpm dev --no-turbopack
```

### 2. Editor Feature Testing

Test these core features:
- [ ] Create new lab note with BlockSuite
- [ ] Save content to Supabase
- [ ] Load existing notes
- [ ] Rich text formatting (bold, italic, lists)
- [ ] Code blocks for protocols
- [ ] Images for experimental results
- [ ] Tables for data

### 3. Performance Testing

Monitor:
- Time to First Render (should be < 1s)
- Time to Interactive (should be < 2s)
- Bundle size impact
- Memory usage with multiple notes

## Migration Path

### Phase 1: Parallel Implementation (Week 1)
- Keep existing AffineBlock component
- Build BlockSuite locally
- Create new BlockSuiteEditor component
- Test in isolated page

### Phase 2: Feature Parity (Week 2)
- Implement all toolbar features
- Add Supabase persistence
- Handle image uploads
- Content import/export

### Phase 3: Replacement (Week 3)
- Replace AffineBlock with BlockSuiteEditor
- Migrate existing notes
- Remove old component
- Update documentation

### Phase 4: Enhancement (Week 4)
- Add collaboration features (CRDT sync)
- Real-time multi-user editing
- Version history
- Advanced blocks (LaTeX, diagrams)

## Dependencies

```json
{
  "dependencies": {
    "@blocksuite/affine": "workspace:*",
    "@blocksuite/store": "workspace:*",
    "@blocksuite/std": "workspace:*",
    "@blocksuite/global": "workspace:*",
    "@blocksuite/sync": "workspace:*",
    "yjs": "^13.6.21",
    "rxjs": "^7.8.1",
    "nanoid": "^5.0.7",
    "lit": "^3.1.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "5.8.2"
  }
}
```

## Rollback Plan

If BlockSuite integration fails:

1. **Immediate Rollback**: Restore `affine-block.tsx.backup`
2. **Alternative**: Switch to TipTap (production-ready React editor)
   ```bash
   pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-image
   ```
3. **Fallback**: Keep contentEditable wrapper with enhanced features

## Success Metrics

- ✅ Editor loads in < 1 second
- ✅ No TypeScript errors
- ✅ No runtime errors in browser console
- ✅ All toolbar features functional
- ✅ Content persists to/from Supabase
- ✅ Works with `pnpm dev` (no Turbopack)
- ✅ Production build succeeds
- ✅ Mobile responsive

## Next Steps

1. **Execute**: Build BlockSuite from source
2. **Integrate**: Link packages to notes9-prototype
3. **Implement**: Create BlockSuiteEditor component
4. **Test**: Verify all features work
5. **Deploy**: Production deployment with Vercel

## Resources

- BlockSuite API: https://blocksuite.io/api/
- BlockSuite GitHub: https://github.com/toeverything/blocksuite
- BlockSuite Playground: https://try-blocksuite.vercel.app
- Building Guide: `/Users/nithin/Developer/Apps/fills/blocksuite/BUILDING.md`
- Local Source: `/Users/nithin/Developer/Apps/fills/blocksuite`

---

**Status**: Ready for Implementation  
**Risk Level**: Medium (requires source build)  
**Effort**: 2-3 days for full integration  
**Maintainability**: High (direct source access)

