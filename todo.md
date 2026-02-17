# Todo List - Collaborative Canvas

## Project Overview

A real-time collaborative design canvas with AI-powered creation capabilities. Multiple users can design together in real-time, seeing each other's cursors and changes instantly.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite
- Canvas: Fabric.js v7
- Backend: Firebase (Firestore, Realtime DB, Auth)
- AI: OpenAI GPT-4 (with local fallback)
- Styling: Tailwind CSS v4

---

## Phase 1: Project Foundation

### 1.1 Project Setup
- [x] Initialize Vite + React + TypeScript project
- [x] Install dependencies (fabric, firebase, tailwindcss, uuid)
- [x] Configure Firebase project (Auth, Firestore, Realtime DB)
- [x] Set up Tailwind CSS v4
- [x] Create basic app layout structure
- [x] Create environment variable template (.env.example)

### 1.2 Authentication
- [x] Implement Firebase Auth initialization
- [x] Add Google sign-in provider
- [x] Add Email/Password authentication
- [x] Create LoginForm component
- [x] Create useAuth hook for auth state management
- [x] Create UserAvatar component with color-coded indicators
- [x] Protect canvas routes (redirect if not logged in)

### 1.3 Routing & Layout
- [x] Set up React Router v7
- [x] Create Home page (room creation/joining)
- [x] Create Room page (main collaboration space)
- [x] Implement room URL sharing

---

## Phase 2: Canvas Implementation

### 2.1 Basic Canvas
- [x] Initialize Fabric.js canvas wrapper
- [x] Implement pan (spacebar + drag)
- [x] Implement zoom (scroll wheel)
- [x] Add zoom controls (in/out buttons, reset)
- [x] Set canvas size (infinite board with dynamic viewport grid)
- [x] Add grid background visual

### 2.2 Shape Tools
- [x] Create CanvasToolbar component
- [x] Implement rectangle tool
- [x] Implement circle tool
- [x] Implement line tool
- [x] Implement triangle tool
- [x] Implement hexagon tool
- [x] Implement star tool
- [x] Add selection/move tool
- [x] Add eraser tool

### 2.3 Shape Properties
- [x] Add fill color picker
- [x] Add stroke/outline color picker
- [x] Implement shape transformations (move, resize, rotate)
- [x] Add multi-select support (shift+click, drag box)

### 2.4 Canvas Utilities
- [x] Create useCanvas hook for state management
- [x] Implement undo/redo functionality
- [x] Generate unique IDs for objects (UUID)
- [x] Create object serialization utilities

---

## Phase 3: Real-Time Collaboration

### 3.1 Data Model (Firestore)
- [x] Design rooms collection structure
- [x] Design objects subcollection structure
- [x] Create TypeScript types for canvas objects
- [x] Write Firestore security rules

### 3.2 Cursor Synchronization
- [x] Create cursorSync service for Realtime Database
- [x] Create useCursorSync hook
- [x] Implement throttled cursor broadcasting (50ms)
- [x] Create CursorOverlay component for remote cursors
- [x] Display cursor labels with user names
- [x] Auto-remove stale cursors on disconnect

### 3.3 Presence System
- [x] Create presenceSync service
- [x] Create usePresence hook
- [x] Track online users via Realtime Database
- [x] Implement onDisconnect cleanup
- [x] Create OnlineUsers component (sidebar)
- [x] Display user avatars with colors

### 3.4 Object Synchronization
- [x] Create canvasSync service for Firestore
- [x] Create useRealtimeSync hook
- [x] Sync new objects to Firestore on creation
- [x] Detect object:modified events from Fabric.js
- [x] Debounce updates to reduce writes
- [x] Apply remote updates to local canvas
- [x] Implement conflict resolution (last-write-wins)

### 3.5 State Persistence
- [x] Load canvas state from Firestore on room join
- [x] Handle reconnection (re-fetch + merge)
- [x] Ensure objects persist when all users leave
- [x] Write database security rules (database.rules.json)

---

## Phase 4: AI Canvas Agent

### 4.1 AI Service Setup
- [x] Create aiService.ts with tool definitions
- [x] Define AI tool schemas (createShape, createText, moveObject, etc.)
- [x] Implement local command parser (fallback)
- [x] Support OpenAI GPT-4 integration (optional API key)

