import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBrowserEnv } from '../config/public-env.mjs';
test('permits public Supabase configuration', () => validateBrowserEnv({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', VITE_API_URL: 'https://example.onrender.com' }));
test('blocks secret keys even when they use the publishable variable name', () => assert.throws(() => validateBrowserEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' })));
test('blocks legacy service_role credentials in any browser variable', () => { const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'); assert.throws(() => validateBrowserEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.test` })); });
test('blocks Paiflow and other backend credential variable names', () => { assert.throws(() => validateBrowserEnv({ VITE_PAIFLOW_API_TOKEN: 'pfd_example' })); assert.throws(() => validateBrowserEnv({ VITE_SUPABASE_SECRET_KEY: 'example' })); });
