# RewardRail — mini rewarded user acquisition platform

## Why this project exists
This is a portfolio project for an application to **Almedia** (Berlin), the company behind
**Freecash**, for the **Junior Engineer — TypeScript track** (frontend + backend, interest in AI).

Almedia's core business: game/app studios pay to acquire users; Freecash shows users "offers"
(e.g. "install this game, reach level 10, earn $2.50"); when the advertiser reports the milestone
via a **postback**, the user is credited and can cash out.

The goal is to show, in their stack, that I understand this problem space and can ship
a reliable full-stack TypeScript app that handles the things that break in production:
duplicate, fake, late and out-of-order postbacks — and never pays twice.

Their job posting values: owning problems end to end, thinking about failure modes before they
happen, finding root causes, and using AI tools while still checking the output.
Everything in this project should demonstrate those.

## Current status — read this first
**Phase 1 (setup) is written but NOT yet verified.** The scaffold was created in a chat session
where npm packages could not be installed, so nothing has been installed, compiled or run yet.

**Your first task, before anything else:**
1. `npm install` at the repo root (npm workspaces: `api`, `web`).
2. `cp api/.env.example api/.env`, then `npm run db:up` (Postgres via Docker).
3. From `api/`: `npx prisma migrate dev --name init` (creates the first migration), then `npm run db:seed`.
4. `npm run dev:api` → `GET http://localhost:3000/health` and `/offers` work.
5. `npm run dev:web` → http://localhost:5173 shows the three seeded offers.
6. `npm test` → the Phase 1 tests in `api/test/health.e2e-spec.ts` pass (the rest are `it.todo`).
7. Run `npm run typecheck` in both `api/` and `web/`.
Fix anything that fails (package versions, config), explain the fix, then tell me Phase 1 is verified
and update this section.

**Already in place:**
- Root: npm workspaces, `docker-compose.yml` (Postgres 16 + a `rewardrail_test` database), `.gitignore`.
- `api/`: NestJS 11 app with `rawBody: true` (needed for HMAC), global ValidationPipe, CORS;
  Prisma 6 schema for the full data model (`api/prisma/schema.prisma`); idempotent seed with fixed ids
  (`user_alice`, `user_bob`, `offer_dragon`, `offer_farm`, `offer_gems`);
  working `GET /health` and `GET /offers`; e2e test helpers (`test/helpers/app.ts`: `createTestApp`, `resetDb`);
  a pre-test script that rebuilds the test DB from migrations.
- `web/`: React 19 + Vite + TanStack Query + React Router; nav and a user switcher; `/api` proxied to
  `localhost:3000` (and `/socket.io` ready for Phase 3); Offer wall renders real offers from the API.

**Stubs waiting for Phase 2** (each has a numbered TODO comment explaining what to do):
- `api/src/postbacks/signature.ts` — `signBody`, `isValidSignature` (timingSafeEqual).
- `api/src/postbacks/postbacks.service.ts` — `handle()` (the core) and `list()`.
- `api/src/clicks/clicks.service.ts` — `create()`.
- `api/src/wallet/wallet.service.ts` — `getWallet()`.
- `api/src/offers/offers.service.ts` — `findAllForUser()`.
- `api/test/postbacks.e2e-spec.ts` — the required tests as `it.todo`.
Stubs throw 501 Not Implemented until done.

**Phase 4 stubs:** `web/src/pages/Wallet.tsx`, `web/src/pages/DemoPanel.tsx`, the "Start offer" button
in `OfferWall.tsx`, and missing calls in `web/src/api.ts`.

**Not added yet:** Socket.IO packages (Phase 3), zod and an LLM SDK (Phase 6).

**Decisions already made (I should be able to explain these):**
- `Postback.clickId` is a plain string, not a foreign key, so postbacks for unknown clicks can still be stored as rejected.
- `LedgerEntry.offerId / milestoneId / postbackId` are optional so future cash-outs (negative entries) fit
  the same table; Postgres treats NULLs as distinct in UNIQUE constraints.
- `POST /postbacks` answers 200 for credited/duplicate/rejected (otherwise the advertiser keeps retrying), 401 for bad signatures.
- The ValidationPipe runs before the signature check, so malformed bodies get 400 first — open to change.
- Tests use a real Postgres test DB that is reset before each run; `TEST_DATABASE_URL` must differ from `DATABASE_URL`.