### 4.2 AI Commands - Creation
- [x] "Create a [color] rectangle at [x, y]"
- [x] "Create a [color] circle"
- [x] "Add text that says [text]"
- [x] "Create a [width]x[height] rectangle"

### 4.3 AI Commands - Manipulation
- [x] Move objects to positions
- [x] Resize objects
- [x] Rotate objects

### 4.4 AI Commands - Layout
- [x] "Create a [n]x[n] grid of squares"
- [x] "Arrange objects in a row"
- [x] "Space elements evenly"

### 4.5 AI Commands - Complex
- [x] "Create a login form" (generates username, password, submit)
- [x] "Create a navigation bar" (horizontal menu items)
- [x] "Create a card layout"

### 4.6 AI UI Components
- [x] Create AICommandInput component
- [x] Create useAIAgent hook
- [x] Show processing/thinking state
- [x] Display executed action feedback
- [x] Ensure AI-created objects sync to all users

---

## Phase 5: Bug Fixes & Polish

### 5.1 UI Improvements
- [x] Change "Stroke" label to "Outline" in toolbar
  - Updated CanvasToolbar.tsx - changed label text and tooltip

### 5.2 Canvas Constraints (Removed — Infinite Board)
- [x] ~~Add grid boundary constraints~~ → Removed in Phase 8 (Infinite Board)
  - Canvas is now unbounded — no pan constraints, no shape constraints
  - Grid is dynamic: only draws lines visible in the viewport
  - `constrainToGrid` and `constrainShapeToGrid` functions deleted

### 5.3 Undo/Redo Fixes
- [x] Fix undo button - each click-drag-release should be one undo action
  - Changed from `before:transform` event to `mouse:down` for capturing state
  - State is now captured when clicking on object, saved when releasing
  - Added Triangle and Polygon handling to undo restore

- [x] Fix undo for color changes
  - Added check to ensure object's color is actually changing (not just selection)
  - Prevents false history entries when selecting objects

### 5.4 Synchronization Fixes
- [x] Fix sync issues - shapes appearing differently across browser instances
  - Added `originX: 'left', originY: 'top'` to rect, circle, and triangle in `createFabricObject`
  - Fixed coordinate conversion from screen to canvas coordinates when saving shapes

- [x] Fix outline/stroke not syncing to remote users
  - Added default stroke color (`#3b82f6`) in `createFabricObject` when `props.stroke` is undefined
  - Added `strokeWidth` to `updateFabricObject` (was missing - only stroke was being updated)
  - Applied consistent defaults for stroke and strokeWidth across all shape types including lines

- [x] Fix remote selection indicator appearing in wrong position
  - Replaced complex manual coordinate calculation with Fabric.js `getBoundingRect()`
  - `getBoundingRect()` properly accounts for viewport transform, zoom, scale, rotation, and origin
  - Fixed fallback calculation for remoteObjects to properly handle circle dimensions

---

## Phase 6: Documentation & Architecture

### 6.1 Project Documentation
- [x] Create README.md with setup instructions
- [x] Document project structure
- [x] Document usage/controls
- [x] List performance targets

### 6.2 Demo Mode
- [x] Implement BroadcastChannel fallback for testing without Firebase
- [x] Enable cross-tab synchronization in same browser

---

## Architecture Summary

```
Frontend (React Components)
├── Canvas Editor (Fabric.js)
├── Toolbar (Tools, Colors, Zoom)
├── Cursor Overlay (Remote cursors)
├── Online Users Panel
└── AI Command Input

Hooks (Business Logic)
├── useAuth - Authentication state
├── useCanvas - Canvas management
├── useCursorSync - Cursor broadcasting
├── usePresence - Online presence tracking
├── useRealtimeSync - Object synchronization
└── useAIAgent - AI command processing

Services (Data Layer)
├── firebase.ts - Firebase initialization
├── canvasSync.ts - Firestore sync
├── cursorSync.ts - Realtime DB cursors
├── presenceSync.ts - Online user tracking
└── aiService.ts - AI tools/commands

Firebase (Cloud Backend)
├── Firestore - Rooms & Objects
├── Realtime DB - Cursors & Presence
└── Auth - User authentication
```

