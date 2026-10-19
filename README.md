# RewardRail

A small version of how rewards apps like Freecash pay users: a user starts a game offer, the
game's tracking service sends us a **postback** when the user hits a milestone, and we credit
their wallet — **exactly once**, even when postbacks arrive twice, late, out of order, or forged.

> Work in progress. Phase 1 (setup) is in place; the postback logic is next.
> The full plan and design decisions are in [`CLAUDE.md`](./CLAUDE.md).

## Stack
- **api/** — NestJS, Prisma, PostgreSQL, Jest
- **web/** — React, Vite, TanStack Query
- Postgres runs in Docker

## Run it locally
Requirements: Node 20+, Docker.

```bash
npm install
cp api/.env.example api/.env && npm run db:up
cd api && npx prisma migrate dev --name init && npm run db:seed && cd ..
npm run dev:api        # terminal 1 → http://localhost:3000/health
npm run dev:web        # terminal 2 → http://localhost:5173
```

Run the tests (uses a separate `rewardrail_test` database, wiped on each run):

```bash
npm test
```

> If you created the Docker volume before `docker/init-test-db.sql` existed, the test database
> won't exist yet. Recreate it with `npm run db:down -- -v && npm run db:up`.

## Project layout
```
api/
  prisma/schema.prisma   data model (users, offers, milestones, clicks, postbacks, ledger)
  prisma/seed.ts         demo users and offers
  src/postbacks/         the postback endpoint (signature check, de-duplication, crediting)
  src/clicks/            "Start offer" → creates a clickId
  src/wallet/            balance (derived from the ledger) and history
  test/                  e2e tests against a real Postgres database
web/
  src/pages/             Offer wall, Wallet, Advertiser simulator
docker-compose.yml       Postgres 16
CLAUDE.md                spec, phases, current status
```

## What can break and how it's handled
_To be written in Phase 5: duplicates, concurrent retries, forged postbacks, out-of-order
milestones, crashes mid-credit._
