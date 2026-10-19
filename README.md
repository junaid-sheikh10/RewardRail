# RewardRail

A small version of how rewards apps like Freecash pay users, built to show how to do the hard
part reliably.

**The problem.** A game studio pays to acquire users. When a user reaches a milestone ("reach
level 10"), the studio's tracking service calls our server with a **postback** (a server-to-server
HTTP request), and we credit the user's wallet. That sounds easy until you remember that postbacks
are retried, can arrive twice at the same instant, out of order, late, or forged by anyone who
finds the URL, and the one thing you must never do is **pay twice**.

## Try it in two minutes

1. Open **Offers**, press **Start offer** on a game.
2. Open the **Advertiser simulator** and press **Send the same postback 20× at once**.
3. Look at the balance: it went up **once**. The log shows `credited` ×1 and `duplicate` ×19.
4. Try **bad signature** (401, nothing stored), **unknown click** (rejected, kept for inspection),
   **inflated payout** (we pay our own amount) and **out of order** (each milestone pays once).
5. Open the **Wallet** in a second window: a toast appears live when a credit lands.
6. On the Wallet page, use **Missing reward?** to file a claim, then look at the **Support queue**.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    W[React app<br/>offers, wallet, simulator]
  end
  subgraph API["NestJS API"]
    C[clicks]:::m
    P[postbacks<br/>guard + service]:::m
    L[wallet / offers]:::m
    G[Socket.IO gateway]:::m
    D[dev simulator<br/>demo only]:::m
  end
  DB[(PostgreSQL<br/>append-only ledger)]
  MMP[Advertiser / MMP]

  W -- "POST /clicks, GET wallet/offers" --> C & L
  W -- "demo buttons" --> D
  D -- "signs + real HTTP" --> P
  MMP -- "POST /postbacks + X-Signature" --> P
  C & P & L --> DB
  P -- "after commit: wallet.credited" --> G
  G -- "room per user" --> W

  classDef m fill:#eef6f1,stroke:#1f7a4d
```

What happens to one postback (`POST /postbacks`):

```mermaid
sequenceDiagram
  participant M as Advertiser
  participant S as SignatureGuard
  participant V as ValidationPipe
  participant H as PostbacksService
  participant DB as Postgres
  participant G as Socket.IO
  M->>S: body + X-Signature
  S-->>M: 401 if the HMAC over the raw bytes is wrong (nothing stored)
  S->>V: valid signature
  V-->>M: 400 if the body is malformed
  V->>H: typed body
  H->>DB: read click + milestone (decide: credit or reject)
  H->>DB: ONE transaction: insert postback + insert ledger entry
  DB-->>H: or a unique violation, turned into "duplicate"
  H-->>M: 200 {credited | duplicate | rejected}
  H->>G: only after commit: wallet.credited (best effort)
```

## Run it locally

Requirements: Node 20+, Docker.

```bash
npm install
cp api/.env.example api/.env && npm run db:up
npm run db:migrate --workspace api    # applies the migrations (answer the prompt if asked)
npm run db:seed --workspace api       # 2 users, 3 offers
npm run dev:api                       # terminal 1: http://localhost:3000/health
npm run dev:web                       # terminal 2: http://localhost:5173
```

Postgres is published on **port 5433** (not 5432) so it doesn't clash with a Postgres you may
already have running. Change it in `docker-compose.yml` and `api/.env` if you prefer.

### Tests

```bash
npm test
```

This rebuilds a separate `rewardrail_test` database from the migrations (it never touches your dev
data), then runs the tests against **real Postgres**, because only a real database can prove that
the UNIQUE constraints stop double payment under concurrency.

> If you created the Docker volume before `docker/init-test-db.sql` existed, recreate it with
> `npm run db:down -- -v && npm run db:up`.

### Configuration (`api/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `TEST_DATABASE_URL` | Main and test databases. They must differ: tests wipe theirs. |
| `POSTBACK_SECRET` | Shared HMAC secret with the advertiser. The app **refuses to start without it**. |
| `WEB_ORIGIN` | Frontend origin, for CORS (HTTP and Socket.IO). |
| `LLM_API_KEY`, `LLM_MODEL` | Optional. Enables AI claim triage (default model `claude-opus-5-5`). With no key the feature degrades gracefully: claims the rules can't settle wait for a person. |
| `DEMO_MODE` | `true` keeps the `/dev/*` simulator on when `NODE_ENV=production` (public demo only). |
| `PORT` | API port, default 3000. |