**Data Flow:**
```
User draws shape → Frontend sends to Firestore → Firestore notifies other users → Their frontends update
User moves mouse → Frontend sends to Realtime DB → Other users see cursor move instantly
```

---

## Files Modified (Summary)

| File | Purpose |
|------|---------|
| `src/components/Canvas/Canvas.tsx` | Main canvas, grid constraints, undo fixes, sync fixes |
| `src/components/Canvas/CanvasToolbar.tsx` | Tools UI, color pickers, zoom controls |
| `src/components/Canvas/CursorOverlay.tsx` | Remote cursor rendering |
| `src/components/Auth/LoginForm.tsx` | Authentication UI |
| `src/components/Auth/UserAvatar.tsx` | User indicators |
| `src/components/Layout/Room.tsx` | Main collaboration room |
| `src/components/Layout/Home.tsx` | Room creation/join |
| `src/components/Presence/OnlineUsers.tsx` | Online user list |
| `src/components/AI/AICommandInput.tsx` | AI command interface |
| `src/hooks/useAuth.tsx` | Authentication hook |
| `src/hooks/useCanvas.ts` | Canvas state management |
| `src/hooks/useCursorSync.ts` | Cursor sync hook |
| `src/hooks/usePresence.ts` | Presence tracking hook |
| `src/hooks/useRealtimeSync.ts` | Object sync hook |
| `src/hooks/useAIAgent.ts` | AI processing hook |
| `src/services/firebase.ts` | Firebase initialization |
| `src/services/canvasSync.ts` | Firestore operations |
| `src/services/cursorSync.ts` | Realtime DB cursor ops |
| `src/services/presenceSync.ts` | Presence operations |
| `src/services/aiService.ts` | AI tools & execution |
| `src/types/canvas.ts` | Shape & object types |
| `src/types/ai.ts` | AI types |
| `src/types/user.ts` | User types |
| `src/utils/colors.ts` | Color utilities |
| `src/utils/throttle.ts` | Performance optimization |
| `firestore.rules` | Database security rules |
| `database.rules.json` | Realtime DB security rules |

---

## Review

### Project Completion Summary

The Collaborative Canvas application was successfully built with all major features:

1. **Core Canvas** - Fabric.js-based canvas with pan/zoom, multiple shape tools, color customization, and undo/redo

2. **Real-Time Collaboration** - Firestore for persistent object storage, Realtime Database for fast cursor/presence sync, supporting 5+ concurrent users

3. **AI Canvas Agent** - Natural language commands via local parser with optional OpenAI GPT-4 integration for complex operations

4. **Authentication** - Google sign-in and email/password via Firebase Auth

### Key Technical Decisions

- **Fabric.js** over raw Canvas: Built-in selection, transformation, and object management
- **Dual Database Strategy**: Firestore for objects (durability), Realtime DB for cursors (speed)
- **Last-Write-Wins**: Simple conflict resolution that works well for collaborative editing
- **Local AI Fallback**: Secure command parsing without requiring API keys

### Performance Targets Met

- 60 FPS during interactions
- <100ms object sync latency
- <50ms cursor sync latency
- Support for 500+ objects
- Support for 5+ concurrent users

### Deployment Ready

The app is configured for Firebase Hosting or Vercel deployment with proper security rules and environment variable handling.

---

## Phase 7: AI Undo Fix

### 7.1 Fix Undo for AI-Assisted Changes

**Problem:**
The undo button doesn't work for AI-created/modified objects because:
- AI operations go through `Room.tsx` → `useRealtimeSync` → Firebase
- Canvas's `addToHistory` is never called for AI operations
- Only manual drawing/editing triggers history tracking

**Solution:**
Expose a callback from Canvas to allow external code to add history entries.
Call this callback from Room.tsx when AI operations occur.

**Tasks:**
- [x] 1. Add `onHistoryAdd` callback prop to Canvas component
- [x] 2. In Room.tsx, wire up the callback and call it after AI operations

