import "dotenv/config";
import express from "express";
import cors from "cors";
import { supabaseAdmin } from "./lib/supabase.js";
import { caretrail } from "./routes/caretrail.js";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const clientOrigin =
  process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "100kb" }));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/api', caretrail);

app.get("/", (_req, res) => {
  res.json({ message: "Paiflow API is running!" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/database", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("connection_check")
      .select("message")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Database check failed:", error.code);

      res.status(503).json({
        status: "error",
        message: "Database connection check failed",
      });
      return;
    }

    res.json({
      status: "ok",
      message: data.message,
    });
  } catch {
    res.status(503).json({
      status: "error",
      message: "Database connection check failed",
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});
