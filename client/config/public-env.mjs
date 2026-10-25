export function validateBrowserEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("VITE_") || !value) continue;
    if (
      /SECRET|SERVICE_ROLE|PRIVATE_KEY|PAIFLOW.*TOKEN/i.test(name) ||
      String(value).startsWith("sb_secret_") ||
      /^pf[dk]_/.test(String(value))
    ) {
      throw new Error(
        "A backend credential was placed in a VITE_ variable. Remove it; React must use the Supabase publishable key only.",
      );
    }
    if (String(value).startsWith("eyJ")) {
      try {
        const payload = JSON.parse(
          Buffer.from(String(value).split(".")[1], "base64url").toString(),
        );
        if (payload.role === "service_role") throw new Error("SERVICE_ROLE");
      } catch (error) {
        if (error.message === "SERVICE_ROLE")
          throw new Error(
            "A service_role key cannot be used in the frontend. Use a publishable or legacy anon key.",
          );
      }
    }
  }
}