**Review:**
- Added `onHistoryAddChange` callback prop to Canvas that exposes the `addToHistory` function
- Exported `HistoryEntry` interface from Canvas for use in Room.tsx
- Updated `aiCreateObject` to add 'create' history entries
- Updated `aiUpdateObject` to add 'modify' history entries (with previous props for undo)
- Added new `aiDeleteObject` wrapper that adds 'delete' history entries before removing
- Wired up the callback in Canvas JSX to store the function in a ref
- **Fixed race condition**: Added `pendingDeletionRef` to track objects being deleted
  - When undoing a create, object ID is marked as "pending deletion"
  - The remote sync effect skips re-creating objects in pending deletion
  - Pending deletion flags are cleared once Firebase confirms removal
  - Redo operations properly clear/set pending deletion flags
- Now Ctrl+Z/Cmd+Z will undo AI-created shapes, AI modifications, and AI deletions

---

## Phase 8: Infinite Board + Sticky Notes

### 8.1 Infinite Board
- [x] Remove `CANVAS_WIDTH` / `CANVAS_HEIGHT` constants from `useCanvas.ts` and `Canvas.tsx`
- [x] Remove pan constraining logic in `useCanvas.ts`
- [x] Delete `constrainToGrid()` function and all its calls in `useCanvas.ts`
- [x] Delete `clampToGrid()` and `constrainShapeToGrid()` functions and all their calls in `Canvas.tsx`
- [x] Replace static `drawGrid()` (162 permanent lines) with dynamic `updateGrid()` that only draws grid lines visible in the viewport (throttled at 16ms)
- [x] Hook `updateGrid` into pan, zoom, and resize events
- [x] Update `getCanvasCenter` fallback from (2000, 2000) to (0, 0)

### 8.2 Sticky Notes
- [x] Add `'sticky'` to `ShapeType` and `Tool` unions in `canvas.ts`
- [x] Add sticky note entry to toolbar shapes dropdown in `CanvasToolbar.tsx`
- [x] Implement sticky note in `Canvas.tsx`:
  - Uses Fabric.js `Textbox` for native text editing, wrapping, cursor
  - Click-to-place at fixed 200x200 size (yellow `#FEF3C7`, amber border `#F59E0B`)
  - `text:changed` event syncs keystrokes to remote users via existing debounced path
  - Full undo/redo support (text content preserved)
  - `createFabricObject`, `getObjectType`, `getObjectProps`, `updateFabricObject` all handle sticky
  - Remote text updates skip if content unchanged (prevents interrupting active editing)
- [x] Add AI support: `'sticky'` in createShape enum, text parameter, NLP pattern matching
  - Supports commands like "create a sticky note saying 'Hello'"

### Review
- **Infinite Board**: Removed all 4000x4000 boundaries. Canvas is now unbounded in all directions. Grid is dynamically generated based on viewport, drawing only ~40-80 lines at any time vs. the previous 162 static lines. Pan and zoom work without constraints.
- **Sticky Notes**: Implemented using Fabric.js `Textbox` for native in-place text editing with word wrapping. Text syncs in real-time via the existing `text:changed` → `onObjectModified` → debounced Firestore path. AI assistant supports creating sticky notes via natural language commands.
- Build passes with zero TypeScript errors.

---

## Phase 9: Security Vulnerability Fixes

22 findings addressed (2 Critical, 4 High, 10 Medium, 6 Low).

### 9.1 Firestore Rules (Fixes #1, #4, #7, #9, #10)
- [x] Fix room takeover & member removal (CRITICAL + HIGH)
  - Split room update rule into 3 branches: non-member-field updates, member list changes (superset check), and non-member join (size+1 check)
  - Members can no longer remove other members from the list
  - Non-members can only add themselves, not modify other fields
- [x] Add AI request field validation (MEDIUM)
  - Added `hasOnly` + `hasAll` combo to restrict fields to known set
  - Enforce `status == 'pending'`, command is string, length 1-500
- [x] Add objects schema validation (MEDIUM)
  - Require `id`, `type`, `props`, `zIndex` on create
  - Validate `type` against allowed enum
- [x] Document room read access rationale (MEDIUM)
  - Added comment explaining why all authenticated users can read rooms

