import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { validateBrowserEnv } from "./config/public-env.mjs";

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const browserEnv = {
    ...loadEnv(mode, process.cwd(), "VITE_"),
    ...process.env,
  };
  validateBrowserEnv(browserEnv);
  if (command === "build") {
    const missing = ["VITE_API_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter(name => !browserEnv[name]);
    if (missing.length) throw new Error(`CareTrail deployment settings missing: ${missing.join(", ")}. Set these in Vercel and redeploy.`);
  }
  const localDemo = command === 'serve' && mode === 'development' ? loadEnv(mode, process.cwd(), 'LOCAL_DEMO_') : {};
  return {
    plugins: [react()],
    define: { __CARETRAIL_LOCAL_DEMO__: localDemo.LOCAL_DEMO_EMAIL && localDemo.LOCAL_DEMO_PASSWORD ? JSON.stringify({ email: localDemo.LOCAL_DEMO_EMAIL, password: localDemo.LOCAL_DEMO_PASSWORD }) : 'null' },
  };
});
