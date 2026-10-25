import test from "node:test";
import assert from "node:assert/strict";
import { parseXlm, splitDonation } from "../dist/lib/money.js";
test("one XLM splits into the required 0.9 and 0.1 XLM", () => {
  assert.deepEqual(splitDonation(parseXlm("1")), {
    amount_stroops: "10000000",
    campaign_stroops: "9000000",
    community_stroops: "1000000",
  });
});
test("decimal conversion is exact, including the smallest supported donation", () => {
  assert.equal(parseXlm("0.000001"), 10n);
  assert.equal(parseXlm("12.3456789"), 123456789n);
  assert.equal(parseXlm("100000"), 1000000000000n);
});
test("split always conserves every stroop and rounds campaign share down", () => {
  for (const amount of [10n, 11n, 123456789n, 1000000000000n]) {
    const value = splitDonation(amount);
    assert.equal(
      BigInt(value.campaign_stroops) + BigInt(value.community_stroops),
      amount,
    );
    assert.equal(BigInt(value.campaign_stroops), (amount * 9n) / 10n);
  }
});
test("rejects zero, negative, float values, excess precision and oversized amounts", () => {
  for (const value of [
    "0",
    "-1",
    "1e3",
    "0.0000001",
    "1.00000001",
    "100001",
    "01",
    "Infinity",
    "",
    1,
    null,
  ])
    assert.throws(() => parseXlm(value));
});