**Next:** Phase 2 — backend core. I want to write the core postback logic myself with your help:
guide me, review my code, and explain tradeoffs rather than writing all of it for me, unless I ask you to.

## How to work with me (Claude Code)
- I must be able to explain and defend every design decision in an interview.
  For each non-trivial piece, briefly explain **why** it's done that way (in chat or a code comment).
- Work in small, reviewable steps. After each phase, stop, summarize what was built, and how to run it.
- Prefer simple, readable code over clever code. No unnecessary abstractions.
- Write tests alongside the logic, not at the end.
- Never fake results: if a test fails, find the root cause.

## Core concept: postbacks
A postback is a server-to-server HTTP call from the advertiser's tracking service (an MMP such as
AppsFlyer or Adjust) to our server, saying "this user reached this event".

Flow:
1. User clicks an offer → we create a `click` with a unique `clickId` linked to the user.
2. User installs/plays the game (simulated in this project).
3. MMP calls our postback URL with `clickId`, `eventId`, `event`, `payoutCents`, and a signature.
4. We verify, de-duplicate, credit the ledger, and notify the user's screen live.

Things that go wrong (must all be handled and tested):
- **Duplicates** — MMPs retry; the same `eventId` can arrive many times, even concurrently.
- **Fakes** — anyone could call the URL; requests must carry a valid HMAC signature.
- **Out of order** — level 10 may arrive before level 5; each milestone pays once, independently.
- **Unknown click / unknown milestone** — reject cleanly, store for inspection, never credit.
- **Late arrivals** — accept and credit whenever they come.

