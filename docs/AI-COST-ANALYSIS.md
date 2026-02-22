# AI Cost Analysis — Collaborative Canvas

## 1. Development Spend

### AI Tools Used During Development

| Tool | Usage | Estimated Cost |
|---|---|---|
| Claude Code (Claude Opus/Sonnet) | Architecture, code generation, debugging, deployment | Included in Claude Pro/Max subscription |
| Cursor IDE (AI completions) | Code completion, inline edits | Included in Cursor subscription |
| Anthropic API (dev testing) | Testing AI canvas commands during development | ~$5-10 (dev/test usage) |

**Total estimated development AI spend**: ~$25-30/month (subscriptions) + ~$5-10 one-time API testing

---

## 2. Production Cost Breakdown

### Per-Service Pricing

#### Firebase

| Service | Pricing Model | Free Tier |
|---|---|---|
| **Firestore** | $0.18/100K writes, $0.06/100K reads, $0.18/GB stored | 20K writes/day, 50K reads/day, 1GB storage |
| **Realtime Database** | $5/GB stored, $1/GB downloaded | 1GB stored, 10GB/month downloaded |
| **Cloud Functions** | $0.40/M invocations, $0.0000025/GB-s compute | 2M invocations/month, 400K GB-s |
| **Firebase Auth** | Free (email/password + Google OAuth) | 10K MAU |
| **Firebase Hosting** | $0.15/GB stored, $0.15/GB transferred | 10GB stored, 360MB/day transferred |

#### Anthropic Claude API

| Model | Input Tokens | Output Tokens | Typical Request |
|---|---|---|---|
| **Claude Haiku 4.5** | $0.80/M tokens | $4.00/M tokens | ~800 input + ~300 output tokens |
| **Claude Sonnet 4.5** | $3.00/M tokens | $15.00/M tokens | ~1500 input + ~800 output tokens |

---

## 3. Usage Model Assumptions

### Per-User Session Behavior

| Action | Frequency per 30-min session | Firestore Writes | RTDB Data |
|---|---|---|---|
| Create/move/resize objects | ~60 interactions | ~60 writes (debounced) | — |
| Cursor movement | Continuous | — | ~36K updates (20/sec × 30min) |
| Presence heartbeat | Every 3 seconds | — | ~600 updates |
| AI commands (simple) | ~3 commands | 3 writes (request) + 3 writes (result) | — |
| AI commands (complex) | ~1 command | 1 write + ~5 partial writes | — |
| Object sync reads | Continuous (listener) | ~60 reads | — |

### AI Cost Per Command

| Type | Input Cost | Output Cost | Total per Command |
|---|---|---|---|
| Simple (Haiku) | 800 tokens × $0.80/M = $0.00064 | 300 tokens × $4.00/M = $0.0012 | **~$0.002** |
| Complex (Sonnet) | 1500 tokens × $3.00/M = $0.0045 | 800 tokens × $15.00/M = $0.012 | **~$0.017** |

**Blended average** (80% simple, 20% complex): **~$0.005/command**

---

## 4. Cost Projections by Scale

### Assumptions
- Average session: 30 minutes
- Sessions per user per month: 8 (2x/week)
- AI commands per session: 4
- Average room size: 3 concurrent users
- Concurrent rooms: scales with user count

### 100 Monthly Active Users

| Service | Calculation | Monthly Cost |
|---|---|---|
| **Firestore writes** | 100 users × 8 sessions × 70 writes = 56K writes | Free tier (20K/day) |
| **Firestore reads** | 100 users × 8 sessions × 60 reads = 48K reads | Free tier (50K/day) |
| **RTDB bandwidth** | 100 users × 8 sessions × ~2MB = 1.6GB | Free tier (10GB/month) |
| **Cloud Functions** | 100 users × 8 sessions × 4 commands = 3,200 invocations | Free tier |
| **Anthropic API** | 3,200 commands × $0.005 = $16 | **$16** |
| **Hosting** | Static SPA, minimal bandwidth | Free tier |
| **Auth** | 100 MAU | Free tier |
| **Total** | | **~$16/month** |

### 1,000 Monthly Active Users

| Service | Calculation | Monthly Cost |
|---|---|---|
| **Firestore writes** | 1K × 8 × 70 = 560K writes/month (~19K/day) | Free tier (borderline) |
| **Firestore reads** | 1K × 8 × 60 = 480K reads/month (~16K/day) | Free tier |
| **RTDB bandwidth** | 1K × 8 × 2MB = 16GB | **$6** ($1/GB over 10GB free) |
| **Cloud Functions** | 32K invocations | Free tier |
| **Anthropic API** | 32K × $0.005 | **$160** |
| **Hosting** | ~5GB transferred | Free tier |
| **Auth** | 1K MAU | Free tier |
| **Total** | | **~$166/month** |

