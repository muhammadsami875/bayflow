# BayFlow

Multi-tenant auto repair shop management: a customer booking portal, a role-based shop POS and a backend API that enforces the repair workflow as an explicit state machine.

- **Customer portal:** shop directory, 4-step booking wizard, dashboard with live status timeline, estimate approve/reject.
- **Shop POS:** separate views for Owner, Service Advisor, Technician, QC Inspector and Parts Person.
- **Backend:** Next.js route handlers, Prisma + PostgreSQL, JWT cookie auth, tenant isolation on every query.

Bonus features (in-app calling, AI Front Desk) are intentionally not started: the core flow comes first.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 3, Fira Sans / Fira Code, lucide icons |
| Database | PostgreSQL 15+ (hosted, e.g. Neon) via Prisma 6 |
| Auth | bcrypt password hashes, signed JWT in an httpOnly cookie (`jose`) |
| Validation | zod on every endpoint, one consistent error shape |
| Data fetching | SWR + one central API client (`src/lib/api.ts`) |
| Tests | Vitest (state machine) |
| Deploy | Vercel + Neon |

## Prerequisites

- Node.js 20+ (developed on 22)
- npm 10+
- A PostgreSQL database. Free hosted option: [Neon](https://neon.tech) (use both the pooled and the direct connection strings)

## Run locally

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL, DIRECT_URL, JWT_SECRET
npm run db:deploy           # applies migrations
npm run db:seed             # demo shops, teams, inventory, sample bookings
npm run dev                 # http://localhost:3000
```

Useful scripts: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

### Environment variables

See [.env.example](.env.example). Required: `DATABASE_URL` (pooled, used by the app), `DIRECT_URL` (direct, used by `prisma migrate`), `JWT_SECRET` (16+ random characters, required in production). Everything else is optional.

## Demo accounts

Seeded by `npm run db:seed`. Every account uses the password **`Demo@1234`**. They are also listed on the login page, which can fill the form for you.

| Role | Email | Shop |
| --- | --- | --- |
| Owner (2 shops) | sami@bayflow.test | Lahore, Karachi (shop switcher demo) |
| Owner | huraira@bayflow.test | Islamabad Garage Pro |
| Service Advisor | bilal.sa@bayflow.test | Lahore Auto Care |
| Technician | imran.tech@bayflow.test | Lahore Auto Care |
| QC Inspector | sara.qc@bayflow.test | Lahore Auto Care |
| Parts Person | usman.parts@bayflow.test | Lahore Auto Care (also QC Inspector in Karachi) |
| Customer | ahmed@mail.com | estimate waiting for approval |
| Customer | sana@mail.com | booking waiting for the advisor |
| Owner | hassan@bayflow.test | Peshawar Quick Fix (tenant isolation check) |

Other shops have their own staff, for example `hina.sa@`, `faisal.tech@`, `zain.parts@bayflow.test` (Karachi) and `ayesha.sa@`, `kamran.tech@`, `rabia.qc@`, `adeel.parts@bayflow.test` (Islamabad).

### Walkthrough of the full flow

1. As **Ahmed** open "My bookings", review the estimate (PKR 16,100) and approve it.
2. As **Bilal** (SA) assign **Usman** as parts person.
3. As **Usman** the ignition coil is short: create a purchase order, then receive it (try a partial delivery first), then allocate parts.
4. As **Imran** (technician) send the repaired job to QC.
5. As **Sara** (QC) pick it, then either raise an issue (the job returns to Imran) or pass it.
6. As **Bilal** notify the customer, then as **Ahmed** mark it picked up.

Rejected-estimate path: reject as the customer, then as the advisor choose "Revise with technician".

## Deployment (Vercel + Neon)

1. Create a hosted Postgres database (Neon or Supabase) and connect it to the Vercel project. The app accepts either `DATABASE_URL` / `DIRECT_URL`, or the names the integrations create (`POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`); see `src/server/db-url.ts`.
2. In Vercel set `JWT_SECRET` and `NEXT_PUBLIC_APP_URL`.
3. Deploy. `vercel.json` runs `npm run build:vercel`, which applies migrations, seeds the demo data only when the database is empty, then builds the app. Existing data is never wiped.

## Architecture

```
src/
  app/                  pages + route handlers
    api/                REST endpoints (public, /me, /pos/[shopId]/...)
    account/            customer dashboard
    pos/[shopId]/       shop POS, one shell, per-role views
    shops/[id]/book/    booking wizard
  components/           UI primitives, POS views, booking detail
  lib/
    state-machine.ts    statuses, actions, role + status rules (pure, shared, tested)
    validators.ts       zod schemas
    api.ts              central client
  server/
    access.ts           tenant isolation (requireShopAccess)
    auth.ts             sessions, password hashing
    bookings/           create, actions (transitions), role-scoped queries
    inventory.ts        shortage calculation, purchase orders, receiving
    slots.ts            slot generation + atomic capacity reservation
prisma/                 schema, migrations, seed
```

### Design decisions

- **State machine.** `src/lib/state-machine.ts` is the single source of truth: every action lists its allowed source statuses and roles. `performAction` (server) enforces it inside one DB transaction, and the UI reads the same table. Invalid role gives 403, invalid status gives 409. The status update is an optimistic lock (`WHERE status = <current>`), so two concurrent actors cannot both win; this is what makes "first QC inspector to pick locks the job" work.
- **Assignment checks.** Beyond role, technician, parts and QC actions require that the job is assigned to (or picked by) that exact person.
- **Audit log.** Every transition writes a `BookingEvent` (actor, role, from, to, note, time), shown as History on the job and as the customer timeline.
- **Tenant isolation.** A tenant is a shop. Every `/api/pos/[shopId]/*` handler first calls `requireShopAccess`, which resolves ownership or active membership; anyone else gets 404 so ids can't be probed. Every subsequent query also filters by `shopId`, including updates by id (`updateMany` with `shopId`). Customers are global accounts and only ever see their own bookings.
- **Role-scoped reads.** Technicians only see jobs assigned to them, QC sees the shared queue plus what they picked, parts people see jobs assigned to them, SA and Owner see everything. Customers get a stripped DTO (no draft estimates, stock, purchase orders or QC issues).
- **No double booking.** Slots are generated from working hours. Booking atomically increments a counter with `UPDATE ... WHERE booked < capacity` inside the booking transaction; a lost race returns 409.
- **Estimates.** Technician submits lines (parts + labour); the advisor edits (`revision` increments) and sends; a rejection leads to a new `version`. Part lines link to inventory so shortages are computed live; free-text parts become zero-stock catalog items.
- **Inventory.** Receiving increases stock (partial deliveries keep the PO `PARTIALLY_RECEIVED` and the job in `PARTS_ORDERED`); allocation deducts with a guarded update; cancellation releases any allocations and the slot.
- **Auth.** Owners self sign up; staff are created by owners; customers are created at booking (an existing email is reused only if the password matches or the customer is signed in). The user is re-read from the database on every request, so deactivating staff takes effect immediately.
- **Errors.** One shape everywhere: `{ "error": { "code", "message", "details" } }`.

### Not included

In-app calling and the AI Front Desk (bonus), email notifications (in-app bell only), invoices/payments.
