import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Profile } from "@/types/profile";
import { Platform } from "react-native";

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  authError: null,
  signOut: async () => {},
  clearAuthError: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // supabase-js runs onAuthStateChange callbacks while holding its internal auth
  // lock, and every supabase.from()/auth.* call awaits that same lock to attach
  // the access token. Awaiting one from inside the callback deadlocks: the lock
  // waits on the callback, the callback waits on the lock, and `loading` never
  // flips — the app sits on the splash spinner forever. So this callback stays
  // synchronous; the profile is fetched in the effect below, outside the lock.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, name")
        .eq("id", userId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        console.error("Error fetching profile:", error);
        setProfile(null);
        setLoading(false);
        return;
      }

      const prof = data as Profile;

      if (Platform.OS === "web" && prof.role !== "admin" && prof.role !== "superadmin") {
        setAuthError("Hanya akun admin yang dapat masuk di versi web.");
        setProfile(null);
        setLoading(false);
        // Don't keep the rejected session around. Safe to await here — we are
        // outside the auth-state-change callback, so no lock is held.
        await supabase.auth.signOut();
        return;
      }

      setProfile(prof);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider value={{ session, profile, loading, authError, signOut, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