### 10,000 Monthly Active Users

| Service | Calculation | Monthly Cost |
|---|---|---|
| **Firestore writes** | 10K × 8 × 70 = 5.6M writes | **$10.08** |
| **Firestore reads** | 10K × 8 × 60 = 4.8M reads | **$2.88** |
| **RTDB bandwidth** | 10K × 8 × 2MB = 160GB | **$150** |
| **Cloud Functions** | 320K invocations + compute | **$5** |
| **Anthropic API** | 320K × $0.005 | **$1,600** |
| **Hosting** | ~50GB transferred | **$5** |
| **Auth** | 10K MAU | Free tier |
| **Total** | | **~$1,773/month** |

### 100,000 Monthly Active Users

| Service | Calculation | Monthly Cost |
|---|---|---|
| **Firestore writes** | 100K × 8 × 70 = 56M writes | **$100.80** |
| **Firestore reads** | 100K × 8 × 60 = 48M reads | **$28.80** |
| **RTDB bandwidth** | 100K × 8 × 2MB = 1.6TB | **$1,590** |
| **Cloud Functions** | 3.2M invocations + compute | **$50** |
| **Anthropic API** | 3.2M × $0.005 | **$16,000** |
| **Hosting** | ~500GB transferred | **$50** |
| **Auth** | 100K MAU | **$50** (above free tier) |
| **Total** | | **~$17,870/month** |

---

## 5. Cost Summary Table

| Scale | Firebase | Anthropic API | Total/Month | Cost/User/Month |
|---|---|---|---|---|
| **100 users** | ~$0 (free tier) | $16 | **$16** | **$0.16** |
| **1,000 users** | ~$6 | $160 | **$166** | **$0.17** |
| **10,000 users** | ~$173 | $1,600 | **$1,773** | **$0.18** |
| **100,000 users** | ~$1,870 | $16,000 | **$17,870** | **$0.18** |

---

## 6. Cost Drivers & Optimization Opportunities

### Biggest Cost Driver: Anthropic API (~90% of total at scale)

**Current cost**: ~$0.005/command (blended Haiku + Sonnet)

**Optimization strategies**:
1. **Expand local NLP parser**: Handle more commands locally (zero cost). Currently handles ~15 patterns; could expand to 30+ to cover common commands without API calls
2. **Prompt caching**: Anthropic supports prompt caching — the system prompt (~2K tokens) is identical across requests. Caching reduces input token costs by 90% for cached portions
3. **Response caching**: Cache common AI responses (e.g., "create a red rectangle" always produces the same tool call). Could eliminate 30-50% of API calls
4. **Rate limiting**: Already implemented at 10 req/min/user. Could add daily caps per free-tier user
5. **Batch API**: For non-real-time operations (summarize, cluster), use Anthropic's batch API at 50% discount

### Second Cost Driver: RTDB Bandwidth (cursor sync)

**Current**: ~2MB per user per session (cursor position updates every 50ms)

**Optimization strategies**:
1. **Increase throttle**: 100ms instead of 50ms would halve bandwidth with minimal UX impact
2. **Delta encoding**: Only send position changes, not absolute coordinates
3. **Adaptive throttle**: Throttle more aggressively when >5 users in a room

### Firebase Write Costs

**Current**: Debounced at 100ms per object

**Already optimized**:
- `WriteBatch` for multi-object operations
- Per-ID debounce prevents redundant writes during drag
- Echo prevention avoids unnecessary re-writes

---

## 7. Revenue Threshold Analysis

To break even at each scale (assuming a freemium model):

| Scale | Monthly Cost | Needed Revenue | Viable Pricing |
|---|---|---|---|
| 100 users | $16 | $16 | Free tier viable (below $20) |
| 1,000 users | $166 | $166 | $2/month for 83 paying users (8.3% conversion) |
| 10,000 users | $1,773 | $1,773 | $5/month for 355 paying users (3.5% conversion) |
| 100,000 users | $17,870 | $17,870 | $5/month for 3,574 paying users (3.6% conversion) |

At 5% paid conversion with $5/month pricing:
- 1K users → $250 revenue vs $166 cost (profitable)
- 10K users → $2,500 revenue vs $1,773 cost (profitable)
- 100K users → $25,000 revenue vs $17,870 cost (profitable)
