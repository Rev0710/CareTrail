# CareTrail contributor instructions

- Keep React + Vite in client/, Express + Node in server/, and SQL migrations in supabase/migrations/.
- Use the brand tokens in client/src/CareTrail.css. Cobalt is the main action; lime is exclusively for confirmed payments. Pale blue identifies organizer reports.
- A payment confirmation never verifies an organizer's spending or impact report. Preserve this distinction in UI copy and API responses.
- Testnet only. Never enable mainnet through browser input.
- Prices and split amounts are integer stroop strings calculated with bigint. Campaign share is floor(amount * 9000 / 10000); community gets the remainder. Display the exact split before consent.
- Keep credentials, original XDR, and signed envelopes server-side and out of logs. Do not expose payment_attempts through public responses.
- Verify Supabase access tokens on the server. Check record ownership for every private read/write; organizer roles are granted by the operator, never by signup metadata.
- Paiflow SDK stays in server/. Use Node >=22.22.2 <23 and @paiflow/sdk exactly 0.2.0.
- Do not enable wallet signing until wallet ownership, durable preparation locks, unchanged-envelope comparison, retained signed submission, and independent 90/10 receipt verification are implemented and exercised.
- Timeouts, expiration, NOT_FOUND, reloads, and missing events never authorize an automatic replacement payment.
- Preserve the existing uncommitted client/src/lib/api.ts helper unless a task explicitly replaces it.
- Verify changes with client npm run build / npm run lint and server npm test. Never commit .env files.
