# CareTrail deployment fixes

Changes are saved in C:/Users/ysaafyloz/Documents/paiflow-app. Push them yourself when ready. Secrets remain ignored.

## Why production currently fails

The published frontend uses https://caretrail-40tp.onrender.com. Live checks found /api/health returns 200 but /api/campaigns returns 404 (Cannot GET /api/campaigns). Render is running an older backend without CareTrail's campaign routes. The deployed frontend also lacks its Supabase build settings. Your ignored local .env files do not upload through Git.

## Render: update the existing service first

- Repository: Rev0710/CareTrail; select the branch you push.
- Root Directory: server
- Runtime: Node
- NODE_VERSION: 22.22.2
- Build Command: npm ci --include=dev && npm run build
- Start Command: npm start
- Health Check Path: /api/health
- CLIENT_ORIGIN: https://caretrailxpaiflow.vercel.app
- SUPABASE_URL and SUPABASE_SECRET_KEY: retain your server/.env values in Render.
- PAIFLOW_API_TOKEN: retain your authorized token in Render only.
- PAIFLOW_ENABLE_PREPARATION: true
- PAIFLOW_ENABLE_SIGNING: true
- PAIFLOW_TEST_USER_EMAIL: your confirmed test-account email. Other accounts cannot use this scoped test deployment.
- PAIFLOW_RECEIVE_CONTRACT: CDUEBIT5ONWFCB7CCRTBWG6YBSINAVH5IYUPMRYZJ7Z3CTFK76FDZYVK

The deployment UUID and 90/10 recipients have defaults matching your supplied values. Do not add duplicate variable names. Let Render provide PORT. Deploy the latest commit. Then open https://caretrail-40tp.onrender.com/api/campaigns: it must return JSON campaigns. A healthy /api/health alone does not prove the new backend is deployed.

## Vercel: restore sign-in settings and redeploy

- Root Directory: client
- Framework: Vite
- Install Command: npm ci
- Build Command: npm run build
- Output Directory: dist

Copy VITE_API_URL, VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from client/.env into Vercel environment variables for Production, and Preview if needed. Set VITE_API_URL to https://caretrail-40tp.onrender.com. Do not commit it or put a backend secret in Vercel's VITE_ settings. Redeploy the latest commit after saving variables. Environment changes apply to a new deployment. The updated build now fails explicitly when required settings are missing.

## Supabase authentication URLs

Site URL: https://caretrailxpaiflow.vercel.app
Allowed redirects:
- https://caretrailxpaiflow.vercel.app/history
- https://caretrailxpaiflow.vercel.app/reset-password
- http://127.0.0.1:5174/history
- http://127.0.0.1:5174/reset-password

Your confirmed test account can sign in. Normal new accounts still require email verification. If Supabase's sending quota is exhausted, configure custom SMTP or wait for the quota to reset; frontend code cannot deliver the confirmation email itself.

## Correct donation flow

CareTrail stores user accounts and campaigns in Supabase. The backend asks Paiflow to prepare the selected test-XLM donation. Freighter first signs a MESSAGE to prove wallet ownership; this does not send XLM. Review the exact 90/10 split and network fee, then approve the separate TRANSACTION in Freighter. Paiflow submits the signed original. CareTrail verifies Stellar's transaction and both payouts before confirming the receipt and counting the campaign's 90% share.

Custom donations support 0.000001–100000 test XLM, up to seven decimal places, subject to balance and fees. Submitted payments are checked automatically for up to one minute; manual checking remains available.

The previous review records and their original transaction hashes were retained. No replacement was prepared or submitted. No successful payment has been established for those records. If Freighter shows a completed donation, copy its public transaction hash for reconciliation. A 10000-XLM wallet balance is not a payment receipt. Do not pay again to resolve an uncertain original.

## Local changes and checks

- Correct Receive → Split → 90/10 validation and RPC simulation mode.
- Custom amounts; Stellar confirmation can succeed despite a delayed Paiflow receipt index.
- Organizer dashboard, campaign selector, create campaign, publish update, contribution reports and preview.
- Verified receipts remain distinct from organizer-reported spending and outcomes.
- Reset-password inbox/completion screens and required deployment settings checks.
- Client build, lint and 7 tests passed; server build and 14 tests passed.
- Existing confirmed account sign-in succeeded; authenticated organizer and campaign APIs returned 200.

A new successful donation still requires your wallet approval. No agent signed or submitted a payment. Hosting settings and redeployments have not been changed by this work.
