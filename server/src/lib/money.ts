export function parseXlm(value: unknown): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,7})?$/.test(value)
  ) {
    throw new Error(
      "Enter a positive XLM amount with at most seven decimal places.",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const stroops = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  if (stroops < 10n || stroops > 1_000_000_000_000n) {
    throw new Error("Enter an amount between 0.000001 and 100,000 XLM.");
  }
  return stroops;
}
export function splitDonation(amount: bigint) {
  const campaign = (amount * 9000n) / 10000n;
  return {
    amount_stroops: String(amount),
    campaign_stroops: String(campaign),
    community_stroops: String(amount - campaign),
  };
}
