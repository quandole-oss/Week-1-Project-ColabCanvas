4# Collaborative Canvas — Architecture Plan

## 1. Overview

A real-time collaborative whiteboard built with **React 19**, **TypeScript**, **Fabric.js**, and **Firebase**. Multiple users can draw shapes on a shared canvas, see each other's cursors and selections in real time, and use an AI assistant to create objects via natural language.

The app runs in two modes:
- **Firebase mode** — full multi-device real-time sync via Firestore + Realtime Database
- **Demo mode** — cross-tab sync via BroadcastChannel (no backend required)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Canvas | Fabric.js 7 |
| Backend | Firebase (Auth, Firestore, Realtime Database) |
| Routing | React Router DOM 7 |
| IDs | uuid v13 |

---

## 3. Project Structure

```
src/
├── main.tsx                          # ReactDOM entry point
├── App.tsx                           # Router + AuthProvider + route guards
├── index.css                         # Tailwind imports
│
├── types/
│   ├── ai.ts                        # AITool, AIMessage, AICommandResult
│   ├── canvas.ts                    # CanvasObject, CursorState, Room, Tool, ShapeType
│   └── user.ts                      # User, PresenceData
│
├── utils/
│   ├── colors.ts                    # User color palette, shape default colors
│   └── throttle.ts                  # throttle() and debounce() helpers
│
├── services/
│   ├── firebase.ts                  # Firebase app init, auth, db, rtdb exports
│   ├── canvasSync.ts                # Firestore CRUD for canvas objects
│   ├── cursorSync.ts                # RTDB read/write for cursor positions
│   ├── presenceSync.ts             # RTDB read/write for online presence
│   └── aiService.ts                 # Local NLP parser + action executor
│
├── hooks/
│   ├── useAuth.tsx                  # AuthContext provider + consumer
│   ├── useCanvas.ts                 # Fabric.js canvas lifecycle, zoom, pan, grid
│   ├── useRealtimeSync.ts          # Object sync (Firestore or BroadcastChannel)
│   ├── usePresence.ts              # Online user tracking
│   ├── useCursorSync.ts            # Remote cursor broadcasting
│   └── useAIAgent.ts               # AI command processing + history batching
│
└── components/
    ├── Auth/
    │   ├── LoginForm.tsx            # Email/password, Google OAuth, or demo login
    │   └── UserAvatar.tsx           # Initials/photo avatar with color
    ├── Canvas/
    │   ├── Canvas.tsx               # Core canvas: drawing, selection, sync, history (~1700 lines)
    │   ├── CanvasToolbar.tsx        # Tool buttons, color pickers, zoom, undo/redo
    │   └── CursorOverlay.tsx        # Remote cursor rendering (rAF-driven)
    ├── Presence/
    │   └── OnlineUsers.tsx          # Online user list with editing status
    ├── AI/
    │   └── AICommandInput.tsx       # Floating AI chat panel + quick commands
    └── Layout/
        ├── Home.tsx                 # Room lobby: create/join rooms
        └── Room.tsx                 # Workspace: assembles canvas, presence, AI, header
```

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx                                  │
│  BrowserRouter → AuthProvider → ProtectedRoute                  │
│    /login → LoginForm                                           │
│    /      → Home                                                │
│    /room/:roomId → Room                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Room.tsx   │  Orchestrates all hooks + components
                    └──┬──┬──┬──┬─┘
          ┌────────────┘  │  │  └────────────┐
          ▼               ▼  ▼               ▼
   useRealtimeSync  usePresence  useCursorSync  useAIAgent
          │               │          │              │
          ▼               ▼          ▼              │
   ┌────────────┐  ┌──────────┐ ┌─────────┐       │
   │ canvasSync │  │ presence │ │ cursor  │       │
   │ (Firestore)│  │  Sync    │ │  Sync   │       │
   │            │  │  (RTDB)  │ │  (RTDB) │       │
   └─────┬──────┘  └────┬─────┘ └────┬────┘       │
         └───────────────┼────────────┘            │
                         ▼                         ▼
                    ┌──────────┐            ┌──────────┐
                    │ Firebase │            │ aiService│
                    │ Backend  │            │ (local)  │
                    └──────────┘            └──────────┘

    ┌─────────────────────────────────────────────────────┐
    │                     Canvas.tsx                        │
    │  Fabric.js instance ← useCanvas hook                 │
    │  ┌────────────────┐  ┌────────────┐  ┌───────────┐ │
    │  │ Drawing engine  │  │ History    │  │ Remote    │ │
    │  │ (mouse events)  │  │ (undo/redo)│  │ sync      │ │
    │  └────────────────┘  └────────────┘  └───────────┘ │
    │  ┌────────────────┐  ┌────────────┐                 │
    │  │ Selection       │  │ Eraser     │                 │
    │  │ highlights      │  │ tool       │                 │
    │  └────────────────┘  └────────────┘                 │
    └─────────────────────────────────────────────────────┘
