import {
  Address,
  Asset,
  Keypair,
  Networks,
  StrKey,
  Transaction,
  TransactionBuilder,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";

export const TESTNET = Networks.TESTNET;
export const NATIVE_CONTRACT = Asset.native().contractId(TESTNET);
export function authorizeManualTest(email: string | undefined, approvedEmail: string | undefined, amount: string) {
  if (!email || !approvedEmail || email.toLowerCase() !== approvedEmail.toLowerCase()) throw new Error('Only the approved manual-test account may use submission.');
  if (!/^[1-9][0-9]{0,14}$/.test(amount)) throw new Error('Invalid positive donation amount.');
}
export type Transfer = {
  contract: string;
  from: string;
  to: string;
  amount: string;
};
export type ExpectedPayment = {
  wallet: string;
  amount: string;
  campaignAmount: string;
  communityAmount: string;
  campaignRecipient: string;
  communityRecipient: string;
  triggerContracts: string[];
  deploymentContracts: string[];
};

export function verifyWalletProof(
  wallet: string,
  message: string,
  signature: string,
  expiresAt: string,
  now = Date.now(),
) {
  if (
    !StrKey.isValidEd25519PublicKey(wallet) ||
    now >= Date.parse(expiresAt) ||
    !Number.isFinite(Date.parse(expiresAt))
  )
    throw new Error("The wallet verification request is invalid or expired.");
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signature))
    throw new Error("Invalid wallet proof.");
  const bytes = Buffer.from(signature, "base64");
  if (
    bytes.length !== 64 ||
    !Keypair.fromPublicKey(wallet).verifyMessage(message, bytes)
  )
    throw new Error("The wallet signature could not be verified.");
}
export function originalTransaction(xdr: string) {
  const transaction = TransactionBuilder.fromXDR(xdr, TESTNET);
  if (!(transaction instanceof Transaction))
    throw new Error("Fee-bump envelopes are not accepted.");
  return transaction;
}
export function preparedInvokeTargets(
  transaction: Transaction,
  deploymentContracts: string[],
) {
  if (transaction.operations.length !== 1)
    throw new Error("Expected one original contract invocation.");
  const operation = transaction.operations[0];
  if (
    operation.type !== "invokeHostFunction" ||
    operation.func.type !== "hostFunctionTypeInvokeContract"
  )
    throw new Error("Expected an original contract invocation.");
  const target = Address.fromScAddress(
    operation.func.value.contractAddress,
  ).toString();
  if (!deploymentContracts.includes(target))
    throw new Error(
      "The original invocation is outside the configured deployment.",
    );
  return [target];
}
export function assertDepositInvocation(transaction: Transaction, receiveContract: string, wallet: string, amount: string) {
  preparedInvokeTargets(transaction, [receiveContract]);
  const operation = transaction.operations[0];
  if (operation.type !== 'invokeHostFunction' || operation.func.type !== 'hostFunctionTypeInvokeContract') throw new Error('Expected a Receive deposit invocation.');
  const call = operation.func.value;
  const args = call.args.map(arg => scValToNative(arg));
  if (call.functionName.toString() !== 'deposit' || args.length !== 2 || args[0] !== wallet || args[1] !== BigInt(amount)) throw new Error('The Receive deposit payer or amount does not match the saved order.');
}
export function assertOriginalEnvelope(
  original: string,
  signed: string,
  wallet: string,
) {
  const prepared = originalTransaction(original);
  const submitted = originalTransaction(signed);
  if (!Buffer.from(prepared.hash()).equals(Buffer.from(submitted.hash())))
    throw new Error(
      "The signed transaction differs from the original preparation.",
    );
  if (
    !submitted.signatures.some((signature) =>
      Keypair.fromPublicKey(wallet).verify(
        submitted.hash(),
        signature.signature,
      ),
    )
  )
    throw new Error("The verified wallet must sign the original transaction.");
  return Buffer.from(prepared.hash()).toString("hex");
}
export function transfersFromEvents(events: xdr.ContractEvent[]): Transfer[] {
  const transfers: Transfer[] = [];
  for (const event of events) {
    if (!event.contractId || event.type.name !== "contract") continue;
    const contract = StrKey.encodeContract(event.contractId.toBytes());
    const body = event.body.value;
    const topics = body.topics.map((topic) => scValToNative(topic));
    if (topics[0] !== "transfer") continue;
    if (typeof topics[1] !== "string" || typeof topics[2] !== "string")
      throw new Error("Malformed transfer event.");
    const amount: unknown = scValToNative(body.data);
    if (typeof amount !== "bigint" || amount < 0n)
      throw new Error("Malformed transfer amount.");
    transfers.push({
      contract,
      from: topics[1],
      to: topics[2],
      amount: String(amount),
    });
  }
  return transfers;
}
export function verifyPayouts(events: Transfer[], expected: ExpectedPayment) {
  if (
    !StrKey.isValidEd25519PublicKey(expected.wallet) ||
    expected.campaignRecipient === expected.communityRecipient ||
    !expected.triggerContracts.length
  )
    throw new Error("Invalid expected payment configuration.");
  if (events.some((event) => !/^[0-9]+$/.test(event.amount)))
    throw new Error("Invalid transfer amount.");
  const boundAddresses = [
    expected.wallet,
    expected.campaignRecipient,
    expected.communityRecipient,
    ...expected.deploymentContracts,
  ];
  if (
    events.some(
      (event) =>
        event.contract !== NATIVE_CONTRACT &&
        (boundAddresses.includes(event.from) ||
          boundAddresses.includes(event.to)),
    )
  )
    throw new Error("The payment moved an unexpected asset.");
  const native = events.filter((event) => event.contract === NATIVE_CONTRACT);
  const sum = (predicate: (transfer: Transfer) => boolean) =>
    native
      .filter(predicate)
      .reduce((value, transfer) => value + BigInt(transfer.amount), 0n);
  const amount = BigInt(expected.amount);
  if (
    BigInt(expected.campaignAmount) !== (amount * 9n) / 10n ||
    BigInt(expected.communityAmount) !== amount - (amount * 9n) / 10n
  )
    throw new Error("Invalid expected allocation.");
  const debit = sum((event) => event.from === expected.wallet);
  const trigger = sum(
    (event) =>
      event.from === expected.wallet &&
      expected.triggerContracts.includes(event.to),
  );
  const campaign = sum((event) => event.to === expected.campaignRecipient);
  const community = sum((event) => event.to === expected.communityRecipient);
  if (
    debit !== amount ||
    trigger !== amount ||
    campaign !== BigInt(expected.campaignAmount) ||
    community !== BigInt(expected.communityAmount)
  )
    throw new Error(
      "The original payer, amount, trigger, or 90/10 payout evidence does not match.",
    );
  for (const event of native) {
    if (BigInt(event.amount) === 0n) continue;
    if (
      (event.to === expected.campaignRecipient ||
        event.to === expected.communityRecipient) &&
      !expected.deploymentContracts.includes(event.from)
    )
      throw new Error(
        "A payout did not originate from the intended deployment.",
      );
    if (
      expected.deploymentContracts.includes(event.from) &&
      !expected.deploymentContracts.includes(event.to) &&
      ![expected.campaignRecipient, expected.communityRecipient].includes(
        event.to,
      )
    )
      throw new Error("The deployment paid an unexpected recipient.");
    if (
      [expected.campaignRecipient, expected.communityRecipient].includes(
        event.from,
      )
    )
      throw new Error("A recipient made an unexpected outgoing transfer.");
  }
  for (const contract of expected.deploymentContracts) {
    if (sum(event => event.to === contract) !== sum(event => event.from === contract)) throw new Error('The pipeline retained funds instead of completing the expected payouts.');
  }
  return {
    payer: expected.wallet,
    amount: expected.amount,
    campaign: expected.campaignAmount,
    community: expected.communityAmount,
    nativeContract: NATIVE_CONTRACT,
  };
}
