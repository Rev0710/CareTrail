import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { authConfigured, getAuthClient, AuthContext } from "./auth-client";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!authConfigured);
  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    getAuthClient()
      .then((client) => {
        if (!active || !client) return;
        client.auth.getSession().then(({ data }) => {
          if (active) {
            setSession(data.session);
            setReady(true);
          }
        });
        const { data } = client.auth.onAuthStateChange((_event, next) => {
          if (active) {
            setSession(next);
            setReady(true);
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, ready }}>
      {children}
    </AuthContext.Provider>
  );
}