```

---

## 5. Data Flow

### 5.1 Authentication

```
LoginForm → Firebase Auth (Google/email) or Demo user
         → onAuthStateChanged listener
         → AuthContext sets { user, isDemo }
         → Color assigned (random, persisted in localStorage)
```

### 5.2 Room Entry

```
Navigate to /room/:roomId
  → useRealtimeSync: ensureRoom() + subscribeToObjects()
  → usePresence:     setUserOnline() + subscribeToPresence()
  → useCursorSync:   setupCursorCleanup() + subscribeToCursors()
```

### 5.3 Drawing an Object

```
1. User selects shape tool (toolbar)
2. mousedown  → create temporary Fabric object
3. mousemove  → resize via drag
4. mouseup    → finalize:
   a. Validate min 5px size (sticky notes always valid)
   b. Normalize origin to top-left
   c. Generate UUID
   e. onObjectCreated(id, type, props, zIndex) → Room
   f. Add HistoryEntry (type: 'create')
   g. Auto-select, switch to select tool
5. Room → useRealtimeSync.createObject()
   a. Optimistic: update local Map<id, CanvasObject> immediately
   b. Async:     syncObject() writes to Firestore
   c. Track in localPendingUpdates to ignore echo
6. Remote users → subscribeToObjects() fires
   → Canvas receives remoteObjects → creates Fabric objects
```

### 5.4 Object Modification (drag/resize/rotate)

```
1. mousedown → capture initial props (beforeModifyRef)
2. object:moving/scaling/rotating → throttled (50ms)
   → onObjectModified(id, props)
   → useRealtimeSync.updateObject() debounced (100ms)
3. object:modified → compare with initial props
   → Add HistoryEntry (type: 'modify') if changed
   → Final sync call
```

### 5.5 Cursor Sync

```
mousemove on canvas
  → onCursorMove(x, y) throttled 50ms
  → useCursorSync.broadcastCursor()
  → Firebase RTDB: cursors/{roomId}/{userId}
  ── or BroadcastChannel in demo mode

Remote:
  subscribeToCursors() → filter own + stale (>5s)
  → CursorOverlay: rAF loop converts world→screen coords
  → Render SVG arrow + name label with 75ms transition
```

### 5.6 Selection Broadcasting

```
selection:created → onCursorMove(x, y, objectId, false)  [immediate, not throttled]
  → Remote receives selectedObjectId in CursorState
  → Canvas applies 4px colored stroke highlight (if object stable)
  → Renders name badge above object

object:moving → onCursorMove(x, y, objectId, true)  [isMoving=true]
  → Remote hides selection outline during drag

mouseup → isMoving=false → outline reappears

Heartbeat every 2s keeps selection alive even when idle
```

### 5.7 AI Commands

```
User types "create 3 red circles at center"
  → useAIAgent.processCommand()
  → startHistoryBatch()
  → processLocalCommand():
     - Regex extracts: count=3, color=red, shape=circle, position=center
     - Generates 3 createObject calls with offset positions
  → endHistoryBatch() wraps in single batch HistoryEntry
  → Single Ctrl+Z undoes all 3 circles
