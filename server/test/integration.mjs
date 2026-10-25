// Opt-in integration checks. Creates only controlled test fixtures and removes them in finally.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Keypair } from "@stellar/stellar-sdk";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
const base = process.env.CARETRAIL_TEST_API ?? "http://127.0.0.1:5052/api";
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const browserEnv = parse(
  readFileSync(new URL("../../client/.env", import.meta.url)),
);
if (!browserEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  throw new Error(
    "Configure a valid frontend publishable key before running the auth integration checks.",
  );
const users = [];
const campaigns = [];
const donations = [];
const updates = [];
const expect = (name, condition) => {
  assert.ok(condition, name);
  console.log(`PASS ${name}`);
};
async function request(path, token, body, method) {
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
async function account() {
  const email = `caretrail-integration-${randomUUID()}@example.com`;
  const password = `${randomUUID()}Aa9!`;
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { caretrail_test: true },
  });
  if (created.error)
    throw new Error("Could not create controlled test account.");
  users.push(created.data.user.id);
  const auth = createClient(
    browserEnv.VITE_SUPABASE_URL,
    browserEnv.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("Controlled test login failed.");
  return {
    id: created.data.user.id,
    token: signedIn.data.session.access_token,
  };
}
try {
  expect(
    "private donations reject anonymous reads",
    (await request("/donations")).status === 401,
  );
  const first = await account();
  const second = await account();
  expect(
    "signed-in account resolves through the API",
    (await request("/me", first.token)).data.id === first.id,
  );
  expect(
    "donor cannot access organizer workspace",
    (await request("/organizer/campaigns", first.token)).status === 403,
  );
  const role = await db
    .from("caretrail_roles")
    .insert({ user_id: first.id, role: "organizer" });
  if (role.error) throw new Error("Could not grant controlled test role.");
  const campaign = await request("/organizer/campaigns", first.token, {
    title: "Controlled integration test campaign",
    summary:
      "Temporary test fixture; automatically removed after integration checks.",
    story:
      "This controlled test campaign is temporary and contains no beneficiary or donation claims. It is automatically removed by the integration script.",
    category: "Education",
    location: "Integration test only",
    goal: "10",
  });
  expect(
    "authorized organizer can publish a campaign",
    campaign.status === 201,
  );
  campaigns.push(campaign.data.campaign.id);
  const campaignId = campaigns[0];
  const key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      request("/donations", first.token, {
        campaignId,
        amount: "1",
        idempotencyKey: key,
      }),
    ),
  );
  const ids = [...new Set(results.map((result) => result.data.donation?.id))];
  expect(
    "concurrent repeated donations preserve one draft",
    ids.length === 1 && Boolean(ids[0]),
  );
  donations.push(ids[0]);
  expect(
    "draft has exact 90/10 stroop amounts",
    results[0].data.donation.campaign_stroops === "9000000" &&
      results[0].data.donation.community_stroops === "1000000",
  );
  expect(
    "reusing a draft key for another amount is rejected",
    (
      await request("/donations", first.token, {
        campaignId,
        amount: "2",
        idempotencyKey: key,
      })
    ).status === 409,
  );
  expect(
    "another donor cannot read the private record",
    (await request(`/donations/${ids[0]}`, second.token)).status === 404,
  );
  expect(
    "another donor cannot read original payment data",
    (await request(`/donations/${ids[0]}/payment`, second.token)).status ===
      404,
  );
  const report = {
    title: "Controlled organizer report",
    body: "Temporary reported activity for the API ownership test. No delivery or spending is claimed.",
    expense: "0",
    outcome: "Integration test only",
  };
  expect(
    "non-owner cannot publish organizer reports",
    (
      await request(
        `/organizer/campaigns/${campaignId}/updates`,
        second.token,
        report,
      )
    ).status === 403,
  );
  const published = await request(
    `/organizer/campaigns/${campaignId}/updates`,
    first.token,
    report,
  );
  expect("campaign owner can publish a report", published.status === 201);
  updates.push(published.data.update.id);
  const detail = await request(`/campaigns/${campaignId}`);
  expect(
    "public report does not change confirmed receipts",
    detail.data.campaign.raised_stroops === "0" &&
      detail.data.updates.length === 1,
  );
  const config = await request("/payments/config");
  if (config.data.preparationEnabled) {
    const wallet = Keypair.random();
    const challenge = await request(
      `/donations/${ids[0]}/wallet-challenge`,
      first.token,
      { walletAddress: wallet.publicKey() },
    );
    expect(
      "wallet ownership challenge is durably saved",
      challenge.status === 200 && Boolean(challenge.data.message),
    );
    const repeated = await request(
      `/donations/${ids[0]}/wallet-challenge`,
      first.token,
      { walletAddress: wallet.publicKey() },
    );
    expect(
      "repeated wallet requests reuse the same original challenge",
      repeated.data.message === challenge.data.message,
    );
    expect(
      "another wallet cannot replace the original wallet",
      (
        await request(`/donations/${ids[0]}/wallet-challenge`, first.token, {
          walletAddress: Keypair.random().publicKey(),
        })
      ).status === 409,
    );
    expect(
      "invalid wallet proof cannot prepare a payment",
      (
        await request(`/donations/${ids[0]}/prepare`, first.token, {
          signature: "invalid",
          reviewAccepted: true,
        })
      ).status === 400,
    );
    const existing = await db
      .from("payment_attempts")
      .select("preparation")
      .eq("donation_id", ids[0])
      .single();
    if (existing.error) throw new Error("Controlled attempt not found.");
    const locked = await db
      .from("payment_attempts")
      .update({
        preparation: { ...existing.data.preparation, state: "preparing" },
      })
      .eq("donation_id", ids[0]);
    if (locked.error)
      throw new Error("Could not create controlled in-progress fixture.");
    const signature = Buffer.from(
      wallet.signMessage(challenge.data.message),
    ).toString("base64");
    expect(
      "in-progress preparation cannot be replaced after interrupted work",
      (
        await request(`/donations/${ids[0]}/prepare`, first.token, {
          signature,
          reviewAccepted: true,
        })
      ).status === 409,
    );
  } else
    console.log(
      "SKIP wallet-challenge API checks: unsigned preparation is disabled.",
    );
} finally {
  let failed = false;
  for (const [table, column, values] of [
    ["campaign_updates", "id", updates],
    ["payment_attempts", "donation_id", donations],
    ["donations", "id", donations],
    ["campaigns", "id", campaigns],
    ["caretrail_roles", "user_id", users],
  ]) {
    if (values.length) {
      const result = await db.from(table).delete().in(column, values);
      if (result.error) {
        failed = true;
        console.error(`Cleanup requires attention for ${table}.`);
      }
    }
  }
  for (const userId of users) {
    const result = await db.auth.admin.deleteUser(userId);
    if (result.error) {
      failed = true;
      console.error("Controlled test account cleanup requires attention.");
    }
  }
  if (failed) throw new Error("Integration fixture cleanup was incomplete.");
  console.log(
    "Controlled integration fixtures removed. No wallet transaction was prepared or submitted.",
  );
}
