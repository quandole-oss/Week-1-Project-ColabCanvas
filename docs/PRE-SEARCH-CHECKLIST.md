# Collaborative Canvas — Pre-Search Checklist

## Phase 1: Define Your Constraints

### 1. Scale & Load Profile

**Users at launch? In 6 months?**
The app targets **5+ concurrent users per room** as the baseline. At launch: small teams doing collaborative whiteboarding (single-digit rooms, handful of users each). In 6 months: low hundreds of total users unless it pivots to a hosted product.

**Traffic pattern: steady, spiky, or unpredictable?**
Spiky. Collaborative sessions are bursty — a room goes from zero to full activity when a meeting starts, then drops to zero. Cursor updates fire at 20/sec per user, object syncs on every interaction. Between sessions: near-zero traffic.

**Real-time requirements?**
Yes, heavily real-time. Three concurrent real-time channels:
- **Object sync**: Firestore snapshot listeners, target <100ms latency
- **Cursor sync**: Firebase RTDB, target <50ms latency, 50ms throttle (20 updates/sec/user)
- **Presence**: Firebase RTDB with `onDisconnect` handlers

**Cold start tolerance?**
Moderate. The app is a client-side SPA — Firebase SDK initializes on page load. Cloud Functions have a cold start (~2-5s for first AI request), mitigated by the progressive rendering UX (shapes appear as they stream in).

---

### 2. Budget & Cost Ceiling

**Monthly spend limit?**
Not formally set. Architecture decisions show cost-consciousness: local NLP parser for simple commands (zero API cost), BroadcastChannel demo mode to avoid Firebase usage during development, Haiku for simple AI requests (cheaper than Sonnet).

**Pay-per-use acceptable or need fixed costs?**
Firebase and Anthropic are both pay-per-use. This is a known risk — every drag, resize, and color change generates a billable Firestore write. Cursor/presence writes go to RTDB (billed by bandwidth/connections, not per-write), which is cheaper for high-frequency data. AI costs are per-token via Anthropic API.

**Where will you trade money for time?**
Firebase eliminates building auth, a real-time sync server, presence infrastructure, and disconnection handling. Anthropic Claude eliminates building a custom AI model. The cost is vendor lock-in and per-operation billing at scale.

---

### 3. Time to Ship

**MVP timeline?**
The app is past MVP. All core features are implemented: drawing (8 shape types), real-time sync, cursors, presence, auth (3 methods), undo/redo, AI commands (3-tier: local + direct API + Cloud Function), room management, classification/filter system, 10 templates, copy/paste, layer management, and a demo mode.

**Speed-to-market vs. long-term maintainability priority?**
Speed won initially. Canvas.tsx grew to ~2300 lines with interleaved concerns. However, the project now has: Vitest unit tests for utilities, comprehensive TypeScript strict mode, ESLint, and a documented architecture (ARCHITECTURE.md). The codebase is maturing.

**Iteration cadence after launch?**
AI-assisted development loop (Claude Code). Solo or very small team iterating quickly.

---

### 4. Compliance & Regulatory Needs

- [x] **HIPAA?** Not applicable. No health data handling.
- [ ] **GDPR?** Not addressed. Firebase Auth stores user emails and Google profile data. No data export, deletion flow, or privacy policy. Gap if EU users are expected.
- [ ] **SOC 2?** Not applicable at current scale. No audit logging beyond Firebase's built-in.
- [x] **Data residency?** Firebase project in `nam5` region. No multi-region or data residency considerations needed at current scale.

---

### 5. Team & Expertise

**Languages/frameworks the team knows well?**
React (hooks, context, refs, callbacks), TypeScript (strict mode), Firebase (Firestore + RTDB split, `onDisconnect`, security rules), Fabric.js 7.

**Learning appetite vs. shipping speed preference?**
Shipping speed. The stack is all mainstream, well-documented tools. Fabric.js 7 (major rewrite) was the one risk — chosen for its improved API.

---

## Phase 2: Architecture Discovery

### 6. Hosting & Deployment

- [x] **Serverless/static?** Fully serverless. Firebase Hosting serves static SPA from CDN. Cloud Functions handle AI proxy.
- [ ] **CI/CD?** Not configured. No GitHub Actions or deployment scripts. Manual deploy via `firebase deploy`.
- [x] **Scaling?** Scales automatically — Firebase Hosting is CDN-backed, Firestore and RTDB scale on demand. Bottleneck is Firestore write costs, not infrastructure capacity.

---

### 7. Authentication & Authorization

- [x] **Auth approach?** Three methods: Google OAuth (`signInWithPopup`), email/password, demo mode (local user, no backend).
- [x] **RBAC?** Minimal. Firestore rules enforce: only authenticated users create rooms, only members read/write objects, only room creators can delete rooms. No admin role or viewer-vs-editor distinction.
- [x] **Multi-tenancy?** Rooms provide basic tenancy. `members[]` array gates access. No workspace/organization layer above rooms.

---

### 8. Database & Data Layer

