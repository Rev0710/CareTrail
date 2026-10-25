import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Compass,
  Download,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { AuthProvider } from "./lib/auth";
import { authClient, authConfigured, useAuth } from "./lib/auth-client";
import { api, date, xlm } from "./lib/http";
import { authErrorMessage } from './lib/auth-errors.mjs';
import {
  Brand,
  CampaignCard,
  CampaignImage,
  Empty,
  Notice,
  Split,
} from "./components/ui";
import { PaymentFlow } from "./components/PaymentFlow";
import type { Campaign, CampaignUpdate, Donation } from "./types/caretrail";
import "./CareTrail.css";

function useResource<T>(path: string, token?: string) {
  const [result, setResult] = useState<{ path: string; token?: string; version: number; data: T | null; error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal }, token)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult({ path, token, version, data: value, error: '' });
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setResult(previous => ({ path, token, version, data: previous?.path === path && previous.token === token ? previous.data : null, error: reason.message }));
      });
    return () => controller.abort();
  }, [path, token, version]);
  return {
    data: result?.path === path && result.token === token ? result.data : null,
    error: result?.path === path && result.token === token && result.version === version ? result.error : '',
    loading: result?.path !== path || result?.token !== token || result?.version !== version,
    reload,
  };
}
function Status({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return error ? (
    <Notice error>
      <strong>We couldn’t load this information.</strong>
      <p>{error}</p>
      <button className="text-button" onClick={reload}>
        Try again
      </button>
    </Notice>
  ) : loading ? (
    <p className="loading" role="status">
      Loading CareTrail records…
    </p>
  ) : null;
}
function Title({ title, description }: { title: string; description: string }) {
  return (
    <header className="page-title">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
function Shell() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="mobile-header">
        <Brand />
        <button
          className="icon-button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Brand />
        <p className="workspace-label">Giving, with a clear trail</p>
        <nav aria-label="Main navigation" onClick={() => setOpen(false)}>
          <NavLink to="/" end>
            <Compass size={19} /> Explore causes
          </NavLink>
          <NavLink to="/history">
            <HeartHandshake size={19} /> My donations
          </NavLink>
          <NavLink to="/organizer">
            <LayoutDashboard size={19} /> Organizer workspace
          </NavLink>
          <NavLink to="/how-it-works">
            <BookOpen size={19} /> How it works
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={24} />
          <h2>A little clarity goes a long way.</h2>
          <p>
            Follow your payment. Read the organizer’s story. Know the
            difference.
          </p>
          <Link to="/how-it-works">
            Understand the trail <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="sidebar-bottom">
          <span className="network-dot" /> Stellar Testnet <span>Demo</span>
        </div>
        <div className="account-row">
          <span className="avatar">
            {session?.user.email?.slice(0, 1).toUpperCase() ?? "G"}
          </span>
          <div>
            <strong>{session ? "Your account" : "Guest explorer"}</strong>
            <span>{session?.user.email ?? "Find a cause you care about"}</span>
          </div>
          {session ? (
            <button
              className="icon-button"
              aria-label="Sign out"
                onClick={async () => { await authClient?.auth.signOut({ scope: 'local' }); setOpen(false); navigate('/login', { replace: true }); }}
            >
              <LogOut size={17} />
            </button>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <div className="environment-bar">
          <span>
            <span className="network-dot" /> Testnet demonstration
          </span>
          <span>No real funds. All amounts are test XLM.</span>
          <Link to="/how-it-works">
            Learn more <ArrowUpRight size={13} />
          </Link>
        </div>
        <main id="main" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Explore />} />
            <Route path="/campaigns/:id" element={<CampaignPage />} />
            <Route
              path="/donate/:id"
              element={
                <RequireAuth>
                  <Donate />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <History />
                </RequireAuth>
              }
            />
            <Route
              path="/receipt/:id"
              element={
                <RequireAuth>
                  <Receipt />
                </RequireAuth>
              }
            />
            <Route
              path="/organizer"
              element={
                <RequireAuth>
                  <Organizer />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route
              path="/forgot-password"
              element={<AuthPage mode="forgot" />}
            />
            <Route path="/reset-password" element={<AuthPage mode="reset" />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route
              path="*"
              element={
                <>
                  <Title
                    title="Page not found"
                    description="Let’s get you back to a cause that matters."
                  />
                  <Link className="button" to="/">
                    Explore causes
                  </Link>
                </>
              }
            />
          </Routes>
        </main>
        <footer>
          <span>CareTrail · A clearer path from giving to knowing.</span>
          <Link to="/how-it-works">
            Payment truth & organizer reports <ArrowUpRight size={14} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
function Explore() {
  const resource = useResource<{ campaigns: Campaign[] }>("/campaigns");
  const [category, setCategory] = useState("All causes");
  const [search, setSearch] = useState("");
  const campaigns = (resource.data?.campaigns ?? []).filter(
    (c) =>
      (category === "All causes" || c.category === category) &&
      `${c.title} ${c.summary} ${c.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="explore-intro">
        <div>
          <p className="section-label">Small acts. A visible trail.</p>
          <h1>Care starts here.</h1>
          <p>
            Find a cause close to your heart.
            <br />
            Follow your contribution, every step of the way.
          </p>
          <a className="button" href="#causes">
            Find your cause <ArrowRight size={17} />
          </a>
        </div>
        <div className="trail-preview panel">
          <img
            className="overview-photo"
            src="/images/campaign-relief.webp"
            alt="Illustrative sample scene of a community volunteer packing relief supplies"
            width={1200}
            height={800}
            fetchPriority="high"
          />
          <div className="preview-top">
            <HeartHandshake size={24} />
            <span>Your contribution, made clear</span>
          </div>
          <Split />
          <p>
            <ShieldCheck size={16} /> Payment receipts and organizer reports
            stay separate.
          </p>
        </div>
      </div>
      <section id="causes" aria-labelledby="causes-heading">
        <div className="section-heading">
          <div>
            <h2 id="causes-heading">Find a cause to care about</h2>
            <p>Relief, essential care, and brighter opportunities.</p>
          </div>
          <span className="muted">
            {resource.data
              ? `${campaigns.length} ${campaigns.length === 1 ? "cause" : "causes"}`
              : "Community campaigns"}
          </span>
        </div>
        <div className="filter-row">
          <div className="tabs" aria-label="Campaign category">
            {["All causes", "Relief", "Medical", "Education"].map((item) => (
              <button
                key={item}
                aria-pressed={category === item}
                className={category === item ? "selected" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={17} />
            <span className="sr-only">Search campaigns</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a cause or place"
            />
          </label>
        </div>
        <Status {...resource} />
        {!resource.loading &&
          !resource.error &&
          (campaigns.length ? (
            <div className="campaign-grid">
              {campaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </div>
          ) : (
            <Empty title="No causes found">
              Try another search or check back when a campaign is published.
            </Empty>
          ))}
      </section>
      <div className="clarity-strip">
        <ShieldCheck size={25} />
        <div>
          <h2>Giving deserves a clear record.</h2>
          <p>
            A confirmed payment proves the transfer. An organizer’s update tells
            you what happened next.
          </p>
        </div>
        <Link to="/how-it-works">
          See how it works <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
function CampaignPage() {
  const { id } = useParams();
  const resource = useResource<{
    campaign: Campaign;
    updates: CampaignUpdate[];
  }>(`/campaigns/${id}`);
  const c = resource.data?.campaign;
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} /> All causes
      </Link>
      <Status {...resource} />
      {c && (
        <>
          <Title
            title={c.title}
            description={`${c.category} · ${c.location}`}
          />
          {c.is_sample && (
            <Notice>
              Sample campaign for testnet demonstrations. No actual
              beneficiaries or outcomes are claimed.
            </Notice>
          )}
          <div className="detail-grid">
            <div>
              <div className={`detail-art art-${c.category.toLowerCase()}`}>
                <CampaignImage category={c.category} />
              </div>
              <section className="panel story">
                <h2>About this cause</h2>
                <p className="lead">{c.summary}</p>
                <p>{c.story}</p>
              </section>
              <section className="panel story">
                <div className="section-heading">
                  <h2>Updates from the organizer</h2>
                  <span className="badge report">Organizer reported</span>
                </div>
                <p className="muted">
                  Organizer statements do not independently verify delivery or
                  spending.
                </p>
                {resource.data?.updates.length ? (
                  resource.data.updates.map((update) => (
                    <article className="update" key={update.id}>
                      <span className="meta">{date(update.created_at)}</span>
                      <h3>{update.title}</h3>
                      <p>{update.body}</p>
                      <p>
                        Reported expense:{" "}
                        <strong>{xlm(update.expense_stroops)} XLM</strong>
                      </p>
                      {update.outcome && (
                        <p>Reported outcome: {update.outcome}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <p>No organizer updates have been published yet.</p>
                )}
              </section>
            </div>
            <aside className="donation-summary panel">
              <span className="meta">Confirmed campaign receipts</span>
              <div className="amount">
                {xlm(c.raised_stroops)} <small>XLM</small>
              </div>
              <p>of {xlm(c.goal_stroops)} XLM campaign goal</p>
              <progress
                value={Number(
                  (BigInt(c.raised_stroops) * 100n) / BigInt(c.goal_stroops),
                )}
                max={100}
                aria-label="Campaign funding progress"
              />
              <Link className="button full" to={`/donate/${c.id}`}>
                Make a contribution <ArrowRight size={17} />
              </Link>
              <Split />
              <p className="fine-print">
                90% to the campaign recipient; 10% to the community recipient.
                Network fees are separate. Stellar Testnet only.
              </p>
              <Notice>
                Only verified payouts count toward the campaign goal.
              </Notice>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p role="status">Checking your session…</p>;
  return session ? (
    children
  ) : (
    <>
      <Title
        title="Your trail, in one place"
        description="Sign in to keep your contribution records private."
      />
      <div className="panel auth-prompt">
        <ShieldCheck size={32} />
        <h2>A little privacy for your giving.</h2>
        <p>Your donation history belongs to you.</p>
        <Link
          className="button"
          to={`/login?next=${encodeURIComponent(location.pathname)}`}
        >
          Sign in to continue <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
function Donate() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const resource = useResource<{ campaign: Campaign }>(`/campaigns/${id}`);
  const paymentConfig = useResource<{ signingEnabled: boolean }>('/payments/config');
  const [amount, setAmount] = useState("1");
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestStorageKey = `caretrail:draft:${session?.user.id}:${id}`;
  const [requestKey] = useState(() => {
    const existing = sessionStorage.getItem(requestStorageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(requestStorageKey, key);
    return key;
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!consent) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ donation: Donation }>(
        "/donations",
        {
          method: "POST",
          body: JSON.stringify({
            campaignId: id,
            amount,
            idempotencyKey: requestKey,
          }),
        },
        session?.access_token,
      );
      sessionStorage.removeItem(requestStorageKey);
      navigate(`/receipt/${result.donation.id}`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to={`/campaigns/${id}`}>
        <ArrowLeft size={16} /> Back to the cause
      </Link>
      <Title
        title={review ? "Review your contribution" : "Make a contribution"}
        description={
          resource.data?.campaign.title ?? "Choose how you’d like to help."
        }
      />
      <Status {...resource} />
      <div className="checkout-grid">
        <form className="panel form-panel" onSubmit={save}>
          <ol className="steps">
            <li className="current">Choose amount</li>
            <li className={review ? "current" : ""}>Review</li>
            <li>Wallet & confirmation</li>
          </ol>
          {!review ? (
            <>
              <h2>How much would you like to give?</h2>

              <div className="amount-options">
                {["1", "5", "10", "20"].map((a) => (
                  <button
                    type="button"
                    key={a}

                    className={amount === a ? "selected" : ""}
                    onClick={() => setAmount(a)}
                  >
                    {a} XLM
                  </button>
                ))}
              </div>
              <label>
                Donation amount (test XLM)
                <input
                  value={amount}

                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <p className="fine-print">
                Use up to seven decimal places. Testnet only.
              </p>
              <button
                type="button"
                className="button full"
                disabled={
                  !resource.data ||
                  !paymentConfig.data ||
                  !/^\d+(\.\d{1,7})?$/.test(amount) ||
                  Number(amount) <= 0 ||
                  Number(amount) > 100000
                }
                onClick={() => setReview(true)}
              >
                Review contribution <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <h2>{amount} XLM on Stellar Testnet</h2>
              <Split amount={amount} />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>
                  I understand the 90/10 allocation. This saves a draft; no
                  payment is made at this step.
                </span>
              </label>
              <Notice>
                Your draft stays in My donations. Continue from its saved record
                to review wallet and payment options.
              </Notice>
              <button className="button full" disabled={!consent || busy}>
                {busy ? "Saving…" : "Save contribution draft"}{" "}
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setReview(false);
                  setConsent(false);
                }}
              >
                Change amount
              </button>
            </>
          )}
          {error && <Notice error>{error}</Notice>}
        </form>
        <aside className="panel form-panel">
          <ShieldCheck size={28} />
          <h2>A record you can come back to.</h2>
          <p>
            Payment confirmation checks the original transaction and both
            expected payouts. Organizer updates remain clearly labelled.
          </p>
          <Split amount={amount} />
          <p className="fine-print">
            Network fees are separate. A saved draft is not a payment receipt.
          </p>
        </aside>
      </div>
    </>
  );
}
function History() {
  const { session } = useAuth();
  const resource = useResource<{ donations: Donation[] }>(
    "/donations",
    session?.access_token,
  );
  return (
    <>
      <Title
        title="My donations"
        description="Your contributions and the records behind them."
      />
      <Status {...resource} />
      {resource.data &&
        (resource.data.donations.length ? (
          <div className="panel donation-list">
            {resource.data.donations.map((d) => (
              <Link to={`/receipt/${d.id}`} className="donation-row" key={d.id}>
                <div>
                  <strong>
                    {d.campaigns?.title ?? "Campaign contribution"}
                  </strong>
                  <span>{date(d.created_at)} · Stellar Testnet</span>
                </div>
                <div>
                  <strong>{xlm(d.amount_stroops)} XLM</strong>
                  <span
                    className={`badge ${d.status === "confirmed" ? "confirmed" : ""}`}
                  >
                    {d.status === "confirmed"
                      ? "Payment confirmed"
                      : d.status.replace("_", " ")}
                  </span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="Your trail starts with a cause.">
            You haven’t saved a contribution yet.{" "}
            <Link to="/">Explore campaigns</Link>
          </Empty>
        ))}
      <Notice>
        Recover interrupted payments using the original record. A reload never
        means you need to pay again.
      </Notice>
    </>
  );
}
function Receipt() {
  const { id } = useParams();
  const { session } = useAuth();
  const resource = useResource<{ donation: Donation }>(
    `/donations/${id}`,
    session?.access_token,
  );
  const d = resource.data?.donation;
  function download() {
    if (!d) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            application: "CareTrail",
            ...d,
            note: "Only confirmed status represents a verified payment.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = `caretrail-${d.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Link to="/history" className="back-link">
        <ArrowLeft size={16} /> My donations
      </Link>
      <Title
        title={
          d?.status === "confirmed"
            ? "Your payment receipt"
            : "Your contribution record"
        }
        description="The original record stays with you when you leave this page."
      />
      <Status {...resource} />
      {d && (
        <div className="receipt-layout">
          <section className="panel receipt">
            <Wallet size={32} />
            <span
              className={`badge ${d.status === "confirmed" ? "confirmed" : "report"}`}
            >
              {d.status === "confirmed"
                ? "Payment confirmed"
                : d.status === "draft"
                  ? "Draft saved · unpaid"
                  : d.status.replace("_", " ")}
            </span>
            <h2>{xlm(d.amount_stroops)} XLM</h2>
            <p>{d.campaigns?.title}</p>
            <dl className="facts">
              <div>
                <dt>Network</dt>
                <dd>Stellar Testnet</dd>
              </div>
              <div>
                <dt>Campaign allocation (90%)</dt>
                <dd>{xlm(d.campaign_stroops)} XLM</dd>
              </div>
              <div>
                <dt>Community allocation (10%)</dt>
                <dd>{xlm(d.community_stroops)} XLM</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{date(d.created_at)}</dd>
              </div>
              <div>
                <dt>Record ID</dt>
                <dd className="break-word">{d.id}</dd>
              </div>
              {d.tx_hash && (
                <div>
                  <dt>Transaction hash</dt>
                  <dd className="break-word">{d.tx_hash}</dd>
                </div>
              )}
            </dl>
            <PaymentFlow donation={d} onChange={resource.reload} />
            <div className="button-row">
              <button className="button secondary" onClick={resource.reload}>
                Check saved status
              </button>
              <button className="text-button" onClick={download}>
                <Download size={16} /> Download record
              </button>
            </div>
          </section>
          <div className="panel form-panel">
            <h2>What this record tells you</h2>
            <p>
              “Payment confirmed” is reserved for verified on-chain transfers
              and matching 90/10 payouts.
            </p>
            <p>
              Drafts are unpaid. Pending or uncertain transactions need
              recovery, not another payment.
            </p>
            <Notice>
              Organizer reports describe the reported use of funds. They are
              separate from payment verification.
            </Notice>
            <Link className="card-link" to={`/campaigns/${d.campaign_id}`}>
              Visit the campaign <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
function AuthPage({
  mode = "login",
}: {
  mode?: "login" | "signup" | "forgot" | "reset";
}) {
  const { ready, session } = useAuth();
  const localDemo = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) ? __CARETRAIL_LOCAL_DEMO__ : null;
  const [email, setEmail] = useState(() => mode === 'login' || mode === 'signup' ? localDemo?.email ?? '' : '');
  const [password, setPassword] = useState(() => mode === 'login' || mode === 'signup' ? localDemo?.password ?? '' : '');
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const titles = {
    login: "Good to see you.",
    signup: "Start your giving trail.",
    forgot: "Let’s get you back in.",
    reset: "Choose a new password.",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'signup' && localDemo && email.trim().toLowerCase() === localDemo.email.toLowerCase()) { setError(''); setMessage('Your confirmed test account is ready. Sign in below.'); navigate('/login'); return; }
    if (!authClient) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await authClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage(
          "If this email has an account, you’ll receive a password reset link.",
        );
      } else if (mode === "reset") {
        const { error } = await authClient.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Your password has been updated.");
      } else if (mode === "signup") {
        const { data, error } = await authClient.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/history` },
        });
        if (error) throw error;
        if (data.session) navigate("/history");
        else if (data.user?.identities?.length === 0) setMessage('This email may already have a CareTrail account. Use Sign in with your existing password; another confirmation email may not be sent.');
        else
          setMessage(
            "Check your email to confirm your account before signing in.",
          );
      } else {
        const { error } = await authClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const next = new URLSearchParams(location.search).get("next");
        navigate(
          next?.startsWith("/") && !next.startsWith("//") ? next : "/history",
        );
      }
    } catch (reason) {
      setError(authErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (ready && session && (mode === 'login' || mode === 'signup')) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/history'} replace />;
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <HeartHandshake size={52} strokeWidth={1.4} />
        <h1>
          Your care.
          <br />A lasting trail.
        </h1>
        <p>
          Every contribution deserves clarity.
          <br />
          Every update deserves context.
        </p>
        <img
          className="auth-photo"
          src="/images/campaign-relief.webp"
          alt="Illustrative community relief scene"
          width={1200}
          height={800}
        />
        <Split />
      </div>
      <form className="panel form-panel auth-form" onSubmit={submit}>
        <h2>{message && mode === 'forgot' ? 'Check your inbox.' : message && mode === 'reset' ? 'Your care trail awaits.' : titles[mode]}</h2>
        {message && (mode === 'forgot' || mode === 'reset') ? <><Notice>{message}</Notice><p>{mode === 'forgot' ? 'Follow the reset link to choose a new password. Check your spam folder too.' : 'Your new password is saved. You can continue to your account.'}</p><Link className="button full" to="/login">{mode === 'reset' ? 'Continue to sign in' : 'Back to sign in'} <ArrowRight size={16}/></Link></> : <>
        {localDemo && mode === 'signup' && <Notice>Your confirmed test account is ready. <Link to="/login">Sign in with the prefilled defaults</Link>. Other emails use normal registration.</Notice>}
        <p>
          {mode === "signup"
            ? "Create your donor account. Organizer permissions are granted separately."
            : "Keep your contributions and records together."}
        </p>
        {!authConfigured && (
          <Notice error>
            Sign-in setup is pending. Configure the frontend’s Supabase URL and
            publishable key, then rebuild.
          </Notice>
        )}
        {mode !== "reset" && (
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={128}
            />
          </label>
        )}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <button
          className="button full"
          disabled={!authClient || !ready || busy}
        >
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : mode === "signup"
                ? (localDemo && email.trim().toLowerCase() === localDemo.email.toLowerCase() ? 'Continue to default sign-in' : 'Create account')
                : mode === "forgot"
                  ? "Send reset link"
                  : "Update password"}
          <ArrowRight size={16} />
        </button>
        {mode === "login" && (
          <>
            <Link to="/forgot-password">Forgot your password?</Link>
            <p>
              New to CareTrail? <Link to="/signup">Create an account</Link>
            </p>
          </>
        )}
        {mode !== "login" && <Link to="/login">Back to sign in</Link>}
        </>}
      </form>
    </div>
  );
}
function Organizer() {
  const { session } = useAuth();
  const resource = useResource<{ campaigns: Campaign[] }>(
    "/organizer/campaigns",
    session?.access_token,
  );
  const [tab, setTab] = useState("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const selected = resource.data?.campaigns.find(c => c.id === selectedId) ?? resource.data?.campaigns[0];
  const detail = useResource<{campaign: Campaign; updates: CampaignUpdate[]}>(selected ? `/campaigns/${selected.id}` : "");
  const received = BigInt(selected?.raised_stroops ?? '0');
  const reported = (detail.data?.updates ?? []).reduce((sum, item) => sum + BigInt(item.expense_stroops), 0n);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(
        tab === "campaign"
          ? "/organizer/campaigns"
          : `/organizer/campaigns/${values.campaignId}/updates`,
        { method: "POST", body: JSON.stringify(values) },
        session?.access_token,
      );
      setMessage(
        tab === "campaign"
          ? "Campaign published."
          : "Organizer report published.",
      );
      form.reset();
      resource.reload();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title={tab === "dashboard" ? "Turn contributions into a clearer record." : tab === "campaign" ? "Start a cause worth caring about." : tab === "update" ? "Share what happened after the donation." : "A clearer picture of every contribution."}
        description="Give supporters a clear record of what you report."
      />
      <Status {...resource} />
      <nav className="tabs organizer-nav" aria-label="Organizer workspace">
        {[["dashboard","Dashboard"],["campaign","Create campaign"],["update","Publish update"],["report","Contribution report"]].map(([value,label])=><button key={value} className={tab===value ? "selected" : ""} onClick={()=>{setTab(value);setError("");setMessage("");}}>{label}</button>)}
      </nav>
      {resource.data && <>
        <label className="organizer-selector">Selected campaign<select value={selected?.id ?? ''} onChange={event=>setSelectedId(event.target.value)}><option value="" disabled>Choose a campaign</option>{resource.data.campaigns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <div className="organizer-metrics">
          <section className="panel"><span>Confirmed campaign receipts</span><strong>{xlm(received.toString())} XLM</strong><small>90% campaign share verified on Stellar</small></section>
          <section className="panel report-metric"><span>Organizer-reported spending</span><strong>{xlm(reported.toString())} XLM</strong><small>Reported by the organizer; separate from payment proof</small></section>
          <section className="panel"><span>Latest reported outcome</span><strong className="outcome-text">{detail.data?.updates[0]?.outcome || 'No outcome reported yet'}</strong><small>{detail.data?.updates.length ?? 0} published reports</small></section>
        </div>
        {(tab === "dashboard" || tab === "report") && <div className="workspace-grid">
          <section className="panel form-panel"><h2>{selected?.title ?? 'Your first campaign starts here'}</h2><p>{selected?.summary ?? 'Publish your story, invite supporters and keep them informed.'}</p>{selected && <><CampaignImage category={selected.category} className="organizer-preview-photo" /><p>{xlm(selected.raised_stroops)} XLM of {xlm(selected.goal_stroops)} XLM goal</p><Link className="button secondary" to={`/campaigns/${selected.id}`}>Preview campaign <ArrowUpRight size={16}/></Link></>}<button className="button" onClick={()=>setTab(selected ? 'update' : 'campaign')}>{selected ? 'Publish an organizer update' : 'Create a campaign'}</button></section>
          <section className="panel form-panel"><h2>Spending reports and outcomes</h2><Notice>Confirmed payments prove the transfer. Spending and outcomes below are organizer-reported.</Notice>{detail.data?.updates.length ? detail.data.updates.map(update=><article className="organizer-report" key={update.id}><small>{date(update.created_at)} · Organizer report</small><h3>{update.title}</h3><p>{update.body}</p><strong>{xlm(update.expense_stroops)} XLM reported spending</strong><p>{update.outcome}</p></article>) : <p>No organizer reports published yet. Add an update when you have something concrete to share.</p>}</section>
        </div>}
      </>}
      {resource.data && (tab === "campaign" || tab === "update") && (
        <div className="workspace-grid">
          <section className="panel form-panel">
            <h2>Your campaigns</h2>
            {resource.data.campaigns.length ? (
              resource.data.campaigns.map((c) => (
                <Link
                  className="organizer-campaign"
                  key={c.id}
                  to={`/campaigns/${c.id}`}
                >
                  <div>
                    <strong>{c.title}</strong>
                    <span>
                      {xlm(c.raised_stroops)} XLM confirmed campaign receipts
                    </span>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))
            ) : (
              <p>Your first campaign starts with a clear story.</p>
            )}
            <Notice>
              Publishing a report does not verify delivery or move funds.
            </Notice>
          </section>
          <section className="panel form-panel">
            <div className="tabs">
              <button
                className={tab === "campaign" ? "selected" : ""}
                onClick={() => setTab("campaign")}
              >
                New campaign
              </button>
              <button
                className={tab === "update" ? "selected" : ""}
                onClick={() => setTab("update")}
              >
                Publish update
              </button>
            </div>
            <form onSubmit={publish} key={`${tab}:${selected?.id ?? "new"}`}>
              {tab === "campaign" ? (
                <>
                  <label>
                    Campaign title
                    <input
                      name="title"
                      minLength={5}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Category
                    <select name="category">
                      <option>Relief</option>
                      <option>Medical</option>
                      <option>Education</option>
                    </select>
                  </label>
                  <label>
                    Location
                    <input
                      name="location"
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Campaign goal (XLM)
                    <input name="goal" inputMode="decimal" required />
                  </label>
                  <label>
                    Short description
                    <textarea
                      name="summary"
                      required
                      minLength={10}
                      maxLength={240}
                      rows={2}
                    />
                  </label>
                  <label>
                    Campaign story
                    <textarea
                      name="story"
                      required
                      minLength={20}
                      maxLength={10000}
                      rows={5}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Campaign
                    <select name="campaignId" defaultValue={selected?.id} required>
                      <option value="">Choose your campaign</option>
                      {resource.data.campaigns.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Update title
                    <input
                      name="title"
                      minLength={5}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label>
                    Reported spending (XLM)
                    <input
                      name="expense"
                      defaultValue="0"
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label>
                    Reported outcome
                    <input name="outcome" maxLength={500} />
                  </label>
                  <label>
                    Organizer report
                    <textarea
                      name="body"
                      required
                      minLength={20}
                      maxLength={10000}
                      rows={5}
                    />
                  </label>
                </>
              )}
              {error && <Notice error>{error}</Notice>}
              {message && <Notice>{message}</Notice>}
              <button className="button full" disabled={busy}>
                {busy
                  ? "Publishing…"
                  : tab === "campaign"
                    ? "Publish campaign"
                    : "Publish organizer report"}
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function HowItWorks() {
  const [walletMessage, setWalletMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function walletCheck() {
    setBusy(true);
    try {
      const { requestAccess, getNetworkDetails } =
        await import("@stellar/freighter-api");
      const result = await requestAccess();
      if (result.error) throw new Error(result.error.message);
      const network = await getNetworkDetails();
      if (network.error) throw new Error(network.error.message);
      if (network.networkPassphrase !== "Test SDF Network ; September 2015")
        throw new Error("Switch Freighter to Stellar Testnet.");
      setWalletMessage(
        `Connected on Testnet: ${result.address}. No transaction has been signed.`,
      );
    } catch (reason) {
      setWalletMessage((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Title
        title="A clearer trail for your care"
        description="Understand what a payment confirms, and what an organizer reports."
      />
      <div className="explain-grid">
        <section className="panel form-panel">
          <ShieldCheck size={28} />
          <h2>Payment confirmation</h2>
          <p>
            A confirmed payment requires the original on-chain transaction and
            evidence of the expected 90/10 payouts. A submission response alone
            is not enough.
          </p>
          <Split />
          <span className="badge confirmed">
            Reserved for confirmed payments
          </span>
        </section>
        <section className="panel form-panel">
          <BookOpen size={28} />
          <h2>Organizer reports</h2>
          <p>
            Organizers can publish spending and describe outcomes. These are
            organizer statements, not independent proof of delivery.
          </p>
          <p>
            Read them alongside payment receipts, with their different meanings
            in mind.
          </p>
          <span className="badge report">Organizer reported</span>
        </section>
        <section className="panel form-panel">
          <Wallet size={28} />
          <h2>Your wallet stays yours</h2>
          <p>
            Freighter handles signing. CareTrail never asks for your wallet
            secret key or recovery phrase.
          </p>
          <button
            className="button secondary"
            onClick={walletCheck}
            disabled={busy}
          >
            {busy ? "Checking wallet…" : "Check Freighter connection"}
          </button>
          {walletMessage && (
            <p className="break-word" role="status">
              {walletMessage}
            </p>
          )}
        </section>
        <section className="panel form-panel">
          <h2>Interrupted payment?</h2>
          <p>
            Keep the original record and transaction hash. A timeout, reload, or
            missing event does not mean nothing was submitted.
          </p>
          <Link to="/history" className="card-link">
            Find your saved record <ArrowUpRight size={17} />
          </Link>
        </section>
      </div>
    </>
  );
}
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
export default App;