## API

| Endpoint | What it does |
|---|---|
| `GET /offers` | Offers with milestones. |
| `GET /users/:id/offers` | Offers plus this user's progress (started? which milestones paid?). |
| `POST /clicks` `{userId, offerId}` | "Start offer". Returns `{clickId}`; the same user and offer always get the same click. |
| `POST /postbacks` | The advertiser endpoint. Signed with `X-Signature: hex(HMAC-SHA256(rawBody, POSTBACK_SECRET))`. |
| `GET /users/:id/wallet` | `{balanceCents, entries}`. The balance is `SUM(amountCents)` of the ledger. |
| `GET /postbacks?clickId=` | Recent postbacks including duplicates and rejections (newest first, max 50). |
| WebSocket `wallet.credited` | `{userId, amountCents, offerTitle, milestoneLabel}`, sent to that user's room after a credit commits. |
| `POST /claims` `{userId, offerId, message}` | "I wasn't paid." Answers from rules, then (optionally) a model, else queues for a person. Never changes a balance. |
| `GET /claims?status=` | The support queue (`needs_human` or `resolved`), newest first. |
| `POST /dev/simulate-postback`, `POST /dev/reset` | Demo only (see Tradeoffs). |

`POST /postbacks` answers **200** for `credited`, `duplicate` **and** `rejected` (the request was
handled; an error code would only make the advertiser retry), **401** for a bad or missing
signature, and **400** for a malformed body from a correctly signed request.

## What can break, and how it's handled

| What goes wrong | How it's handled | Proven by |
|---|---|---|
| **The same postback twice** (retries) | `Postback.eventId` is UNIQUE. We insert first and treat the unique violation as "duplicate"; there is no check-then-insert. | sequential retry test |
| **The same postback 50× at the same instant** | Same mechanism: the database picks one winner. | 50× `Promise.all` test: 1 credit, 49 duplicates |
| **Different `eventId`s for the same milestone** | `LedgerEntry` is UNIQUE on `(userId, milestoneId)`. The loser is stored as `duplicate` / `milestone_already_paid`. | sequential and 50× concurrent tests |
| **Forged postbacks** | HMAC-SHA256 over the **raw bytes**, compared with `timingSafeEqual`. Checked in a guard that runs *before* validation, so unsigned callers learn nothing about our schema. Nothing is stored for them. | 6 guard tests, plus unit tests for the comparison |
| **Replays** | A replay carries a valid signature but an existing `eventId`, so it can't pay twice. We also reject timestamps more than 5 minutes in the **future**. We deliberately do **not** reject old timestamps: late postbacks are real money. | future-timestamp and 1-year-old tests |
| **Out of order** | Each milestone is its own event and pays once, independently. Level 10 before level 5 is fine. | out-of-order test |
| **Unknown click / unknown milestone** | Stored as `rejected` with a reason (kept for "why wasn't I paid?"), never credited, answered with 200. | two rejection tests |
| **Event arrives before the click exists** | A rejected `eventId` is *not* blocked forever: a retry is judged again. The stored row is claimed with `UPDATE … WHERE status = 'rejected'`, so even 20 simultaneous retries credit once. | rejected-retry tests incl. 20× concurrent |
| **Advertiser sends a wrong amount** | We pay `Milestone.payoutCents` from our table, never the payload. A mismatch is logged and the claimed value is kept for audit. | payout mismatch test |
| **Crash mid-credit** | The postback row and the ledger entry are written in **one transaction**: both exist or neither. After a crash the advertiser's retry simply completes the job. | transaction structure; the retry tests |
| **Notification fails or is lost** | The WebSocket event is sent after commit and is fire-and-forget: a failure is logged and never affects the response or the money. The wallet always reads the ledger, so a refresh shows the truth. | throwing-emit test; no-event-before-commit test |
| **Double tap on "Start offer"** | One click per `(userId, offerId)`, enforced by a UNIQUE constraint. | 20× concurrent test |

