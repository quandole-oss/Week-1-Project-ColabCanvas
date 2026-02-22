# Collaborative Canvas

A real-time collaborative whiteboard with AI-powered creation capabilities. Multiple users can design together in real-time, seeing each other's cursors and changes instantly.

**Live App**: https://colabcanvas-592e5.web.app

**GitHub**: https://github.com/quandole-oss/Week-1-Project-ColabCanvas

## Features

### Real-Time Collaboration
- Multiplayer cursors with name labels and selection indicators
- Instant object synchronization across all connected clients
- Presence awareness (who's online, who's editing what)
- Real-time drag/resize preview via RTDB streaming

### Canvas Tools
- **Shapes**: Rectangle, circle, triangle, line, star, hexagon
- **Text**: Sticky notes and textboxes with inline editing
- **Pan/Zoom**: Spacebar+drag to pan, scroll to zoom, zoom controls in toolbar
- **Selection**: Click, shift+click, or rubber-band to multi-select
- **Eraser**: Click or drag to delete objects
- **Layers**: Bring forward/backward, bring to front/send to back
- **Copy/Paste**: Ctrl+C/V with offset stacking
- **Undo/Redo**: Ctrl+Z/Y with batch undo for AI operations

### AI Canvas Agent
Natural language commands powered by Anthropic Claude (Haiku for simple, Sonnet with extended thinking for complex):
- "Create a red rectangle at 200, 200"
- "Draw a smiley face"
- "Create a login form"
- "Create a 3x3 grid of squares"
- "Arrange objects in a circle"
- "Cluster these sticky notes by theme"
- 10 built-in templates: SWOT, flowchart, kanban, bar chart, org chart, etc.

### Classification & Filter View
- Tag canvas objects with color-coded classifications
- Filter view to isolate objects by tag
- AI-powered semantic grouping (cluster, categorize, summarize)

### Authentication
- Google OAuth sign-in
- Email/password registration
- Demo mode (no backend, cross-tab sync via BroadcastChannel)

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React + TypeScript | 19 / 5.9 |
| Build | Vite | 7 |
| Styling | Tailwind CSS | 4 |
| Canvas | Fabric.js | 7 |
| Backend | Firebase (Auth, Firestore, RTDB, Functions, Hosting) | 12 |
| AI | Anthropic Claude API (via Cloud Functions) | claude-sonnet-4-5 / claude-haiku-4-5 |
| Testing | Vitest | 3 |
| Linting | ESLint + TypeScript ESLint | 9 |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full technical walkthrough including data flow diagrams, feature walkthroughs, and trade-off analysis.

### High-Level Overview

```
Browser (React 19 + Fabric.js 7)
  ├── Canvas objects ←→ Firestore (persistent, ordered by zIndex)
  ├── Cursors/Presence ←→ Realtime Database (ephemeral, low-latency)
  ├── AI requests → Firestore → Cloud Function → Anthropic Claude API
  └── Auth ←→ Firebase Auth (Google OAuth + email/password)
```

**Room.tsx** is the orchestrator — it instantiates four hooks (`useRealtimeSync`, `useCursorSync`, `usePresence`, `useAIAgent`) and wires their outputs into `Canvas.tsx` via callback props.

## Setup

### 1. Prerequisites

- Node.js 18+
- npm 9+
- A Firebase project ([create one here](https://console.firebase.google.com))

### 2. Install Dependencies

```bash
cd collaborative-canvas
npm install
cd functions && npm install && cd ..
```

### 3. Firebase Configuration

In the Firebase Console:
1. Enable **Authentication** (Google and Email/Password providers)
2. Create a **Firestore** database
3. Create a **Realtime Database**
4. Copy the Firebase config values

Create `.env.local` in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
```

### 4. (Optional) Anthropic API Key for Dev Mode

For direct AI calls during development (bypasses Cloud Functions):

```env
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key
```

Without this, the app uses a local regex-based NLP parser for simple commands. In production, AI goes through the Cloud Function.

### 5. Deploy Firebase Rules

```bash
npx firebase deploy --only firestore:rules,database
```

### 6. Deploy Cloud Functions

Set the Anthropic API key as a Firebase secret:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Then deploy:

```bash
cd functions && npm run build && cd ..
npx firebase deploy --only functions
```

### 7. Run Development Server

```bash
npm run dev
```

### 8. Build & Deploy

```bash
npm run build
npx firebase deploy --only hosting
```

## Project Structure

```
collaborative-canvas/
├── src/
│   ├── components/
│   │   ├── Canvas/           # Fabric.js canvas, toolbar, cursor overlay, classification panel
│   │   ├── Auth/             # Login form, user avatar
│   │   ├── Presence/         # Online users list
│   │   ├── AI/               # AI command input panel
│   │   └── Layout/           # Room orchestrator, Home lobby
│   ├── hooks/                # useRealtimeSync, usePresence, useCursorSync, useAIAgent, etc.
│   ├── services/             # Firebase init, Firestore sync, RTDB sync, AI service, templates
│   ├── types/                # TypeScript interfaces (canvas, user, AI)
│   └── utils/                # Throttle, debounce, colors, zIndex, position helpers
├── functions/                # Cloud Functions (AI proxy, room cleanup)
├── firestore.rules           # Firestore security rules
├── database.rules.json       # Realtime Database security rules
└── firebase.json             # Firebase project config
```

## Commands

```bash
npm run dev          # Start Vite dev server (hot reload)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:watch   # Vitest (watch mode)

# Deployment
npx firebase deploy                    # Deploy everything
npx firebase deploy --only hosting     # Deploy frontend only
npx firebase deploy --only functions   # Deploy Cloud Functions only
```

## Controls

| Action | Input |
|---|---|
| Select | Click object |
| Multi-select | Shift+click or drag selection box |
| Draw shape | Select tool, click+drag |
| Pan | Spacebar+drag |
| Zoom | Scroll wheel or zoom buttons |
| Delete | Select + Delete/Backspace |
| Undo/Redo | Ctrl+Z / Ctrl+Shift+Z |
| Copy/Paste | Ctrl+C / Ctrl+V |
| Layer order | `]` forward, `[` backward, `}` front, `{` back |

## Performance Targets

- 60 FPS during interactions
- <100ms object sync latency
- <50ms cursor sync latency
- Support for 500+ objects per room
- Support for 5+ concurrent users per room