- [x] **Database type?** Two databases: Firestore (document store — rooms, objects, AI requests) + Firebase RTDB (JSON tree — cursors, presence).
- [x] **Real-time sync?** Core to the app. Firestore `onSnapshot` for objects, RTDB `onValue` for cursors/presence. Demo mode uses `BroadcastChannel`.
- [x] **Read/write ratio?** Write-heavy during active sessions. Every interaction generates Firestore writes (debounced at 100ms per object). Reads are via persistent real-time listeners.

---

### 9. Backend/API Architecture

- [x] **Architecture?** Serverless — Firebase managed services + Cloud Functions.
- [x] **API style?** Firebase SDK handles communication (gRPC for Firestore, WebSocket for RTDB). AI requests use a Firestore document trigger pattern (write request doc → Cloud Function fires → writes result back).
- [x] **Background jobs?** Cloud Function `onRoomDeleted` cascade-deletes subcollections. Cloud Function `aiProxy` processes AI requests with streaming support.

---

### 10. Frontend Framework & Rendering

- [x] **SEO?** Not needed. Fully client-rendered SPA behind authentication.
- [ ] **Offline/PWA?** Not implemented. Firestore has built-in offline persistence but it's not explicitly leveraged. No service worker.
- [x] **SPA vs. SSR?** Pure SPA. Vite builds a static bundle. React Router handles client-side routing. Firebase Hosting serves `index.html` for all paths.

---

### 11. Third-Party Integrations

| Service | Status | Purpose |
|---|---|---|
| Firebase Auth | Implemented | Google OAuth + email/password authentication |
| Cloud Firestore | Implemented | Room data, canvas objects, AI request pipeline |
| Firebase RTDB | Implemented | Cursor sync, presence tracking |
| Firebase Hosting | Deployed | Static hosting with CSP security headers |
| Cloud Functions | Deployed | AI proxy (Claude API), room cleanup |
| Anthropic Claude API | Implemented | AI canvas agent (Haiku + Sonnet with extended thinking) |
| LangSmith | Optional | Cloud Function tracing/observability |

**Pricing cliffs and rate limits?**
- **Firestore**: $0.18/100K writes, $0.06/100K reads. Active rooms generate thousands of writes/minute.
- **RTDB**: Billed by GB stored + GB downloaded + concurrent connections.
- **Firebase Auth**: Free up to 10K MAU for email/password, free for Google sign-in.
- **Anthropic API**: ~$0.80/M input tokens (Haiku), ~$3/M input tokens (Sonnet). Cloud Function has 10 req/min/user rate limit.
- **Cloud Functions**: Free tier covers 2M invocations/month.

---

## Phase 3: Vulnerabilities

### 12. Security

- [x] **Firestore security rules**: Members-only CRUD, validated object types, AI requests scoped to members, only Cloud Functions write AI results.
- [x] **RTDB security rules**: Auth-required read, users can only write their own cursor/presence data.
- [x] **Cloud Function validation**: Command length limits (500 chars), rate limiting (10/min/user), canvas object sanitization, tool name allowlist.
- [x] **Hosting security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP configured for Google OAuth + Firebase SDKs.
- [x] **No secrets in client**: Anthropic API key in Cloud Functions secrets only. Dev mode reads from env var behind `import.meta.env.DEV` guard.
- [ ] **RTDB room isolation**: Cursors/presence readable by any authenticated user (no room membership check at RTDB level). Low risk — data is ephemeral.

---

### 13. Testing Strategy

- [x] **Unit tests**: Vitest with tests for utilities (`colors.test.ts`, `throttle.test.ts`, `zIndex.test.ts`, `canvasPosition.test.ts`) and AI action execution (`aiService.test.ts`).
- [ ] **Integration tests**: No Canvas.tsx integration tests (difficult due to Fabric.js dependency).
- [ ] **E2E tests**: No Playwright/Cypress tests.
- [ ] **Coverage target**: Not formally set.

---

### 14. File Structure & Code Style

- [x] **Clean React convention**: `types/`, `utils/`, `services/`, `hooks/`, `components/` (grouped by domain).
- [x] **Barrel exports**: Each directory has `index.ts`.
- [x] **Naming**: Components PascalCase, hooks `use` prefix, services camelCase, constants UPPER_SNAKE_CASE.
- [x] **Linting**: ESLint + TypeScript ESLint + React hooks rules.
- [ ] **Formatting**: No Prettier config.

---

## Summary

| Area | Status | Notes |
|---|---|---|
| Core features | Complete | Drawing, sync, cursors, presence, auth, AI, undo/redo, templates |
| Backend | Complete | Cloud Functions for AI proxy + room cleanup |
| Security | Good | Firestore rules, RTDB rules, CSP headers, rate limiting |
| Testing | Partial | Utility tests exist; no Canvas or E2E tests |
| CI/CD | Missing | Manual deploys only |
| Observability | Partial | Perf instrumentation in code; optional LangSmith tracing |
| Documentation | Complete | README, ARCHITECTURE.md, CLAUDE.md |
| Deployment | Live | https://colabcanvas-592e5.web.app |
