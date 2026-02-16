# Collaborative Canvas

A real-time collaborative design canvas with AI-powered creation capabilities. Multiple users can design together in real-time, seeing each other's cursors and changes instantly.

## Features

### MVP Features
- **Canvas with Pan/Zoom**: Large workspace with smooth navigation
  - Spacebar + drag to pan
  - Scroll wheel to zoom
  - Zoom controls in toolbar
- **Shape Tools**: Create rectangles, circles, lines, and text
- **Real-time Collaboration**:
  - Multiplayer cursors with name labels
  - Instant object synchronization
  - Presence awareness (who's online)
- **User Authentication**: Google sign-in and email/password

### AI Canvas Agent
Natural language commands to manipulate the canvas:
- "Create a red rectangle at 200, 200"
- "Create a blue circle"
- "Add text that says Hello World"
- "Create a 3x3 grid of squares"
- "Create a login form"
- "Create a navigation bar"
- "Arrange objects in a row"

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Canvas**: Fabric.js
- **Backend**: Firebase (Firestore, Realtime DB, Auth)
- **AI**: OpenAI GPT-4 (with local fallback)
- **Styling**: Tailwind CSS v4

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Firebase Configuration

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication (Google and Email/Password providers)
3. Create a Firestore database
4. Create a Realtime Database
5. Copy the Firebase config values

Create a `.env` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
```

### 3. (Optional) OpenAI API Key

For full AI functionality, add your OpenAI API key:

```env
VITE_OPENAI_API_KEY=your_openai_api_key
```

Without an API key, the AI agent uses a local command parser with limited capabilities.

### 4. Deploy Firebase Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init

# Deploy rules
firebase deploy --only firestore:rules,database
```

### 5. Run Development Server

```bash
npm run dev
```

### 6. Build for Production

```bash
npm run build
```

### 7. Deploy

```bash
firebase deploy --only hosting
```

## Project Structure

```
src/
├── components/
│   ├── Canvas/          # Fabric.js canvas, toolbar, cursor overlay
│   ├── Auth/            # Login form, user avatar
│   ├── Presence/        # Online users list
│   ├── AI/              # AI command input
│   └── Layout/          # Room, Home pages
├── hooks/
│   ├── useAuth.tsx      # Authentication context
│   ├── useCanvas.ts     # Canvas management
│   ├── useCursorSync.ts # Cursor broadcasting
│   ├── usePresence.ts   # Online presence
│   ├── useRealtimeSync.ts # Object sync
│   └── useAIAgent.ts    # AI command processing
├── services/
│   ├── firebase.ts      # Firebase initialization
│   ├── canvasSync.ts    # Firestore sync
│   ├── cursorSync.ts    # Realtime DB cursors
│   ├── presenceSync.ts  # Presence tracking
│   └── aiService.ts     # AI tools and execution
├── types/               # TypeScript types
└── utils/               # Utilities (throttle, debounce, colors)
```

## Usage

1. Sign in with Google or email/password
2. Create a new room or join existing
3. Use the toolbar to create shapes
4. Share the room URL with collaborators
5. Use the AI command input at the bottom to create objects with natural language

## Controls

- **Select Tool**: Click to select, drag to move
- **Shape Tools**: Click and drag to draw
- **Pan**: Spacebar + drag, or middle mouse button
- **Zoom**: Scroll wheel, or use zoom buttons
- **Delete**: Select object(s) and press Delete/Backspace
- **Multi-select**: Shift+click or drag a selection box

## Performance Targets

- 60 FPS during interactions
- <100ms object sync latency
- <50ms cursor sync latency
- Support for 500+ objects
- Support for 5+ concurrent users
