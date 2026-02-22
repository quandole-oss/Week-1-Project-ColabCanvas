# AI Development Log — Collaborative Canvas

## Project Overview

**App**: Real-time collaborative whiteboard with AI-powered canvas manipulation
**Stack**: React 19 + TypeScript + Fabric.js 7 + Firebase + Anthropic Claude API
**Live**: https://colabcanvas-592e5.web.app

---

## AI Tools Used in Development

| Tool | Role | Usage |
|---|---|---|
| **Claude Code (CLI)** | Primary development agent | Architecture design, code generation, debugging, deployment |
| **Cursor IDE** | AI-assisted editing | Code completion, inline edits |

## AI Tools Used in the Product

| Tool | Role | Model | Cost Tier |
|---|---|---|---|
| **Anthropic Claude Haiku** | Simple AI commands (shapes, colors, text) | claude-haiku-4-5 | ~$0.80/M input tokens |
| **Anthropic Claude Sonnet** | Complex compositions (animals, scenes, UI components) | claude-sonnet-4-5 | ~$3/M input tokens |
| **Local NLP Parser** | Offline fallback for simple regex-matchable commands | N/A (regex) | Free |

---

## Development Approach

### Phase 1: Core Canvas + Real-Time Sync
- Built the Fabric.js canvas with drawing tools, selection, and undo/redo
- Implemented dual-mode sync (Firebase for production, BroadcastChannel for demo)
- Established the hooks-per-domain architecture: `useRealtimeSync`, `useCursorSync`, `usePresence`

### Phase 2: AI Integration
- Started with a local regex NLP parser for zero-latency, zero-cost simple commands
- Added direct Anthropic API calls via Vite dev proxy for development
- Built Cloud Function AI proxy for production (Firestore document trigger pattern)
- Implemented 2-tier complexity routing: Haiku for simple, Sonnet+thinking for complex
- Added progressive rendering: shapes appear on canvas as the AI streams tool calls

### Phase 3: Polish + Advanced Features
- 10 built-in templates (SWOT, flowchart, kanban, etc.)
- Classification/tagging system with filter view
- Semantic AI operations (cluster, categorize, summarize sticky notes)
- Copy/paste, layer management, keyboard shortcuts

---

## Prompting Strategies

### System Prompt Design (for Claude in the product)
- **Tool-use pattern**: Claude receives a set of canvas manipulation tools (`createShape`, `moveObject`, `updateObject`, etc.) and responds with function calls — no free-form text generation needed on the canvas
- **Composition guidance**: System prompt includes detailed instructions for composing complex objects (e.g., "build a smiley face from circles and arcs") with spatial positioning rules
- **Context injection**: Each AI request includes a sanitized summary of existing canvas objects + viewport center coordinates, so Claude can position new objects relative to existing ones
- **Semantic operations**: Added clustering/categorization instructions so Claude can read sticky note text and group them by theme

### Complexity Routing
- Regex classifier detects composition nouns (dog, house, person) and semantic operations (cluster, categorize) → routes to Sonnet with extended thinking
- Everything else → routes to Haiku for speed
- Trade-off: regex heuristic occasionally misroutes edge cases, but 90%+ accuracy is acceptable for the UX improvement (sub-second Haiku responses vs. 3-5s Sonnet)

---

## What Worked Well

1. **Tool-use over free-text**: Having Claude return structured function calls instead of generating code or text made the integration deterministic and easy to validate
2. **Progressive rendering**: Writing `partialFunctionCalls` to Firestore as they stream in gives users immediate visual feedback — shapes appear one by one while the AI is still thinking
3. **Three-tier fallback**: Local parser (instant) → direct API (dev) → Cloud Function (production) means the app always works, regardless of environment
4. **Haiku/Sonnet split**: Simple commands resolve in <1 second via Haiku. Complex compositions get the quality of Sonnet with extended thinking. Users perceive the system as both fast and capable
5. **AI-assisted development with Claude Code**: Architecture decisions, debugging, and rapid iteration were significantly accelerated

## What Didn't Work / Lessons Learned

1. **Initial OpenAI integration was replaced**: Started with GPT-4 but switched to Anthropic Claude for better tool-use reliability and cost efficiency
2. **Canvas.tsx grew too large**: AI-assisted development made it easy to keep adding features to one file. At ~2300 lines, it became hard to reason about. Lesson: even with AI help, decomposition discipline matters
3. **Regex complexity classifier is fragile**: "Make the circle bigger" goes to Haiku (correct), but "create a big circle with a face" sometimes goes to Haiku too (wrong — needs composition). Acceptable but not ideal
4. **Cold starts on Cloud Functions**: First AI request after inactivity takes 2-5s extra. Progressive rendering mitigates this but doesn't eliminate the wait
5. **Demo mode diverges from Firebase mode**: BroadcastChannel can't simulate real network latency or conflict resolution. Some bugs only appeared in production

---

## Key Metrics

| Metric | Value |
|---|---|
| Total AI tool definitions | 11 (createShape, moveObject, resizeObject, rotateObject, updateObject, deleteObject, arrangeObjects, createLoginForm, createNavigationBar, duplicateObject, reorderObject) |
| Built-in templates | 10 |
| AI response time (Haiku, simple) | <1 second |
| AI response time (Sonnet, complex) | 3-8 seconds |
| Cloud Function rate limit | 10 requests/min/user |
| Local NLP patterns | ~15 regex patterns for common commands |