### 9.2 Cloud Function (Fixes #2, #3, #5, #12, #13, #17, #18)
- [x] Fix prompt injection via command (CRITICAL)
  - Added anti-injection instruction to system prompt
  - Wrapped user input in `<user_command>` XML delimiters
- [x] Fix prompt injection via canvasObjects (HIGH)
  - Added `sanitizeCanvasObjects()` with `VALID_TYPES` set and `ID_PATTERN` regex
  - Filters objects with invalid type or non-alphanumeric ID
  - Coerces `left`/`top` through `Number()` + `Math.round()`
- [x] Add per-user rate limiting (HIGH)
  - Queries `aiRequests` for same userId with createdAt >= 1 minute ago
  - Rejects if count > 10 with user-friendly error
- [x] Validate LLM tool call results (MEDIUM)
  - Added `VALID_TOOL_NAMES` set, filters content blocks to only known tools
- [x] Add room deletion cascade (MEDIUM)
  - New `onRoomDeleted` function using `onDocumentDeleted`
  - Batch-deletes all docs in `objects` and `aiRequests` subcollections
- [x] Add idempotency guard (LOW)
  - Checks `data.status !== 'pending'` at start; returns early if already processing/completed
- [x] Add fetch timeout (LOW)
  - `AbortController` with 30s timeout on Anthropic API fetch
  - Handles `AbortError` with user-friendly message

