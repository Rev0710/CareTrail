import test from "node:test";
import assert from "node:assert/strict";
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import {
  NATIVE_CONTRACT,
  TESTNET,
  assertOriginalEnvelope,
  authorizeManualTest,
  originalTransaction,
  preparedInvokeTargets,
  transfersFromEvents,
  verifyPayouts,
  verifyWalletProof,
} from "../dist/lib/payment-verification.js";

const payer = Keypair.random();
test('manual submission scope is one approved account and exactly 1 XLM', () => {
  authorizeManualTest('donor@example.com', 'DONOR@example.com', '10000000');
  assert.throws(() => authorizeManualTest('other@example.com', 'donor@example.com', '10000000'));
  assert.throws(() => authorizeManualTest('donor@example.com', 'donor@example.com', '20000000'));
  assert.throws(() => authorizeManualTest(undefined, 'donor@example.com', '10000000'));
});
const campaign = Keypair.random();
const community = Keypair.random();
const stranger = Keypair.random();
const trigger = "CDGK4J3DDLKOAH364YPAITXFSWVXP65VZO7BCSRQCTRHJQGGWCL36C2F";
const expected = {
  wallet: payer.publicKey(),
  amount: "10000000",
  campaignAmount: "9000000",
  communityAmount: "1000000",
  campaignRecipient: campaign.publicKey(),
  communityRecipient: community.publicKey(),
  triggerContracts: [trigger],
  deploymentContracts: [trigger],
};
const transfer = (from, to, amount, contract = NATIVE_CONTRACT) => ({
  from,
  to,
  amount,
  contract,
});
const matching = () => [
  transfer(payer.publicKey(), trigger, "10000000"),
  transfer(trigger, campaign.publicKey(), "9000000"),
  transfer(trigger, community.publicKey(), "1000000"),
];
function payment(amount = "1") {
  return new TransactionBuilder(new Account(payer.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: campaign.publicKey(),
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(180)
    .build();
}
test("SEP-53 ownership requires the right wallet, message, and unexpired nonce", () => {
  const message = "CareTrail nonce: private-test-only";
  const signature = Buffer.from(payer.signMessage(message)).toString("base64");
  const expiry = new Date(Date.now() + 60000).toISOString();
  verifyWalletProof(payer.publicKey(), message, signature, expiry);
  assert.throws(() =>
    verifyWalletProof(stranger.publicKey(), message, signature, expiry),
  );
  assert.throws(() =>
    verifyWalletProof(
      payer.publicKey(),
      `${message}-changed`,
      signature,
      expiry,
    ),
  );
  assert.throws(() =>
    verifyWalletProof(
      payer.publicKey(),
      message,
      signature,
      new Date(0).toISOString(),
    ),
  );
  assert.throws(() =>
    verifyWalletProof(payer.publicKey(), message, signature, "invalid date"),
  );
});
test("accepts added signatures on the unchanged original envelope", () => {
  const tx = payment();
  const original = tx.toXdr();
  tx.sign(payer);
  tx.sign(stranger);
  assert.equal(
    assertOriginalEnvelope(original, tx.toXdr(), payer.publicKey()),
    Buffer.from(tx.hash()).toString("hex"),
  );
});
test("rejects changed amounts, absent wallet signature, and fee bump wrappers", () => {
  const original = payment().toXdr();
  const changed = payment("2");
  changed.sign(payer);
  assert.throws(() =>
    assertOriginalEnvelope(original, changed.toXdr(), payer.publicKey()),
  );
  const unsigned = originalTransaction(original);
  unsigned.sign(stranger);
  assert.throws(() =>
    assertOriginalEnvelope(original, unsigned.toXdr(), payer.publicKey()),
  );
  const bump = TransactionBuilder.buildFeeBumpTransaction(
    payer.publicKey(),
    "100",
    unsigned,
    TESTNET,
  );
  assert.throws(() =>
    assertOriginalEnvelope(original, bump.toXdr(), payer.publicKey()),
  );
});
test("original invocation must target a contract in this deployment", () => {
  const tx = new TransactionBuilder(new Account(payer.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: TESTNET,
  })
    .addOperation(
      new Contract(trigger).call(
        "execute",
        new Address(payer.publicKey()).toScVal(),
        nativeToScVal(10000000n, { type: "i128" }),
      ),
    )
    .setTimeout(180)
    .build();
  assert.deepEqual(preparedInvokeTargets(tx, [trigger]), [trigger]);
  assert.throws(() => preparedInvokeTargets(tx, [NATIVE_CONTRACT]));
  assert.throws(() => preparedInvokeTargets(payment(), [trigger]));
});
test("only exact native-XLM payer, trigger, and 90/10 transfers verify", () => {
  assert.equal(verifyPayouts(matching(), expected).amount, "10000000");
  for (const invalid of [
    [],
    matching().slice(0, 2),
    matching().map((e) => ({ ...e, contract: trigger })),
    matching().map((e, i) =>
      i === 0 ? { ...e, from: stranger.publicKey() } : e,
    ),
    matching().map((e, i) => (i === 1 ? { ...e, amount: "8999999" } : e)),
    matching().map((e, i) =>
      i === 2 ? { ...e, to: stranger.publicKey() } : e,
    ),
    [...matching(), transfer(trigger, stranger.publicKey(), "1")],
    [...matching(), transfer(campaign.publicKey(), stranger.publicKey(), "1")],
    [...matching(), transfer(payer.publicKey(), trigger, "1")],
  ])
    assert.throws(() => verifyPayouts(invalid, expected));
});
test("does not credit a correct-looking payout from an unrelated contract", () => {
  const wrong = matching().map((e, i) =>
    i > 0 ? { ...e, from: NATIVE_CONTRACT } : e,
  );
  assert.throws(() => verifyPayouts(wrong, expected));
});
test("decodes actual contract-event XDR while ignoring unrelated event kinds", () => {
  const event = new xdr.ContractEvent({
    ext: xdr.ExtensionPoint.v0(),
    contractId: new xdr.ContractId(StrKey.decodeContract(NATIVE_CONTRACT)),
    type: xdr.ContractEventType.contract,
    body: xdr.ContractEventBody.v0(
      new xdr.ContractEventV0({
        topics: [
          nativeToScVal("transfer", { type: "symbol" }),
          new Address(payer.publicKey()).toScVal(),
          new Address(trigger).toScVal(),
        ],
        data: nativeToScVal(10000000n, { type: "i128" }),
      }),
    ),
  });
  const roundTrip = xdr.ContractEvent.fromXdr(event.toXdr("base64"), "base64");
  assert.deepEqual(transfersFromEvents([roundTrip]), [
    transfer(payer.publicKey(), trigger, "10000000"),
  ]);
});
