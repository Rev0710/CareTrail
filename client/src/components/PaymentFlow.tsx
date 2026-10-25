import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Wallet } from "lucide-react";
import { api, xlm } from "../lib/http";
import { useAuth } from "../lib/auth-client";
import type { Donation } from "../types/caretrail";
import { Notice } from "./ui";


type Payment = {
  state: string;
  walletAddress?: string;
  unsignedXdr?: string | null;
  networkPassphrase?: string;
  expiresAt?: string;
  feeStroops?: string;
  campaignRecipient?: string;
  communityRecipient?: string;
  txHash?: string;
  signedSubmissionSaved?: boolean;
  message?: string | null;
};
type Config = {

  preparationEnabled: boolean;
  signingEnabled: boolean;
  reason: string | null;
  deploymentId: string;
  campaignRecipient: string;
  communityRecipient: string;
};
const TESTNET = "Test SDF Network ; September 2015";
async function requireTestnet() {
  const { getNetworkDetails } = await import("@stellar/freighter-api");
  const network = await getNetworkDetails();
  if (network.error || network.networkPassphrase !== TESTNET)
    throw new Error("Unlock Freighter and switch it to Stellar Testnet.");
}
export function PaymentFlow({
  donation,
  onChange,
}: {
  donation: Donation;
  onChange: () => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [config, setConfig] = useState<Config | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [walletUnavailable, setWalletUnavailable] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fetchState = useCallback(async () => {
    const [cfg, result] = await Promise.all([
      api<Config>("/payments/config"),
      api<{ payment: Payment }>(`/donations/${donation.id}/payment`, {}, token),
    ]);
    return { cfg, payment: result.payment };
  }, [donation.id, token]);
  const load = async () => {
    const result = await fetchState();
    setConfig(result.cfg);
    setPayment(result.payment);
  };
  useEffect(() => {
    let active = true;
    fetchState()
      .then((result) => {
        if (active) {
          setConfig(result.cfg);
          setPayment(result.payment);
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [fetchState]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!['pending','submitting'].includes(payment?.state ?? '')) return;
    let active = true;
    let checks = 0;
    let checking = false;
    const timer = window.setInterval(async () => {
      if (checking) return;
      if (++checks > 20) { window.clearInterval(timer); return; }
      checking = true;
      try {
        const result = await api<{payment: Payment; status: string; message?: string}>(`/donations/${donation.id}/check`, {method:'POST',body:'{}'}, token);
        if (!active) return;
        setPayment(result.payment);
        if (['confirmed','failed'].includes(result.status)) {
          setMessage(result.status === 'confirmed' ? 'Payment confirmed on Stellar. Both 90/10 payouts match your donation.' : 'Stellar recorded a failed transaction. This donation is not counted.');
          onChange();
          window.clearInterval(timer);
        }
      } catch { /* Keep the original; the user can check again. */ }
      finally { checking = false; }
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [donation.id, token, payment?.state, onChange]);
  useEffect(() => {
    if (payment && ['confirmed','failed'].includes(payment.state) && payment.state !== donation.status) onChange();
  }, [payment, donation.status, onChange]);
  async function connect() {
    setBusy("Connecting to Freighter…");
    setError("");
    setMessage("");
    setWalletUnavailable(false);
    try {
      const { requestAccess, signMessage, isConnected } =
        await import("@stellar/freighter-api");
      const detected = await isConnected();
      if (!detected.isConnected) { setWalletUnavailable(true); throw new Error('Freighter was not detected in this browser. Use the wallet setup steps below.'); }
      const wallet = await requestAccess();
      if (wallet.error || !wallet.address)
        throw new Error(
          wallet.error?.message ?? "Freighter did not provide an address.",
        );
      await requireTestnet();
      const challenge = await api<Payment>(
        `/donations/${donation.id}/wallet-challenge`,
        {
          method: "POST",
          body: JSON.stringify({ walletAddress: wallet.address }),
        },
        token,
      );
      if (!challenge.message) {
        await load();
        return;
      }
      setBusy("Verify wallet ownership in Freighter…");
      const proof = await signMessage(challenge.message, {
        address: wallet.address,
        networkPassphrase: TESTNET,
      });
      if (
        proof.error ||
        !proof.signedMessage ||
        proof.signerAddress !== wallet.address
      )
        throw new Error(
          proof.error?.message ?? "Wallet verification was not completed.",
        );
      const signature =
        typeof proof.signedMessage === "string"
          ? proof.signedMessage
          : btoa(String.fromCharCode(...proof.signedMessage));
      setBusy("Preparing and checking the original payment…");
      const result = await api<{ payment: Payment }>(
        `/donations/${donation.id}/prepare`,
        {
          method: "POST",
          body: JSON.stringify({ signature, reviewAccepted: true }),
          signal: AbortSignal.timeout(90000),
        },
        token,
      );
      setPayment(result.payment);
      setReviewed(false);
      setMessage(
        "The original preparation is saved. Review both payouts and the fee before signing.",
      );
      onChange();
    } catch (reason) {
      setError(
        `${(reason as Error).message} Your original record is retained. Check its status before taking another action.`,
      );
      await load().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }
  async function pay() {
    if (
      !reviewed ||
      !payment?.unsignedXdr ||
      payment.networkPassphrase !== TESTNET
    )
      return;
    setBusy("Review the original transaction in Freighter…");
    setError("");
    setMessage("");
    try {
      const { getAddress, signTransaction } =
        await import("@stellar/freighter-api");
      await requireTestnet();
      const current = await getAddress();
      if (current.error || current.address !== payment.walletAddress)
        throw new Error("Connect the wallet bound to this original payment.");
      const result = await signTransaction(payment.unsignedXdr, {
        networkPassphrase: TESTNET,
        address: payment.walletAddress,
      });
      if (
        result.error ||
        !result.signedTxXdr ||
        result.signerAddress !== payment.walletAddress
      )
        throw new Error(
          result.error?.message ?? "Transaction signing was not completed.",
        );
      setBusy("Submitting the saved original and checking payouts…");
      const submitted = await api<{
        payment: Payment;
        status: string;
        message?: string;
      }>(
        `/donations/${donation.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            signedXdr: result.signedTxXdr,
            reviewAccepted: true,
          }),
          signal: AbortSignal.timeout(90000),
        },
        token,
      );
      setPayment(submitted.payment);
      setMessage(
        submitted.status === "confirmed"
          ? "Both expected payouts have been independently verified."
          : (submitted.message ??
              "The original payment is saved. Check again for final verification."),
      );
      setReviewed(false);
      onChange();
    } catch (reason) {
      setError(
        `${(reason as Error).message} Keep this original record; a timeout or cancellation does not authorize another payment.`,
      );
      await load().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }
  async function check() {
    setBusy("Checking the original payment…");
    setError("");
    try {
      const result = await api<{
        payment: Payment;
        status: string;
        message?: string;
      }>(
        `/donations/${donation.id}/check`,
        { method: "POST", body: "{}" },
        token,
      );
      setPayment(result.payment);
      setMessage(
        result.status === "confirmed"
          ? "Original transaction and both payouts verified."
          : (result.message ?? `Original record: ${result.status}.`),
      );
      onChange();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy("");
    }
  }
  const ready = payment?.state === "prepared" && Boolean(payment.unsignedXdr);
  const expired =
    ready && (!payment?.expiresAt || Date.parse(payment.expiresAt) <= now);
  const originalExists =
    payment && !["draft", "challenge"].includes(payment.state);
  return (
    <section className="payment-flow" aria-labelledby="payment-heading">
      <h3 id="payment-heading">
        <Wallet size={18} /> Testnet payment
      </h3>
      {config && (
        <>
          {config.signingEnabled && <Notice>Review your chosen amount, the 90/10 split and network fee before approving in Freighter. Your wallet must differ from both recipients.</Notice>}
          <dl className="facts">
            <div>
              <dt>90% campaign recipient</dt>
              <dd className="wallet-address">
                {payment?.campaignRecipient ?? config.campaignRecipient}
                <span>{xlm(donation.campaign_stroops)} XLM</span>
              </dd>
            </div>
            <div>
              <dt>10% community recipient</dt>
              <dd className="wallet-address">
                {payment?.communityRecipient ?? config.communityRecipient}
                <span>{xlm(donation.community_stroops)} XLM</span>
              </dd>
            </div>
            {payment?.feeStroops && (
              <div>
                <dt>Prepared network fee</dt>
                <dd>{xlm(payment.feeStroops)} XLM</dd>
              </div>
            )}
            {payment?.walletAddress && (
              <div>
                <dt>Customer wallet</dt>
                <dd className="wallet-address">{payment.walletAddress}</dd>
              </div>
            )}
          </dl>
          {!config.signingEnabled && (
            <Notice>
              {config.reason} Your original record remains available.
            </Notice>
          )}
        </>
      )}
      {payment?.txHash && (
        <p className="fine-print break-word">
          Original transaction: {payment.txHash}
          <br/><a href={`https://stellar.expert/explorer/testnet/tx/${payment.txHash}`} target="_blank" rel="noopener noreferrer">View original hash on Stellar Testnet</a>
        </p>
      )}
      {ready && (
        <>
          <p className="fine-print">
            Original preparation expires:{" "}
            {payment.expiresAt
              ? new Date(payment.expiresAt).toLocaleString("en-PH", {
                  timeZone: "Asia/Manila",
                })
              : "unknown"}
            . Expiration does not authorize a replacement.
          </p>
          {expired ? (
            <Notice>
              The original preparation has expired. Keep this record and check
              its original hash.
            </Notice>
          ) : (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              <span>
                I authorize this original {xlm(donation.amount_stroops)}{" "}
                test-XLM payment, the displayed 90/10 payouts, and the displayed
                network fee.
              </span>
            </label>
          )}
        </>
      )}
      {error && <Notice error>{error}</Notice>}
      {walletUnavailable && <div className="wallet-setup"><h3>Continue in Chrome with Freighter</h3><ol><li>Open Chrome and install <a href="https://freighter.app/" target="_blank" rel="noopener noreferrer">Freighter from its official website</a> if needed.</li><li>Unlock your customer wallet and select Stellar Testnet.</li><li>Paste this checkout link into Chrome, sign in with your local defaults, then select Verify wallet & prepare.</li></ol><label>Checkout link<input readOnly value={`${window.location.origin}/receipt/${donation.id}`} onFocus={event => event.currentTarget.select()} /></label><button className="button secondary full" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/receipt/${donation.id}`); setLinkCopied(true); } catch { setMessage('Select and copy the checkout link shown above.'); } }}>{linkCopied ? 'Checkout link copied' : 'Copy checkout link'}</button><p className="fine-print">Use a funded customer wallet that differs from both payout recipients. Only you approve the wallet prompts. No payment has been submitted.</p></div>}
      {payment?.state === "needs_review" && <Notice>This record is not confirmed on Stellar. A wallet ownership signature alone does not send XLM. Check the original payment below. If Freighter shows a successful payment, keep its transaction hash for reconciliation.</Notice>}
      {message && <Notice>{message}</Notice>}

      <div className="payment-actions">
        {!originalExists &&
          donation.status !== "confirmed" &&
          donation.status !== "failed" && (
            <button
              className="button full"
              disabled={!config?.preparationEnabled || Boolean(busy)}
              onClick={connect}
            >
              <ShieldCheck size={17} /> Verify wallet & prepare
            </button>
          )}
        {ready && (
          <button
            className="button full"
            disabled={
              !config?.signingEnabled || !reviewed || expired || Boolean(busy)
            }
            onClick={pay}
          >
            Sign original testnet payment <ArrowRight size={17} />
          </button>
        )}
        <button
          className="button secondary full"
          disabled={Boolean(busy)}
          onClick={check}
        >
          Check original payment
        </button>
      </div>
      {busy && <p role="status">{busy}</p>}
      <p className="fine-print">
        Wallet proof is a message signature, not a payment. No secret key is
        requested. Recovery checks the original hash and never creates a
        replacement transaction.
      </p>
    </section>
  );
}