### 9.3 Security Headers (Fix #6 — HIGH)
- [x] Add hosting security headers to `firebase.json`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy` allowing self, Firebase domains, Google user content

### 9.4 Realtime Database Rules (Fix #16 — MEDIUM)
- [x] Add default deny (`".read": false, ".write": false`)
- [x] Add `.validate` rules for cursor fields (`x`, `y`, `userId`, `userName`, `color`, `lastActive`)
- [x] Add `.validate` rules for presence fields (`online`, `lastSeen`)

### 9.5 Frontend Services (Fixes #11, #19, #21, #22)
- [x] Sanitize room ID from URL (MEDIUM)
  - Split on `/` and `?`, regex filter `[a-zA-Z0-9_-]`, max length 36
- [x] Fix race condition in snapshot listener (LOW)
  - Added `settled` guard variable to prevent double resolve/reject
- [x] Add JSON.parse safety in aiService (LOW)
  - Wrapped `JSON.parse(call.arguments)` in try/catch, filter nulls
- [x] Add runtime param validation in executeAIAction (LOW)
  - `VALID_ACTION_TYPES` and `VALID_SHAPE_TYPES` sets
  - Validate type is string, x/y are numbers in `createShape`

### 9.6 Firebase App Check (Fix #8 — MEDIUM)
- [x] Add App Check initialization code
  - Import `initializeAppCheck` + `ReCaptchaEnterpriseProvider`
  - Conditionally init if `VITE_RECAPTCHA_SITE_KEY` env var is set
  - Dormant until GCP Console setup is completed

### 9.7 Build & Config Cleanup (Fixes #14, #20, .env)
- [x] Strip console logs in production (LOW)
  - Added `esbuild.pure: ['console.log', 'console.warn']` to vite config
- [x] Longer room IDs (MEDIUM)
  - Changed `uuidv4().slice(0, 8)` → `uuidv4().replace(/-/g, '').slice(0, 16)` (64-bit entropy)
- [x] Clean up `.env.example`
  - Removed `VITE_GEMINI_API_KEY`, added `VITE_RECAPTCHA_SITE_KEY` comment

### Review
- All 22 security findings fixed across 10 files
- TypeScript compilation passes clean in both root and functions/
- Production build succeeds with zero console.log in output
- All changes deployed to Firebase (rules, functions, hosting)

---

## Phase 10: Critical Bug Fix — Text Content Being Cleared (State Regression)

### Root Cause Analysis

**The Problem:** Text inside textboxes/sticky notes disappears after a short delay. The component stays but the text string becomes empty.

**3 root causes identified:**

1. **No "editing lock" on incoming sync updates (useRealtimeSync.ts)**
   - The BroadcastChannel `update` handler (line 56-68) directly calls `setObjects` with NO check for whether the user is editing that object
   - The Firebase `onModify` handler (line 130-141) uses `localPendingUpdates` which only blocks ONE echo — rapid edits can cause stale echoes to slip through and overwrite the React state
   - Result: React state gets overwritten with stale text while user is editing. When user clicks away, the sync effect applies the stale state to the Fabric canvas

2. **Sync effect only guards "active object", not "editing object" (Canvas.tsx line 1416-1421)**
   - The sync effect skips `updateFabricObject` only when the object is the `activeObject` (selected)
   - But after `text:editing:exited`, if no debounced update is pending, the sync effect can apply stale text from the React state

3. **`localPendingUpdates` uses Set (boolean flag) instead of counter (useRealtimeSync.ts line 29)**
   - When multiple writes happen rapidly, the first echo clears the flag, causing subsequent echoes to process as "remote" updates that overwrite local state

### Plan (3 changes, minimal impact)

- [x] **10.1 Add Watchdog Log** — Add `console.trace()` in `updateFabricObject` when text is being set to empty string (Canvas.tsx)
  - Simple diagnostic: if `props.text` is `""` and `tb.text` is not empty, log a trace

- [x] **10.2 Implement Editing Lock (Optimistic Locking)** — Track which objects are being edited and block incoming updates for those objects
  - In `useRealtimeSync.ts`: Add `editingObjectIds` ref (Set<string>)
  - Add `setEditingObjectId(id: string | null)` function to mark/unmark objects as being edited
  - In BroadcastChannel `update` handler: skip updates for objects in `editingObjectIds`
  - In Firebase `onModify` handler: skip updates for objects in `editingObjectIds`
  - In Canvas.tsx: call `setEditingObjectId(id)` on `text:editing:entered` and `setEditingObjectId(null)` on `text:editing:exited`
  - In sync effect: also skip objects in `editingObjectIds` (not just active object)

- [x] **10.3 Fix `localPendingUpdates` to use counter instead of boolean Set**
  - Change from `Set<string>` to `Map<string, number>` (refcount)
  - `add` increments the counter, `onModify` decrements it
  - Only process remote updates when counter reaches 0

### Files modified:
1. `src/hooks/useRealtimeSync.ts` — editing lock + pending updates counter
2. `src/components/Canvas/Canvas.tsx` — watchdog log + wire editing events to lock
3. `src/components/Layout/Room.tsx` — pass new editing lock callback to Canvas

### Review
- **Watchdog**: Added `console.trace()` in `updateFabricObject` for both sticky and textbox types — fires when text is about to be cleared (non-empty → empty), showing the exact call stack
- **Editing Lock**: 3-layer protection:
  1. `useRealtimeSync` blocks incoming BroadcastChannel and Firebase updates for objects being edited
  2. Canvas sync effect skips objects where `isEditing` is true (secondary guard)
  3. `updateFabricObject` has existing `isEditing` check (tertiary guard)
  - Lock is acquired on `text:editing:entered`, released on `text:editing:exited` (after flushing pending sync)
- **Pending Updates Refcount**: Changed `Set<string>` → `Map<string, number>`. Each `syncObject` call increments the count; each Firebase echo decrements it. Remote updates only process when the count is 0, preventing stale echoes from slipping through during rapid edits
- TypeScript compiles clean, Vite build succeeds

---

## Phase 10b: Production Text Fix — Component Lifecycle & Ref Persistence

### Root Cause (Found)

**The `text:editing:exited` handler was silently failing.** When Fabric.js fires this event, it has already deselected the object — so `canvas.getActiveObject()` returns `null`. The code that was supposed to sync the final text on blur was never executing. Combined with removing the `text:changed` handler (to stop Firestore echo storms), there was **zero sync path for text**.

### 4 Bugs Fixed

- [x] **10b.1 Fix `text:editing:exited` handler** — Store the editing Textbox in a ref (`editingTextboxRef`) when editing starts. Use that ref (not `getActiveObject`) in the exit handler to reliably read the final text and sync it.

- [x] **10b.2 Ref-based text persistence (`textBufferRef`)** — A `Map<string, string>` outside the render cycle that buffers every keystroke. If the sync effect recreates the Fabric object (unmount/remount equivalent), the new object pulls its text from this buffer instead of using the stale server value.

- [x] **10b.3 Guard `fontSize`/`fontFamily` against undefined** — `updateFabricObject` now uses `props.fontSize ?? tb.fontSize ?? 16` instead of bare `props.fontSize`. Prevents text becoming invisible (0px font) when a partial Firestore update omits these fields.

- [x] **10b.4 Buffer-aware sync effect** — Both the "update existing" and "create new remote" code paths in the sync effect check `textBufferRef` before applying server state. If the user has typed text that hasn't synced yet, the buffer wins.

### Files modified
1. `src/components/Canvas/Canvas.tsx` — all 4 fixes

---

## Phase 11: Presence System Fix — Persistent Connection Model

### Root Cause Analysis

**The Problem:** The Online indicator shows `(0)` even when the user is actively in a session.

**3 root causes identified:**

1. **`onDisconnect()` not awaited before writing `online: true` (presenceSync.ts)**
   - The old code called `onDisconnect().set(...)` and `set(presenceRef, { online: true })` without awaiting the onDisconnect registration. The server might not have had the cleanup handler registered before the online write landed, meaning disconnects could leave stale `online: true` entries.

2. **Cleanup race condition — `setUserOffline()` in React effect cleanup (usePresence.ts)**
   - The useEffect cleanup called `setUserOffline()` asynchronously. When React re-runs the effect (e.g. on HMR or dep change), the cleanup's offline write could arrive at Firebase RTDB **after** the new setup's online write, immediately marking the user offline. This is the classic async cleanup race.

3. **No `.info/connected` listener for RTDB reconnection (usePresence.ts)**
   - The hook only announced presence once on mount. If the RTDB connection dropped and reconnected (common on mobile, tab sleep, network switches), presence was never re-announced. The server-side `onDisconnect` handler had already cleaned up the entry, so the user appeared offline until a full page reload.

### Plan (3 changes)

- [x] **11.1 Rewrite `presenceSync.ts` — Await `onDisconnect` before writing online**
  - `setUserOnline()` now does: `await onDisconnect(ref).set({ online: false })` first, THEN `await set(ref, { online: true })`
  - Added `getConnectedRef()` export for `.info/connected` reference
  - Heavy `console.log` instrumentation throughout

- [x] **11.2 Rewrite `usePresence.ts` — Persistent connection model**
  - Removed `setUserOffline()` from effect cleanup entirely (let server-side `onDisconnect` handle it)
  - Added `.info/connected` listener that calls `setUserOnline()` on every RTDB (re)connect
  - Added `isConnected` state returned from hook
  - Added `document.visibilitychange` listener to re-announce on tab focus (browsers throttle background tabs)
  - Cleanup only tears down listeners, never writes offline — eliminates the race condition

- [x] **11.3 Wire `isConnected` into UI — Visual debug indicator**
  - `Room.tsx`: Destructured `isConnected` from `usePresence`, passed to `OnlineUsers`
  - `OnlineUsers.tsx`: Added debug display showing `RTDB: Connected/Disconnected` and truncated UID

### Files modified
1. `src/services/presenceSync.ts` — awaited onDisconnect, added getConnectedRef()
2. `src/hooks/usePresence.ts` — persistent connection model, no client-side offline writes
3. `src/components/Layout/Room.tsx` — pass presenceConnected to OnlineUsers
4. `src/components/Presence/OnlineUsers.tsx` — debug connection status display

### Review
- **Server-side cleanup only**: The React effect cleanup no longer writes `online: false`. Firebase's `onDisconnect` handler (registered server-side) does this automatically. This completely eliminates the race condition where cleanup's write arrives after the next setup's write.
- **Reconnection resilience**: The `.info/connected` listener fires every time the RTDB connection is (re)established. Each time, it re-runs `setUserOnline()` which registers a fresh `onDisconnect` handler and writes `online: true`. Works across network drops, tab sleep/wake, and mobile backgrounding.
- **Visual debug**: A small debug indicator in the OnlineUsers panel shows RTDB connection state and truncated user ID, making it easy to verify presence is working without opening DevTools.
- TypeScript compiles clean, Vite build succeeds, deployed to Firebase Hosting.
