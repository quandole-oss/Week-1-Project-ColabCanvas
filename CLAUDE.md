# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

1. Think through the problem, read the codebase for relevant files, and write a plan to todo.md.
2. The plan should have a list of todo items that you can check off as you complete them.
3. Before beginning work, check in with the user to verify the plan.
4. Work through the todo items, marking them as complete. Give a high level explanation of what changed at each step.
5. Make every change as simple as possible. Avoid massive or complex changes. Every change should impact as little code as possible.
6. Add a review section to todo.md summarizing the changes made.

## Commands

```bash
# All commands run from collaborative-canvas/
npm run dev          # Start Vite dev server (hot reload)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)

# Firebase deployment
npx firebase deploy                    # Deploy everything (hosting, functions, rules)
npx firebase deploy --only hosting     # Deploy frontend only
npx firebase deploy --only functions   # Deploy Cloud Functions only

# Cloud Functions (in functions/)
cd functions && npm run build          # Compile TS to lib/
```

## Architecture

### Dual-mode real-time collaborative whiteboard

React 19 + TypeScript + Fabric.js 7 + Firebase. Two runtime modes controlled by `isFirebaseConfigured` flag in `src/services/firebase.ts`:

- **Firebase mode**: Firestore for canvas objects, RTDB for cursors/presence, Firebase Auth
- **Demo mode**: BroadcastChannel for cross-tab sync, local demo user (no backend needed)

### Data flow: Room.tsx is the orchestrator

`Room.tsx` wires together four hooks that each own one real-time domain:

| Hook | Service | Backend | Purpose |
|------|---------|---------|---------|
| `useRealtimeSync` | `canvasSync.ts` | Firestore | Canvas object CRUD with optimistic updates |
| `useCursorSync` | `cursorSync.ts` | RTDB | Cursor position broadcasting (50ms throttle) |
| `usePresence` | `presenceSync.ts` | RTDB | Online user tracking with onDisconnect |
| `useAIAgent` | `aiService.ts` + `geminiService.ts` | Anthropic API or Cloud Function | AI command processing |

Room passes callbacks from these hooks down to `Canvas.tsx` as props.

### Canvas.tsx (~1700 lines)

The largest file. Owns Fabric.js instance lifecycle, mouse-based drawing, selection highlighting, eraser tool, remote object sync, and undo/redo history. Uses `useCanvas` hook for zoom/pan/grid.

The undo/redo system uses a ref-based stack (max 50 entries) with four entry types: `create`, `delete`, `modify`, `batch`. AI operations are wrapped in `batch` entries so multiple shapes undo together.

### AI system: two tiers

1. **Direct Anthropic API** (dev only): When `VITE_ANTHROPIC_API_KEY` is set, calls Claude via Vite dev proxy (`/api/anthropic` -> `api.anthropic.com`). Uses Haiku for simple commands, Sonnet with extended thinking for complex compositions (animals, buildings, etc.).
2. **Firebase Cloud Function** (production): Frontend writes to `rooms/{roomId}/aiRequests/{docId}`, Cloud Function triggers on write, calls Claude API, writes results back. Frontend uses `onSnapshot` for progressive rendering of tool calls as they stream in.

Both tiers use the same tool schema (`createShape`, `moveObject`, `resizeObject`, `rotateObject`, `updateObject`, `deleteObject`, `arrangeObjects`, etc.) and `executeAIAction()` in `aiService.ts` to apply tool calls to the canvas.

There is also a local regex-based NLP parser in `aiService.ts` (`processLocalCommand`) used as the original fallback for simple commands.

### Firebase data split

- **Firestore**: `rooms/{roomId}` (room metadata + members), `rooms/{roomId}/objects/{objectId}` (canvas objects), `rooms/{roomId}/aiRequests/{docId}` (AI command pipeline)
- **RTDB**: `cursors/{roomId}/{userId}`, `presence/{roomId}/{userId}` — ephemeral, high-frequency data

### Conflict resolution

Last-write-wins via `setDoc({ merge: true })`. Optimistic local updates with echo prevention through `localPendingUpdates` ref. Object sync is debounced at 100ms.

## Environment Variables

Copy `.env.example` to `.env.local`. Firebase config uses `VITE_FIREBASE_*` prefix. Optional `VITE_ANTHROPIC_API_KEY` enables direct AI API calls in dev mode. Optional `VITE_RECAPTCHA_SITE_KEY` for App Check.

Cloud Function secrets (Anthropic API key) are managed via Firebase secrets, not env vars.

## Key Conventions

- Components: PascalCase, grouped by domain (`Auth/`, `Canvas/`, `Presence/`, `AI/`, `Layout/`)
- Hooks: `use` prefix, flat in `hooks/`
- Services: camelCase, flat in `services/`
- Constants: UPPER_SNAKE_CASE
- Each directory has `index.ts` barrel exports
- Tailwind CSS 4 for styling (no config file — uses `@tailwindcss/vite` plugin)
- Production builds strip `console.log` and `console.warn` via esbuild `pure` option in `vite.config.ts`