Two Postgres facts that shaped the code, worth knowing:

- Once a statement fails inside a transaction, the **whole transaction is aborted**. So unique
  violations are caught *outside* the transaction, and the `duplicate` record is written in a
  separate small write.
- Money is **integer cents** everywhere, and the ledger is **append-only**: the balance is
  `SUM(amountCents)`, with no balance column that could drift.

## AI claim triage ("Missing reward?")

A user says "I reached level 10 but wasn't paid." Instead of making support dig through four tables:

1. **Code gathers the facts**: the user's clicks, the advertiser's postbacks (including rejected ones) and the ledger lines for that offer.
2. **Deterministic rules answer first** (free, instant, can't hallucinate): never started the offer, every milestone already paid (quoting the ledger lines), or a rejected report (with the reason in plain words).
3. **Only if still unclear, a model** classifies the claim (`already_credited | not_tracked_yet | likely_fraud | needs_human`) and drafts a reply.
4. **Anything doubtful goes to a person.**

The point of the design is what the model is *not* allowed to do:

| Risk | Control | Proven by |
|---|---|---|
| The model creates or moves money | There is **no code path** from the claims service to the ledger; it only reads facts and writes the `Claim` table. Every claim test asserts the ledger count is unchanged. | claims e2e tests |
| Invalid or hostile model output | Output is **untrusted input**: parsed and validated with **zod** (category, confidence 0..1, reply length). Invalid JSON or the wrong shape → human queue. | 13 parsing cases |
| Overconfident guess | Confidence **below 0.7** → human queue, and the model's reply is not shown. | boundary tests at 0.69 and 0.7 |
| Model down, refusing, slow, or no key | Any failure → human queue; the request still succeeds. No `LLM_API_KEY` → feature disabled, app unaffected. 20 s timeout, one retry. | throwing/disabled tests |
| Prompt injection in the claim text | The message is sent as a **JSON string value** (it cannot close a wrapper and pose as instructions); the system prompt marks it untrusted. The model only sees minimal facts: **no user, click or event ids**. | payload tests |
| Wasted money / abuse | Rules run first so most claims cost nothing. One claim per user and offer (database constraint), message capped at 1000 characters. | 409 and concurrency tests |

Limits worth stating: a model-drafted reply is shown to the user and *can still be wrong* even when
well-formed (it is a draft, labelled as such in the UI, and low-confidence ones never reach the user);
the support queue has no auth in this demo; and the model sees the user's free-text message, which
a real deployment would need to cover in its privacy policy.

## Tradeoffs and known limits

- **No real authentication for users.** The user switcher sends a `userId` that the server trusts,
  so anyone who knows an id can read that wallet or listen to its toasts. Nobody can *create*
  money this way (credits only come from signed postbacks), but a real system would verify a token
  and derive the user from it. Advertisers *are* authenticated, by the HMAC signature.
- **The simulator holds the secret on the server, not in the browser.** `/dev/simulate-postback`
  signs with `POSTBACK_SECRET` and calls our own public endpoint over HTTP, so the demo exercises
  the real code path. It answers 404 when `NODE_ENV=production`. A public demo opts in with
  `DEMO_MODE=true`, which means anyone can create credits for the demo users: acceptable only
  because the database holds nothing but demo data.
- **Postbacks with a bad signature aren't stored**, so you can't see attempted forgeries in
  `GET /postbacks`. That keeps unauthenticated traffic away from the database; a rate-limited
  security log would be the next step.
- **A re-judged rejection overwrites the row.** Retries of a rejected `eventId` update it in place
  (one row per event), so the history of earlier attempts is lost. An `attempts` counter or an
  attempts table would keep it.
- **The toast can be lost** if the server crashes between commit and emit (the money is safe).
- `GET /postbacks` and the user routes are open, like the rest of the user-facing API.

## What I'd do next with more time

- **Outbox pattern** for notifications: write the event in the same transaction as the credit and
  deliver it from a worker, so a crash can't lose it.
- **Cash-outs as negative ledger entries.** The schema already allows it (`offerId`, `milestoneId`
  and `postbackId` are optional), with the balance check done in the same transaction.
- **Fraud scoring** on click-to-install time, device and IP signals, and a hold period before
  payout.
- **Rate limiting** on `/postbacks` and `/clicks`, and a signature-failure log.
- **Real auth** (sessions or JWT) and per-advertiser secrets with rotation.
- **Observability**: structured logs with the `eventId`, metrics for duplicate and rejection rates,
  and alerts on payout-mismatch spikes.
- **Prerequisite milestones** (level 10 only after level 5) as an explicit, per-offer rule with a
  `pending` state, instead of the current independent milestones.

## Deploying

The API needs Node and Postgres; the web app is static files.

1. **API + Postgres** (Render, Railway or Fly): set `DATABASE_URL`, `POSTBACK_SECRET` (a long random
   value), `WEB_ORIGIN` (the web app's URL), `NODE_ENV=production`, and `DEMO_MODE=true` if you
   want the simulator on a public demo. Build with `npm run build --workspace api`; on release run
   `npx prisma migrate deploy` (and `npm run db:seed --workspace api` once for the demo data);
   start with `npm run start --workspace api`.
2. **Web** (Vercel or Netlify): build `npm run build --workspace web` with `VITE_API_URL` set to
   the API's public URL (no trailing slash). Publish `web/dist`.

## Project layout

```
api/
  prisma/               schema, migrations, seed
  src/postbacks/        signature guard, postback service (the core), list endpoint
  src/clicks/           "Start offer"
  src/wallet/           balance (derived from the ledger) and history
  src/offers/           offers and per-user progress
  src/realtime/         Socket.IO gateway (wallet.credited)
  src/claims/           claim triage: facts, rules, model port + Anthropic adapter, queue
  src/dev/              demo-only simulator and reset
  test/                 e2e tests against real Postgres
web/
  src/pages/            Offer wall, Wallet (+ claim form), Advertiser simulator, Support queue
  src/useWalletSocket.ts live toasts
docker-compose.yml      Postgres 16 (+ a test database)
CLAUDE.md               spec, phases, decisions
```

## How AI tools were used

This was built with Claude Code as a pair: the spec and the design decisions (for example the
rules for rejected retries, when to emit notifications, and what the replay window should be) were
settled in a written Q&A first, and each piece was reviewed before the next started. Every safety
claim above has a test, and I checked the important tests by **breaking the code on purpose** and
confirming they fail. That caught real problems in AI-written output:

- A test meant to prove "the event is sent only after the commit" **passed even when the emit was
  moved before the commit**, because it was a race between two connections (and Prisma queries are
  lazy and don't start until awaited). It was rewritten to hold a database lock open, so the
  credit is provably still in progress while we assert that nothing has been sent.
- A wallet test assumed an unordered query returned rows in a fixed order; it passed for a while
  and then failed once Postgres returned them differently.
- A first mutation check didn't even compile and so "proved" nothing; it was redone.
- The model tests use a **fake model** and force `LLM_API_KEY` empty, so the suite can never make a paid call, even if a real key is in `.env`.

Other limits: I have not clicked through every button in a browser session (the API and socket
paths are tested end to end, and the pages were checked with headless screenshots). The real
Anthropic call is unit-tested for the request it builds, and was not exercised against the live API
in this repository's tests.