## Tech stack
- Monorepo with two apps: `api/` and `web/` (pnpm or npm workspaces).
- **api/**: Node 20+, TypeScript, **NestJS**, **Prisma** + **PostgreSQL**, **Jest** (+ supertest),
  **Socket.IO** (via `@nestjs/websockets`), `class-validator` for DTOs.
- **web/**: **React + Vite + TypeScript**, TanStack Query for data fetching, Socket.IO client,
  simple styling (Tailwind or plain CSS modules).
- `docker-compose.yml` for Postgres (and optionally the api).
- Environment config via `.env` with an `.env.example` committed.

## Data model (Prisma)
- `User` — id, displayName, createdAt
- `Offer` — id, title, description, imageUrl?, createdAt
- `Milestone` — id, offerId, key (e.g. `level_5`), label, payoutCents, unique(offerId, key)
- `Click` — id, clickId (unique), userId, offerId, createdAt
- `Postback` — id, eventId (**unique**), clickId, eventKey, payoutCents, rawPayload (json),
  status (`credited` | `duplicate` | `rejected`), rejectReason?, receivedAt
- `LedgerEntry` — id, userId, amountCents (int, can be negative later for cash-outs),
  type (`reward`), offerId, milestoneId, postbackId (**unique**), createdAt,
  plus unique(userId, milestoneId) so a milestone can only ever pay a user once.

Rules:
- Money is stored as **integer cents**, never floats.
- The ledger is **append-only**. Balance = SUM(amountCents) for the user. There is no mutable balance column.
- Database UNIQUE constraints are the final safety net against double payment, even under races.

## API (NestJS)
- `GET  /offers` — list offers with milestones
- `GET  /users/:id/offers` — offers with this user's progress (which milestones are credited)
- `POST /clicks` — body `{ userId, offerId }` → returns `{ clickId }`
- `POST /postbacks` — the MMP endpoint (see contract below)
- `GET  /users/:id/wallet` — `{ balanceCents, entries: [...] }`
- `GET  /postbacks?clickId=` — recent postbacks incl. duplicates/rejections (for the demo panel)
- WebSocket: on successful credit, emit `wallet.credited` `{ userId, amountCents, offerTitle, milestoneLabel }`
  to that user's room.

### Postback contract
Request body (JSON):
```json
{ "eventId": "evt_001", "clickId": "clk_abc123", "event": "level_10", "payoutCents": 250, "timestamp": 1760000000 }
```
Header: `X-Signature: <hex HMAC-SHA256 of the raw body using POSTBACK_SECRET>`

Handling, in one DB transaction:
1. Verify signature (constant-time compare) → 401 if invalid, nothing stored as credited.
2. Optionally reject timestamps far in the future / too old (replay protection) → document the choice.
3. Look up click → unknown → store postback as `rejected` (`unknown_click`), 200/422 (document choice).
4. Look up milestone for (offer, event) → unknown → `rejected` (`unknown_milestone`).
5. Insert postback by unique `eventId`; if it already exists → return `{ status: "duplicate" }`.
6. Insert ledger entry; a unique violation (P2002) → treat as duplicate, not an error.
7. After commit, emit the WebSocket event.
Respond fast with `{ status: "credited" | "duplicate" | "rejected", reason? }`.
Use the payout from our Milestone table, not the payload (don't trust the caller for amounts) —
log a mismatch if they differ.

## Frontend (web/) — three screens
1. **Offer wall** — cards for each offer with milestones, progress, and a "Start offer" button
   (creates a click). Seeded demo user; no real auth needed (a user switcher is fine).
2. **Wallet** — balance and transaction history (what, when, which offer/milestone).
   Live toast "You earned $2.50 — Dragon Quest, Level 10" via WebSocket.
3. **Advertiser simulator / demo panel** — for a started offer, buttons to:
   - send a valid postback for a chosen milestone
   - **send the same postback 20× concurrently** (shows balance increases only once)
   - send milestones out of order
   - send a postback with a bad signature
   Shows a live log of results (credited / duplicate / rejected + reason).
   The simulator signs requests on the server side or via a small dev-only endpoint —
   never expose the real secret in production builds; document this tradeoff.

The demo panel is the most important screen: it makes the backend's reliability visible in 30 seconds.

## Tests (Jest) — must exist and pass
- valid postback → exactly one ledger entry, correct balance
- same postback 50× **concurrently** (`Promise.all`) → exactly one ledger entry
- different eventIds for the same milestone → still paid once
- out-of-order milestones → each paid once
- bad signature → 401, no ledger entry
- unknown click / unknown milestone → rejected, no ledger entry
- payout in payload differs from milestone → milestone payout used
Use a real Postgres test database (docker), not mocks, for the concurrency tests.

## Phases (stop and summarize after each)
1. **Setup** — monorepo, docker-compose Postgres, NestJS app, Prisma schema + migration, seed
   (2 users, 3 offers with 2–3 milestones each), `.env.example`, health endpoint.
2. **Backend core** — clicks, postbacks (full contract above), wallet, tests passing.
3. **Realtime** — Socket.IO gateway emitting credits.
4. **Frontend** — the three screens wired to the API.
5. **Polish & deploy** — README, seed script, deploy (e.g. Railway/Fly/Render for api + Postgres,
   Vercel/Netlify for web), short demo video script.
6. **AI claim triage (stretch)** — see below. The app must be fully working without this phase.

## Phase 6 — AI "missing reward" claim triage (stretch)
- `POST /claims` `{ userId, offerId, message }` — user says "I reached level 10 but wasn't paid".
- Step 1, code gathers facts: user's clicks, postbacks (incl. rejected), ledger entries for that offer.
- Step 2, deterministic rules first (no LLM): already credited → answer with the ledger line;
  no click → "offer was never started"; rejected postback → explain reason.
- Step 3, only if unresolved: call an LLM with the claim + facts, require strict JSON validated by **zod**:
  `{ category: "already_credited" | "not_tracked_yet" | "likely_fraud" | "needs_human", confidence: 0..1, reply: string }`
- Invalid JSON, or confidence < 0.7 → `needs_human` queue.
- **The LLM never credits money or writes to the ledger.** It only classifies and drafts replies.
- Frontend: a "Missing reward?" form on the wallet page, and a simple admin list of claims.
- Provider key via env (`LLM_API_KEY`); app must run if it's absent (feature disabled gracefully).

## README must include
- The problem in two sentences (what a postback is and why it's hard).
- Architecture diagram (simple), how to run locally in < 5 commands.
- A **"What can break and how it's handled"** section (duplicates, races, fakes, ordering, crashes mid-credit).
- Tradeoffs and what I'd do next with more time (e.g. outbox pattern for events, fraud scoring,
  cash-outs as negative ledger entries, rate limiting, observability).
- A short note on how AI tools were used and where output was corrected.
