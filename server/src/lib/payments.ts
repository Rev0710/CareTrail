import { randomUUID } from "node:crypto";
import { Paiflow, type ApiResponse, type ExecutePrepared } from "@paiflow/sdk";
import { StrKey, rpc } from "@stellar/stellar-sdk";
import { supabaseAdmin as db } from "./supabase.js";
import {
  assertOriginalEnvelope,
  assertDepositInvocation,
  authorizeManualTest,
  originalTransaction,
  TESTNET,
  transfersFromEvents,
  verifyPayouts,
  verifyWalletProof,
  type ExpectedPayment,
} from "./payment-verification.js";

export class PaymentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Snapshot = {
  state:
    | "challenge"
    | "preparing"
    | "prepared"
    | "submitting"
    | "pending"
    | "confirmed"
    | "failed"
    | "needs_review";
  challenge: string;
  challengeExpiresAt: string;
  origin: string;
  expected: ExpectedPayment;
  sdk?: ApiResponse<ExecutePrepared>;
  feeStroops?: string;
};
type Attempt = {
  donation_id: string;
  deployment_id: string;
  wallet_address: string;
  unsigned_xdr: string | null;
  signed_xdr: string | null;
  tx_hash: string | null;
  history_request_id: string | null;
  preparation: Snapshot;
  receipt: unknown;
};
type Order = {
  id: string;
  user_id: string;
  amount_stroops: string;
  campaign_stroops: string;
  community_stroops: string;
  status: string;
  network: string;
  tx_hash: string | null;
};
const chain = new rpc.Server("https://soroban-testnet.stellar.org", {
  timeout: 20000,
  allowHttp: false,
});
const check = (error: unknown) => {
  if (error)
    throw new PaymentError(
      503,
      "The payment record could not be saved or loaded. No replacement payment was created.",
    );
};
function settings() {
  const value = {
    origin: process.env.PAIFLOW_BASE_URL ?? "https://beta.app.paiflow.xyz",
    deployment:
      process.env.PAIFLOW_DEPLOYMENT_ID ??
      "9c8b80fa-ae3b-4685-8b6e-d2e8115657c2",
    token: process.env.PAIFLOW_API_TOKEN,
    receive: process.env.PAIFLOW_RECEIVE_CONTRACT ?? 'CDUEBIT5ONWFCB7CCRTBWG6YBSINAVH5IYUPMRYZJ7Z3CTFK76FDZYVK',
    campaign:
      process.env.PAIFLOW_CAMPAIGN_RECIPIENT ??
      "GC5LWDPOB7AGJ7APMFTHTGRASVQG32KTLCYLQRIYTKPNTXXAY4QQETXQ",
    community:
      process.env.PAIFLOW_COMMUNITY_RECIPIENT ??
      "GA6PPOWKO4TZKFLQUD4OSOCEYKFMDZ54BHNYBB42BLSWN5PKGRS2UPHP",
  };
  if (
    !StrKey.isValidEd25519PublicKey(value.campaign) ||
    !StrKey.isValidEd25519PublicKey(value.community) ||
    value.campaign === value.community
  )
    throw new PaymentError(
      503,
      "Payment recipients are not configured correctly.",
    );
  return value;
}
export function publicPaymentConfig() {
  const cfg = settings();
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  const supportedRuntime =
    major === 22 && (minor > 22 || (minor === 22 && patch >= 2));
  return {
    network: "testnet",
    asset: "XLM",
    campaignBps: 9000,
    communityBps: 1000,
    deploymentId: cfg.deployment,
    campaignRecipient: cfg.campaign,
    communityRecipient: cfg.community,
    preparationEnabled: Boolean(
      cfg.token &&
      supportedRuntime &&
      process.env.PAIFLOW_ENABLE_PREPARATION === "true",
    ),
    signingEnabled: Boolean(
      cfg.token &&
      supportedRuntime &&
      process.env.PAIFLOW_ENABLE_SIGNING === "true" &&
      Boolean(process.env.PAIFLOW_TEST_USER_EMAIL),
    ),
    amountLimits: { minXlm: '0.000001', maxXlm: '100000', decimalPlaces: 7 },
    reason: !cfg.token
      ? "The backend Paiflow credential is not configured."
      : !supportedRuntime
        ? "The payment backend requires Node 22."
        : process.env.PAIFLOW_ENABLE_SIGNING !== "true"
          ? "Payment submission is disabled. You can retain and review the original record without transferring funds."
          : null,
  };
}
function requireEnabled() {
  const cfg = publicPaymentConfig();
  if (!cfg.signingEnabled)
    throw new PaymentError(
      503,
      cfg.reason ?? "Testnet signing is unavailable.",
    );
}
function requirePreparationEnabled() {
  if (!publicPaymentConfig().preparationEnabled)
    throw new PaymentError(
      503,
      "Unsigned payment preparation is not enabled. Your draft remains saved.",
    );
}
async function requireManualTestScope(order: Order, userId: string) {
  if (process.env.PAIFLOW_ENABLE_SIGNING !== 'true') return;
  const account = await db.auth.admin.getUserById(userId);
  if (account.error || !account.data.user?.email_confirmed_at) throw new PaymentError(403, 'Confirm the approved CareTrail test account before continuing.');
  try { authorizeManualTest(account.data.user.email, process.env.PAIFLOW_TEST_USER_EMAIL, order.amount_stroops); }
  catch { throw new PaymentError(403, 'This account is not authorized for the configured testnet deployment.'); }
}
function flowFor(attempt?: Attempt) {
  const cfg = settings();
  if (!cfg.token)
    throw new PaymentError(
      503,
      "The backend Paiflow credential is not configured.",
    );
  if (
    attempt &&
    (attempt.deployment_id !== cfg.deployment ||
      attempt.preparation.origin !== cfg.origin)
  )
    throw new PaymentError(
      409,
      "Restore credentials for this original deployment before recovering its payment.",
    );
  return new Paiflow({
    baseUrl: cfg.origin,
    token: cfg.token,
    timeoutMs: 20000,
  }).deployment(attempt?.deployment_id ?? cfg.deployment);
}
async function orderFor(id: string, userId: string) {
  const { data, error } = await db
    .from("donations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  check(error);
  if (!data) throw new PaymentError(404, "Donation not found.");
  if (data.network !== "testnet")
    throw new PaymentError(409, "This payment is not a Stellar Testnet order.");
  return data as Order;
}
async function attemptFor(id: string) {
  const { data, error } = await db
    .from("payment_attempts")
    .select("*")
    .eq("donation_id", id)
    .maybeSingle();
  check(error);
  return data as Attempt | null;
}
function publicAttempt(attempt: Attempt | null) {
  if (!attempt) return { state: "draft" };
  const p = attempt.preparation;
  return {
    state: p.state,
    walletAddress: attempt.wallet_address,
    txHash: attempt.tx_hash,
    signedSubmissionSaved: Boolean(attempt.signed_xdr),
    network: "testnet",
    networkPassphrase: TESTNET,
    unsignedXdr: p.state === "prepared" ? attempt.unsigned_xdr : null,
    expiresAt: p.sdk?.data.expiresAt,
    feeStroops: p.feeStroops,
    campaignRecipient: p.expected.campaignRecipient,
    communityRecipient: p.expected.communityRecipient,
    campaignAmount: p.expected.campaignAmount,
    communityAmount: p.expected.communityAmount,
    deploymentId: attempt.deployment_id,
  };
}
export async function readPayment(id: string, userId: string) {
  await orderFor(id, userId);
  return publicAttempt(await attemptFor(id));
}
export async function walletChallenge(
  id: string,
  userId: string,
  wallet: unknown,
) {
  requirePreparationEnabled();
  const order = await orderFor(id, userId);
  const cfg = settings();
  await requireManualTestScope(order, userId);
  if (
    typeof wallet !== "string" ||
    !StrKey.isValidEd25519PublicKey(wallet) ||
    [cfg.campaign, cfg.community].includes(wallet)
  )
    throw new PaymentError(
      400,
      "Connect a valid customer wallet that differs from both recipients.",
    );
  let attempt = await attemptFor(id);
  if (attempt && attempt.wallet_address !== wallet)
    throw new PaymentError(409, "This record is bound to its original wallet.");
  if (attempt && attempt.preparation.state !== "challenge")
    return { ...publicAttempt(attempt), message: null };
  const expires = new Date(Date.now() + 5 * 60_000).toISOString();
  const message = `CareTrail wallet ownership verification\nOrigin: ${process.env.CLIENT_ORIGIN ?? "http://localhost:5173"}\nAccount: ${userId}\nDonation: ${id}\nWallet: ${wallet}\nNetwork: Stellar Testnet\nNonce: ${randomUUID()}\nExpires: ${expires}\nThis message does not authorize a payment.`;
  const snapshot: Snapshot = {
    state: "challenge",
    challenge: message,
    challengeExpiresAt: expires,
    origin: cfg.origin,
    expected: {
      wallet,
      amount: order.amount_stroops,
      campaignAmount: order.campaign_stroops,
      communityAmount: order.community_stroops,
      campaignRecipient: cfg.campaign,
      communityRecipient: cfg.community,
      triggerContracts: [],
      deploymentContracts: [],
    },
  };
  if (!attempt) {
    const { error } = await db
      .from("payment_attempts")
      .insert({
        donation_id: id,
        deployment_id: cfg.deployment,
        wallet_address: wallet,
        preparation: snapshot,
      });
    if (error && error.code !== "23505") check(error);
    attempt = await attemptFor(id);
  } else if (Date.parse(attempt.preparation.challengeExpiresAt) <= Date.now()) {
    // This renews only an unprepared ownership message; no transaction has been requested.
    const { error } = await db
      .from("payment_attempts")
      .update({ preparation: snapshot })
      .eq("donation_id", id)
      .eq("preparation->>state", "challenge")
      .eq("preparation->>challenge", attempt.preparation.challenge);
    check(error);
    attempt = await attemptFor(id);
  }
  if (!attempt || attempt.wallet_address !== wallet)
    throw new PaymentError(
      409,
      "The original wallet record changed. Reload this donation.",
    );
  return {
    ...publicAttempt(attempt),
    message:
      attempt.preparation.state === "challenge"
        ? attempt.preparation.challenge
        : null,
    challengeExpiresAt: attempt.preparation.challengeExpiresAt,
  };
}
export async function preparePayment(
  id: string,
  userId: string,
  signature: unknown,
  consent: unknown,
) {
  requirePreparationEnabled();
  const order = await orderFor(id, userId);
  await requireManualTestScope(order, userId);
  let attempt = await attemptFor(id);
  if (!attempt)
    throw new PaymentError(
      409,
      "Verify your wallet before preparing a payment.",
    );
  if (attempt.unsigned_xdr) return publicAttempt(attempt);
  if (attempt.preparation.state !== "challenge")
    throw new PaymentError(
      409,
      "The original preparation is being recovered. Do not start a replacement payment.",
    );
  if (consent !== true || typeof signature !== "string")
    throw new PaymentError(
      400,
      "Review the testnet payment and both recipients before continuing.",
    );
  try {
    verifyWalletProof(
      attempt.wallet_address,
      attempt.preparation.challenge,
      signature,
      attempt.preparation.challengeExpiresAt,
    );
  } catch {
    throw new PaymentError(
      400,
      "Wallet ownership proof is invalid or expired. Connect and verify again.",
    );
  }
  const snapshot: Snapshot = { ...attempt.preparation, state: "preparing" };
  const claimed = await db
    .from("payment_attempts")
    .update({ preparation: snapshot })
    .eq("donation_id", id)
    .eq("preparation->>state", "challenge")
    .eq("preparation->>challenge", attempt.preparation.challenge)
    .select()
    .maybeSingle();
  check(claimed.error);
  if (!claimed.data)
    throw new PaymentError(
      409,
      "A preparation already exists or is in progress. Reload this original record.",
    );
  attempt = claimed.data as Attempt;
  try {
    const flow = flowFor(attempt);
    const { data: capabilities } = await flow.capabilities.get();
    if (
      capabilities.network !== "testnet" ||
      capabilities.inputAsset?.kind !== "native" ||
      capabilities.triggerType !== "deposit" ||
      capabilities.operations.execute.status === "unsupported"
    )
      throw new Error(
        "The deployment is not an executable native-XLM testnet Receive flow.",
      );
    const { data: balances } = await flow.balances.get();
    const receive = settings().receive;
    snapshot.expected = {
      ...snapshot.expected,
      triggerContracts: [receive],
      deploymentContracts: [...new Set([receive, ...balances.nodes.map((node) => node.contractAddress)])],
    };
    if (!snapshot.expected.deploymentContracts.length)
      throw new Error("The deployment contracts could not be identified.");
    const sdk = await flow.execute.prepare({
      from: attempt.wallet_address,
      amount: snapshot.expected.amount,
    });
    snapshot.sdk = sdk;
    const preserved = await db.from('payment_attempts').update({ preparation: snapshot, unsigned_xdr: sdk.data.xdr, history_request_id: sdk.metadata.historyRequestId ?? null }).eq('donation_id', id).eq('preparation->>state', 'preparing');
    check(preserved.error);
    const tx = originalTransaction(sdk.data.xdr);
    if (tx.source !== attempt.wallet_address)
      throw new Error(
        "The original transaction source is not the verified customer.",
      );
    assertDepositInvocation(tx, receive, attempt.wallet_address, snapshot.expected.amount);
    if (
      sdk.data.network !== "testnet" ||
      sdk.data.networkPassphrase !== TESTNET
    )
      throw new Error("Unexpected prepared network.");
    snapshot.feeStroops = tx.fee;
    const txHash = Buffer.from(tx.hash()).toString("hex");
    // Retain the exact original before additional reads or any wallet transaction signing.
    const saved = await db
      .from("payment_attempts")
      .update({
        preparation: snapshot,
        unsigned_xdr: sdk.data.xdr,
        tx_hash: txHash,
        history_request_id: sdk.metadata.historyRequestId ?? null,
      })
      .eq("donation_id", id)
      .eq("preparation->>state", "preparing");
    check(saved.error);
    const network = await chain.getNetwork();
    if (network.passphrase !== TESTNET)
      throw new Error("Unexpected RPC network.");
    const simulation = await chain.simulateTransaction(tx);
    if (
      rpc.Api.isSimulationError(simulation) ||
      rpc.Api.isSimulationRestore(simulation)
    )
      throw new Error("The original payment simulation could not be verified.");
    verifyPayouts(
      transfersFromEvents(
        simulation.events
          .filter((event) => event.inSuccessfulContractCall)
          .map((event) => event.event),
      ),
      snapshot.expected,
    );
    if (Date.parse(sdk.data.expiresAt) <= Date.now())
      throw new Error("The original preparation expired before wallet review.");
    snapshot.state = "prepared";
    const ready = await db
      .from("payment_attempts")
      .update({ preparation: snapshot })
      .eq("donation_id", id)
      .eq("preparation->>state", "preparing")
      .select()
      .single();
    check(ready.error);
    const orderUpdate = await db
      .from("donations")
      .update({ status: "prepared", tx_hash: txHash })
      .eq("id", id)
      .eq("user_id", userId);
    check(orderUpdate.error);
    return publicAttempt(ready.data as Attempt);
  } catch {
    snapshot.state = "needs_review";
    await db
      .from("payment_attempts")
      .update({ preparation: snapshot })
      .eq("donation_id", id)
      .eq("preparation->>state", "preparing");
    await db
      .from("donations")
      .update({ status: "needs_review" })
      .eq("id", id)
      .eq("user_id", userId);
    throw new PaymentError(
      503,
      "The original preparation is retained for review. Its network, simulation, or expected payouts could not be verified. No replacement was created.",
    );
  }
}
export async function submitPayment(
  id: string,
  userId: string,
  signed: unknown,
  consent: unknown,
) {
  requireEnabled();
  const order = await orderFor(id, userId);
  await requireManualTestScope(order, userId);
  const attempt = await attemptFor(id);
  if (!attempt?.unsigned_xdr || !attempt.preparation.sdk)
    throw new PaymentError(
      409,
      "The original preparation is unavailable. Keep this record for recovery.",
    );
  if (typeof signed !== "string" || signed.length > 100000 || consent !== true)
    throw new PaymentError(
      400,
      "Submit only the reviewed, signed original transaction.",
    );
  let txHash: string;
  try {
    txHash = assertOriginalEnvelope(
      attempt.unsigned_xdr,
      signed,
      attempt.wallet_address,
    );
  } catch {
    throw new PaymentError(
      400,
      "The wallet signature or original transaction body did not match.",
    );
  }
  if (attempt.signed_xdr) {
    if (attempt.signed_xdr !== signed)
      throw new PaymentError(
        409,
        "This record already has a different signed envelope.",
      );
    return recoverPayment(id, userId);
  }
  if (attempt.preparation.state !== "prepared")
    throw new PaymentError(
      409,
      "This original payment is not ready to submit.",
    );
  if (Date.parse(attempt.preparation.sdk.data.expiresAt) <= Date.now())
    throw new PaymentError(
      409,
      "The original preparation expired. Keep the record and check its status; do not pay again.",
    );
  const snapshot: Snapshot = { ...attempt.preparation, state: "submitting" };
  const saved = await db
    .from("payment_attempts")
    .update({ signed_xdr: signed, tx_hash: txHash, preparation: snapshot })
    .eq("donation_id", id)
    .eq("preparation->>state", "prepared")
    .is("signed_xdr", null)
    .select()
    .maybeSingle();
  check(saved.error);
  if (!saved.data)
    throw new PaymentError(
      409,
      "The original submission is already being processed. Check its saved status.",
    );
  const pending = await db
    .from("donations")
    .update({ status: "pending", tx_hash: txHash })
    .eq("id", id)
    .eq("user_id", userId);
  check(pending.error);
  try {
    await flowFor(attempt).execute.submit(
      { signedXdr: signed },
      {
        wait: false,
        preparationRequestId: attempt.history_request_id ?? undefined,
      },
    );
  } catch {
    /* Ambiguous result: recover only the saved hash; never retry writes automatically. */
  }
  snapshot.state = "pending";
  const updated = await db
    .from("payment_attempts")
    .update({ preparation: snapshot })
    .eq("donation_id", id)
    .eq("preparation->>state", "submitting");
  check(updated.error);
  return recoverPayment(id, userId);
}
export async function recoverPayment(id: string, userId: string) {
  const order = await orderFor(id, userId);
  let attempt = await attemptFor(id);
  // Recover only the exact retained preparation, without preparing a replacement.
  if (attempt && !attempt.unsigned_xdr && attempt.preparation.sdk?.data.xdr) {
    const retained = originalTransaction(attempt.preparation.sdk.data.xdr);
    assertDepositInvocation(retained, settings().receive, attempt.wallet_address, order.amount_stroops);
    if (retained.source !== attempt.wallet_address) throw new PaymentError(409, 'Original source mismatch.');
    const txHash = Buffer.from(retained.hash()).toString('hex');
    const snapshot = {...attempt.preparation, expected: {...attempt.preparation.expected, triggerContracts:[settings().receive], deploymentContracts:[...new Set([settings().receive,...attempt.preparation.expected.deploymentContracts])]}};
    const saved = await db.from('payment_attempts').update({unsigned_xdr:attempt.preparation.sdk.data.xdr,tx_hash:txHash,preparation:snapshot}).eq('donation_id',id).is('unsigned_xdr',null);
    check(saved.error);
    attempt = await attemptFor(id);
  }
  if (
    !attempt?.tx_hash ||
    !attempt.unsigned_xdr ||
    order.status === "confirmed" ||
    order.status === "failed"
  )
    return { payment: publicAttempt(attempt), status: order.status };
  try {
    // Stellar confirmation must not wait for the Paiflow receipt index.
    const [network, transaction] = await Promise.all([chain.getNetwork(), chain.getTransaction(attempt.tx_hash)]);
    if (network.passphrase !== TESTNET)
      throw new Error("Unexpected RPC network.");
    if (transaction.txHash !== attempt.tx_hash)
      throw new Error("Unexpected chain transaction.");
    let status: "confirmed" | "failed" | null = null;
    let evidence: unknown = null;
    if (
      transaction.status === rpc.Api.GetTransactionStatus.SUCCESS
    ) {
      const original = originalTransaction(attempt.unsigned_xdr);
      const onchain = originalTransaction(
        transaction.envelopeXdr.toXdr("base64"),
      );
      if (!Buffer.from(original.hash()).equals(Buffer.from(onchain.hash())))
        throw new Error("Unexpected on-chain body.");
      evidence = verifyPayouts(
        transfersFromEvents(transaction.events.contractEventsXdr.flat()),
        attempt.preparation.expected,
      );
      status = "confirmed";
    } else if (
      transaction.status === rpc.Api.GetTransactionStatus.FAILED
    )
      status = "failed";
    if (status) {
      const saved = await db
        .from("payment_attempts")
        .update({
          preparation: { ...attempt.preparation, state: status },
          receipt: {
            source: "stellar-testnet",
            txHash: attempt.tx_hash,
            verifiedPayouts: evidence,
            checkedAt: new Date().toISOString(),
          },
        })
        .eq("donation_id", id);
      check(saved.error);
      const result = await db
        .from("donations")
        .update({
          status,
          tx_hash: attempt.tx_hash,
          ...(status === "confirmed"
            ? { verified_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", id)
        .eq("user_id", userId)
        .neq("status", "confirmed");
      check(result.error);
      return {
        payment: publicAttempt({
          ...attempt,
          preparation: { ...attempt.preparation, state: status },
        }),
        status,
      };
    }
  } catch {
    /* Missing/delayed evidence or credential failures never authorize a new payment. */
  }
  return {
    payment: publicAttempt(attempt),
    status: order.status,
    message:
      attempt.signed_xdr ? "The original payment is not yet verified. Keep this record and check again; do not pay again." : "No signed payment was saved for this record. The wallet ownership signature did not send XLM. If your wallet shows a completed payment, provide its transaction hash so it can be checked. The original preparation is retained.",
  };
}
