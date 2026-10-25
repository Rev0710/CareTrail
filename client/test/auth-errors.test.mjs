import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage } from '../src/lib/auth-errors.mjs';
test('email quotas explain the delivery block without claiming an account was saved', () => { const result = authErrorMessage({ code: 'over_email_send_rate_limit' }); assert.match(result, /Signup could not finish/); assert.match(result, /Repeated attempts will not help/); });
test('login distinguishes CareTrail accounts from dashboard accounts', () => { assert.match(authErrorMessage({ code: 'invalid_credentials' }), /CareTrail account/); assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /dashboard login is a separate/); });
test('unexpected auth errors have a safe fallback', () => assert.match(authErrorMessage(null), /could not complete/));
