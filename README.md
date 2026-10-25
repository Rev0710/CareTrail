# CareTrail

A React + Vite / Express / Supabase app for transparent testnet giving.

## Current state

Implemented: responsive public campaign screens, filtering/search, Supabase email authentication screens, private donation drafts/history, downloadable records, organizer-owned campaign creation and reports, and database migrations. No donations or outcomes are fabricated.

The payment pipeline is implemented: SEP-53 wallet ownership proof, atomic durable preparation claims, original-XDR preservation, preflight native-XLM payout simulation, original-envelope/signature validation, persist-before-submit, and original-hash recovery with SDK plus independent Stellar RPC evidence. **The approved manual test is enabled only for the designated confirmed account and exactly 1 XLM. The user must review and approve the transaction in Freighter.** Unsigned preparation has its own gate and cannot enable submission. A saved draft is unpaid.

Three generated illustrative campaign images are installed as responsive WebP files. They match the relief, medical, and education subjects from the Figma reference; they are not actual beneficiary photographs. See client/public/images/README.md for the prompts and provenance. Authentication and wallet libraries load separately to reduce the main JavaScript bundle from about 519 KB to about 305 KB.

## First setup

1. Apply `supabase/migrations/202610250001_caretrail.sql` in the Supabase SQL editor. It creates new CareTrail tables and three explicitly labelled sample campaigns, with zero donations and no reported outcomes. Review the migration before applying it. No existing tables are dropped.
2. Keep the existing server/.env credentials. Compare its keys with server/.env.example.
3. In client/.env, set VITE_API_URL, VITE_SUPABASE_URL, and VITE_SUPABASE_PUBLISHABLE_KEY using client/.env.example. Use the public/publishable key in the client, never the secret/service-role key.
4. Configure Supabase Auth Site URL and allowed redirect URLs for `/history` and `/reset-password`, on localhost and the Vercel production origin. Email confirmation and reset links use these routes.
5. Run npm ci in client/ and server/. Use Node >=22.22.2 <23 for the backend, matching the installed Paiflow SDK.
6. Start server with npm run dev and client with npm run dev in separate terminals.

## Organizer permission

Signup creates a donor account. After verifying an organizer, the project operator can grant access in Supabase:

```sql
insert into public.caretrail_roles (user_id, role)
values ('REPLACE_WITH_AUTH_USER_UUID', 'organizer')
on conflict (user_id) do update set role = excluded.role;
```

The API checks role and campaign ownership. Existing sample campaigns have no organizer and cannot be edited until an operator assigns one. Users cannot grant themselves roles through signup metadata.

## Deploy

Vercel: root client; install npm ci; build npm run build; output dist. Set VITE_API_URL to the Render origin, and set the two public Supabase variables. Redeploy after environment changes. client/vercel.json provides SPA route fallback.

Render: Node web service; root server; build npm ci --include=dev && npm run build; start npm start; health path /api/health. Set NODE_VERSION=22.22.2, SUPABASE_URL, SUPABASE_SECRET_KEY, and CLIENT_ORIGIN to the exact Vercel origin. Let Render set PORT. Do not add duplicate environment variable names.

## Payment configuration supplied by the owner

- Network: Stellar Testnet; asset: native XLM.
- Deployment: 9c8b80fa-ae3b-4685-8b6e-d2e8115657c2.
- Campaign 90%: GC5LWDPOB7AGJ7APMFTHTGRASVQG32KTLCYLQRIYTKPNTXXAY4QQETXQ.
- Community 10%: GA6PPOWKO4TZKFLQUD4OSOCEYKFMDZ54BHNYBB42BLSWN5PKGRS2UPHP.

Address format validation does not prove deployment configuration, balances, funding, ownership, or live payouts. Add the authorized Paiflow developer token only to the backend environment. The protected organizer payment-health endpoint reads SDK capabilities, but does not certify the configured split.

## Integrity rules

- Blue is the main action. Cloud white is the ground. Lime is reserved for confirmed payment badges; pale blue identifies organizer reports.
- A confirmed transfer does not establish delivery, spending, or impact. Organizer reports remain clearly labelled.
- All money uses integer stroop strings and bigint arithmetic. The campaign receives floor(amount * 9000 / 10000); the community receives the remainder. Network fees are separate.
- Retain original payment attempts. Never automatically prepare a replacement after timeout, expiry, missing events, or NOT_FOUND.
- Supabase credentials stay server-side; private tables are inaccessible to anonymous/authenticated direct table access. The backend checks access-token validity and record ownership.

## Verification

- client/: npm run build; npm run lint.
- server/: npm test (includes build, exact-money and payment-verification tests).
- GET /api/health/database checks the existing connection_check row.
- GET /api/campaigns checks new database tables.
- Unauthenticated GET /api/donations must return 401.
- Full auth/organizer/draft tests require the migration, public Supabase configuration, and a test account.

Current verification: 14 backend unit tests, 7 frontend credential/auth-message tests, and 17 live API integration assertions passed. API checks used controlled temporary accounts, campaigns, reports, and drafts, all removed afterward. The integration script is server/test/integration.mjs and must be run explicitly against a local test server; it is not part of npm test. It never prepares or submits an on-chain transaction. The wallet-challenge checks use unsigned preparation enabled and submission disabled.

Local preview: http://127.0.0.1:5174, with a Node 22.22.2 backend on port 5052. PAIFLOW_ENABLE_PREPARATION and PAIFLOW_ENABLE_SIGNING are separate flags; submission is restricted to the approved account, with custom donation amounts from 0.000001 to 100000 XLM. Production environment changes and deployment have not been performed. No additional database migration is needed for the payment pipeline; it uses the existing private payment_attempts JSON record.

At 1,000 confirmed donations in an aggregate query, the API fails closed rather than risking an understated total. Replace this bounded query with a database aggregate before scaling. Campaign lists currently cap at 100. Add distributed rate limiting, production audit logging, and broader integration coverage before a public launch. This is a testnet development foundation, not a completed payment service.

## AI collaboration

AGENTS.md records architecture, brand, security, and payment invariants. TypeScript domain models and the isolated money module support automated tooling. An in-app AI assistant is not included; its purpose and data access still need to be specified.
