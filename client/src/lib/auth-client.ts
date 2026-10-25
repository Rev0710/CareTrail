import { createContext, useContext } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const authConfigured = Boolean(url && key);
export let authClient: SupabaseClient | null = null;
let initialization: Promise<SupabaseClient | null> | undefined;
export function getAuthClient() {
  initialization ??= authConfigured
    ? import("@supabase/supabase-js").then(({ createClient }) => {
        authClient = createClient(url, key);
        return authClient;
      })
    : Promise.resolve(null);
  return initialization;
}
export const AuthContext = createContext<{
  session: Session | null;
  ready: boolean;
}>({ session: null, ready: false });
export function useAuth() {
  return useContext(AuthContext);
}