```

---

## 6. Firebase Data Model

### Firestore

```
rooms/{roomId}
  ├── name: string
  ├── createdBy: string (uid)
  ├── createdAt: Timestamp
  ├── members: string[] (uids)
  └── isPublic?: boolean

rooms/{roomId}/objects/{objectId}
  ├── id: string
  ├── type: ShapeType
  ├── props: CanvasObjectProps
  ├── zIndex: number
  ├── createdBy / updatedBy: string
  └── createdAt / updatedAt: Timestamp
```

### Realtime Database

```
cursors/{roomId}/{userId}
  ├── x, y: number
  ├── userId, userName, color: string
  ├── lastActive: number (timestamp)
  ├── selectedObjectId?: string
  └── isMoving?: boolean

presence/{roomId}/{userId}
  ├── userId, userName, color: string
  ├── online: boolean
  └── lastSeen: ServerTimestamp
```

**Why the split?** Firestore for persistent canvas data (ordered queries, complex documents). RTDB for ephemeral high-frequency data (cursor positions, presence) where low latency and onDisconnect handlers matter.

---

## 7. State Management Strategy

| Concern | Approach |
|---|---|
| Auth | React Context (AuthProvider) |
| Canvas objects | `Map<string, CanvasObject>` in useRealtimeSync, passed as prop |
| Fabric.js instance | useCanvas hook, stored in ref |
| Cursor positions | `Map<string, CursorState>` in useCursorSync |
| Presence | `PresenceData[]` in usePresence |
| Undo/Redo | Ref-based stack in Canvas.tsx (max 50 entries) |
| AI conversation | `AIMessage[]` state in useAIAgent |
| UI state (tool, colors, zoom) | Local state in useCanvas |

No external state library. Each hook owns its domain. Room.tsx wires them together via props and callbacks.

---

## 8. Real-Time Collaboration Design

### Conflict Resolution
- **Last write wins** via Firestore `setDoc({ merge: true })`
- Optimistic local updates, echo prevention via `localPendingUpdates` ref

### Presence Lifecycle
- `setUserOnline()` on room mount with `onDisconnect` handler
- `setUserOffline()` on unmount
- Firebase handles abrupt disconnection automatically

### Cursor Lifecycle
- Broadcast at 50ms throttle (position) or immediately (selection change)
- `onDisconnect` removes cursor from RTDB
- Stale detection: ignore cursors older than 5 seconds

### Demo Mode Equivalent
- `BroadcastChannel` per feature: `canvas-room-{id}`, `canvas-presence-{id}`, `canvas-cursors-{id}`
- Heartbeat/stale cleanup intervals replace `onDisconnect`
- New tabs request full state sync on mount

---

## 9. History / Undo System

```
HistoryEntry =
  | { type: 'create',  objectId, objectType, props, zIndex }
  | { type: 'delete',  objectId, objectType, props, zIndex }
  | { type: 'modify',  objectId, previousProps, newProps }
  | { type: 'batch',   entries: HistoryEntry[] }
