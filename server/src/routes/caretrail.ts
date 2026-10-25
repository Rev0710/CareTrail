import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Paiflow } from "@paiflow/sdk";
import { supabaseAdmin as db } from "../lib/supabase.js";
import { parseXlm, splitDonation } from "../lib/money.js";
import {
  PaymentError,
  preparePayment,
  publicPaymentConfig,
  readPayment,
  recoverPayment,
  submitPayment,
  walletChallenge,
} from "../lib/payments.js";

export const caretrail = Router();
caretrail.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const writeWindows = new Map<string, { count: number; resetsAt: number }>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const safe =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
const assertDb = (error: unknown) => {
  if (error)
    throw new HttpError(
      503,
      "CareTrail data is unavailable. Check that the database migration has been applied.",
    );
};
function text(value: unknown, min: number, max: number) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpError(400, `Enter between ${min} and ${max} characters.`);
  return value.trim();
}
function id(value: unknown) {
  if (typeof value !== "string" || !uuid.test(value))
    throw new HttpError(400, "Invalid record identifier.");
  return value;
}
async function user(req: Request) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 10000)
    throw new HttpError(401, "Please sign in to continue.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  if (req.method === "POST") {
    const now = Date.now();
    for (const [key, window] of writeWindows)
      if (window.resetsAt <= now) writeWindows.delete(key);
    const window = writeWindows.get(data.user.id) ?? {
      count: 0,
      resetsAt: now + 60000,
    };
    if (window.count >= 30 || writeWindows.size >= 10000) {
      req.res?.setHeader("Retry-After", "60");
      throw new HttpError(
        429,
        "Please wait a minute before making another request.",
      );
    }
    window.count += 1;
    writeWindows.set(data.user.id, window);
  }
  return data.user;
}
async function role(userId: string) {
  const { data, error } = await db
    .from("caretrail_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  assertDb(error);
  return data?.role ?? "donor";
}
async function campaign(campaignId: string) {
  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("status", "published")
    .maybeSingle();
  assertDb(error);
  if (!data) throw new HttpError(404, "Campaign not found.");
  return data;
}
async function totals(campaignIds: string[]) {
  if (!campaignIds.length) return {} as Record<string, string>;
  const { data, error } = await db
    .from("donations")
    .select("campaign_id,campaign_stroops")
    .in("campaign_id", campaignIds)
    .eq("status", "confirmed")
    .limit(10000);
  assertDb(error);
  // Never show an understated aggregate if this bounded query hits its limit.
  if ((data?.length ?? 0) >= 1000)
    throw new HttpError(
      503,
      "Campaign totals require a database aggregate before this volume can be displayed.",
    );
  const values: Record<string, bigint> = {};
  for (const row of data ?? [])
    values[row.campaign_id] =
      (values[row.campaign_id] ?? 0n) + BigInt(row.campaign_stroops);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, String(value)]),
  );
}
caretrail.get(
  "/campaigns",
  safe(async (_req, res) => {
    const { data, error } = await db
      .from("campaigns")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);
    assertDb(error);
    const sums = await totals((data ?? []).map((c) => c.id));
    res.json({
      campaigns: (data ?? []).map((c) => ({
        ...c,
        raised_stroops: sums[c.id] ?? "0",
      })),
    });
  }),
);
caretrail.get(
  "/campaigns/:id",
  safe(async (req, res) => {
    const item = await campaign(id(req.params.id));
    const { data, error } = await db
      .from("campaign_updates")
      .select("id,title,body,expense_stroops,outcome,created_at")
      .eq("campaign_id", item.id)
      .order("created_at", { ascending: false })
      .limit(100);
    assertDb(error);
    const sums = await totals([item.id]);
    res.json({
      campaign: { ...item, raised_stroops: sums[item.id] ?? "0" },
      updates: data ?? [],
    });
  }),
);
caretrail.get(
  "/me",
  safe(async (req, res) => {
    const account = await user(req);
    res.json({
      id: account.id,
      email: account.email,
      role: await role(account.id),
    });
  }),
);
caretrail.get(
  "/donations",
  safe(async (req, res) => {
    const account = await user(req);
    const { data, error } = await db
      .from("donations")
      .select("*,campaigns(title)")
      .eq("user_id", account.id)
      .order("created_at", { ascending: false })
      .limit(100);
    assertDb(error);
    res.json({ donations: data ?? [] });
  }),
);
caretrail.post(
  "/donations",
  safe(async (req, res) => {
    const account = await user(req);
    const item = await campaign(id(req.body.campaignId));
    const key = id(req.body.idempotencyKey);
    let split: ReturnType<typeof splitDonation>;
    try {
      split = splitDonation(parseXlm(req.body.amount));
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const existing = await db
      .from("donations")
      .select("*")
      .eq("user_id", account.id)
      .eq("idempotency_key", key)
      .maybeSingle();
    assertDb(existing.error);
    if (existing.data) {
      if (
        existing.data.campaign_id !== item.id ||
        existing.data.amount_stroops !== split.amount_stroops
      )
        throw new HttpError(
          409,
          "This request belongs to a different donation.",
        );
      res.json({ donation: existing.data });
      return;
    }
    const { data, error } = await db
      .from("donations")
      .insert({
        user_id: account.id,
        campaign_id: item.id,
        idempotency_key: key,
        ...split,
      })
      .select()
      .single();
    if (error?.code === "23505") {
      const retry = await db
        .from("donations")
        .select("*")
        .eq("user_id", account.id)
        .eq("idempotency_key", key)
        .single();
      assertDb(retry.error);
      if (
        retry.data.campaign_id !== item.id ||
        retry.data.amount_stroops !== split.amount_stroops
      )
        throw new HttpError(
          409,
          "This request belongs to a different donation.",
        );
      res.json({ donation: retry.data });
      return;
    }
    assertDb(error);
    res.status(201).json({ donation: data });
  }),
);
caretrail.get(
  "/donations/:id",
  safe(async (req, res) => {
    const account = await user(req);
    const { data, error } = await db
      .from("donations")
      .select("*,campaigns(title)")
      .eq("id", id(req.params.id))
      .eq("user_id", account.id)
      .maybeSingle();
    assertDb(error);
    if (!data) throw new HttpError(404, "Donation not found.");
    res.json({ donation: data });
  }),
);
// Each transition uses the authenticated owner and the saved original attempt.
caretrail.get(
  "/donations/:id/payment",
  safe(async (req, res) => {
    const account = await user(req);
    res.json({ payment: await readPayment(id(req.params.id), account.id) });
  }),
);
caretrail.post(
  "/donations/:id/wallet-challenge",
  safe(async (req, res) => {
    const account = await user(req);
    res.json(
      await walletChallenge(
        id(req.params.id),
        account.id,
        req.body?.walletAddress,
      ),
    );
  }),
);
caretrail.post(
  "/donations/:id/prepare",
  safe(async (req, res) => {
    const account = await user(req);
    res.json({
      payment: await preparePayment(
        id(req.params.id),
        account.id,
        req.body?.signature,
        req.body?.reviewAccepted,
      ),
    });
  }),
);
caretrail.post(
  "/donations/:id/submit",
  safe(async (req, res) => {
    const account = await user(req);
    res.json(
      await submitPayment(
        id(req.params.id),
        account.id,
        req.body?.signedXdr,
        req.body?.reviewAccepted,
      ),
    );
  }),
);
caretrail.post(
  "/donations/:id/check",
  safe(async (req, res) => {
    const account = await user(req);
    res.json(await recoverPayment(id(req.params.id), account.id));
  }),
);
caretrail.get(
  "/payments/config",
  safe(async (_req, res) => {
    res.json(publicPaymentConfig());
  }),
);
caretrail.get(
  "/organizer/payments/health",
  safe(async (req, res) => {
    const account = await user(req);
    if (!["organizer", "admin"].includes(await role(account.id)))
      throw new HttpError(403, "Organizer access is required.");
    const token = process.env.PAIFLOW_API_TOKEN;
    const origin = process.env.PAIFLOW_BASE_URL;
    const deploymentId = process.env.PAIFLOW_DEPLOYMENT_ID;
    if (!token || !origin || !deploymentId)
      throw new HttpError(503, "Paiflow server configuration is incomplete.");
    try {
      const flow = new Paiflow({ baseUrl: origin, token }).deployment(
        deploymentId,
      );
      const { data } = await flow.capabilities.get();
      if (
        data.network !== "testnet" ||
        data.inputAsset?.kind !== "native" ||
        data.operations.execute.status === "unsupported"
      )
        throw new Error("Incompatible deployment.");
      res.json({
        network: data.network,
        asset: "XLM",
        executable: data.operations.execute.status,
        signingEnabled: false,
      });
    } catch {
      throw new HttpError(
        503,
        "The deployment could not be verified as an executable native-XLM testnet flow.",
      );
    }
  }),
);
caretrail.get(
  "/organizer/campaigns",
  safe(async (req, res) => {
    const account = await user(req);
    if (!["organizer", "admin"].includes(await role(account.id)))
      throw new HttpError(
        403,
        "Organizer access must be granted before you can publish campaigns.",
      );
    const { data, error } = await db
      .from("campaigns")
      .select("*")
      .eq("organizer_id", account.id)
      .order("created_at", { ascending: false })
      .limit(100);
    assertDb(error);
    const sums = await totals((data ?? []).map((c) => c.id));
    res.json({
      campaigns: (data ?? []).map((c) => ({
        ...c,
        raised_stroops: sums[c.id] ?? "0",
      })),
    });
  }),
);
caretrail.post(
  "/organizer/campaigns",
  safe(async (req, res) => {
    const account = await user(req);
    if (!["organizer", "admin"].includes(await role(account.id)))
      throw new HttpError(403, "Organizer access is required.");
    if (!["Relief", "Medical", "Education"].includes(req.body.category))
      throw new HttpError(400, "Choose a valid campaign category.");
    let goal: bigint;
    try {
      goal = parseXlm(req.body.goal);
    } catch (error) {
      throw new HttpError(400, (error as Error).message);
    }
    const { data, error } = await db
      .from("campaigns")
      .insert({
        organizer_id: account.id,
        title: text(req.body.title, 5, 100),
        summary: text(req.body.summary, 10, 240),
        story: text(req.body.story, 20, 10000),
        category: req.body.category,
        location: text(req.body.location, 2, 100),
        goal_stroops: String(goal),
        status: "published",
      })
      .select()
      .single();
    assertDb(error);
    res.status(201).json({ campaign: data });
  }),
);
caretrail.post(
  "/organizer/campaigns/:id/updates",
  safe(async (req, res) => {
    const account = await user(req);
    const item = await campaign(id(req.params.id));
    if (
      item.organizer_id !== account.id ||
      !["organizer", "admin"].includes(await role(account.id))
    )
      throw new HttpError(
        403,
        "Only this campaign’s authorized organizer can publish updates.",
      );
    let expense = 0n;
    if (req.body.expense !== "0") {
      try {
        expense = parseXlm(req.body.expense);
      } catch (error) {
        throw new HttpError(400, (error as Error).message);
      }
    }
    const { data, error } = await db
      .from("campaign_updates")
      .insert({
        campaign_id: item.id,
        author_id: account.id,
        title: text(req.body.title, 5, 100),
        body: text(req.body.body, 20, 10000),
        expense_stroops: String(expense),
        outcome:
          typeof req.body.outcome === "string"
            ? req.body.outcome.trim().slice(0, 500)
            : "",
      })
      .select()
      .single();
    assertDb(error);
    res.status(201).json({ update: data });
  }),
);
caretrail.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError || error instanceof PaymentError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    res.status(500).json({
      message: "This request could not be completed. Please try again.",
    });
  },
);