```

- **Max depth**: 50 entries (FIFO eviction)
- **Redo**: Cleared on any new action
- **Batch**: AI operations group multiple creates into one undoable action
- **Pending deletion tracking**: `pendingDeletionRef` prevents race conditions where undo recreates an object that remote sync also recreates

### Undo Logic
| Entry Type | Undo Action |
|---|---|
| create | Delete the object |
| delete | Recreate the object |
| modify | Restore previousProps |
| batch | Undo each sub-entry in reverse order |

---

## 10. Canvas Engine (Fabric.js)

- **Virtual size**: Infinite (unbounded in all directions)
- **Zoom range**: 0.1x – 5x (wheel zoom targets pointer position)
- **Grid**: Dynamic 50px lines, viewport-only (throttled at 16ms)
- **Pan**: Space+drag, middle mouse, or pan tool (no constraints)

### Shape Support
| Shape | Fabric Type | Notes |
|---|---|---|
| rect | Rect | — |
| circle | Circle | Uses radius prop |
| line | Line | x1/y1/x2/y2 |
| triangle | Triangle | — |
| hexagon | Polygon | 6-point generated polygon |
| star | Polygon | 10-point generated star |
| sticky | Textbox | 200x200 yellow note with editable text |

### Drawing Flow
1. `mousedown` → create shape at pointer
2. `mousemove` → resize via drag distance
3. `mouseup` → finalize if ≥5px, discard otherwise
4. Normalize coordinates, assign UUID, sync, add to history

### Remote Highlight System
- Colored 4px stroke in remote user's color
- Original stroke saved in `_remoteHighlightOriginal` custom property
- Only visible when object is stable (not being dragged)
- Name badge overlay positioned via viewport transform

---

## 11. AI Assistant

### Architecture
Fully client-side. No API calls. Regex-based natural language parsing.

### Supported Commands
| Pattern | Action |
|---|---|
| `create [count] [color] [shape]` | Create shapes |
| `create sticky note [saying '...']` | Create editable sticky note |
| `create NxM grid` | Create grid of rectangles |
| `create login form` | Generate multi-object UI mockup |
| `create navigation bar` | Generate nav bar mockup |
| `arrange in row/column/grid` | Reposition all objects |
| `delete all` | Clear canvas |

### Parsing Pipeline
```
Input text
  → Extract color (named or hex)
  → Extract position ("center", "top left", "at x,y")
  → Extract size ("small", "large", "WxH")
  → Extract count ("3 circles", "five rectangles")
  → Extract shape type
  → Generate actions
  → Execute with history batching
```

### UI
- Floating panel, bottom-right
- Chat history with user/assistant messages
- Quick command buttons when collapsed
- "Thinking..." indicator during processing

---

## 12. Routing & Auth Guards

```
/login         → LoginForm (redirects to / if authenticated)
/              → Home (protected) — room lobby
/room/:roomId  → Room (protected) — canvas workspace
*              → redirect to /
```

`ProtectedRoute` wrapper checks `useAuth()` — redirects to `/login` if no user. Shows loading spinner while auth initializes.

---

## 13. Performance Optimizations

| Optimization | Detail |
|---|---|
| Cursor throttle | 50ms (max 20 updates/sec) |
| Object sync debounce | 100ms |
| Object drag broadcast | 50ms throttle |
| Echo prevention | Skip processing own Firestore updates |
| Optimistic UI | Local state updates before server round-trip |
| rAF cursor rendering | CursorOverlay uses requestAnimationFrame |
| History cap | Max 50 undo entries |
| Stale cleanup | Interval-based removal of inactive cursors/presence |
| Viewport transform caching | Avoid recalculating on every frame |

---

## 14. Security

- **Display name sanitization**: Character filtering to prevent XSS
- **Room membership**: `members[]` array on room document controls access
- **Firebase Security Rules**: Server-side enforcement (configured in Firebase console)
- **Demo mode isolation**: Local storage only, no backend exposure
- **No secrets in client**: Firebase config loaded from env vars (public keys only)

---

## 15. Dual-Mode Design (Firebase vs Demo)

Every real-time feature has two implementations:

| Feature | Firebase Mode | Demo Mode |
|---|---|---|
| Object sync | Firestore snapshot listeners | BroadcastChannel `canvas-room-{id}` |
| Cursor sync | RTDB listeners + onDisconnect | BroadcastChannel `canvas-cursors-{id}` |
| Presence | RTDB listeners + onDisconnect | BroadcastChannel `canvas-presence-{id}` + heartbeat |
| Auth | Firebase Auth (Google/email) | Local demo user object |
| Disconnect | Firebase onDisconnect handlers | Heartbeat timeout (6s) |

The `isFirebaseConfigured` flag in `firebase.ts` drives the mode. Each hook checks this flag and branches accordingly. Demo mode achieves feature parity within a single browser.
