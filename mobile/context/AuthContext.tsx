import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { isConnectionError, NO_CONNECTION } from "../lib/errors";
import { Profile } from "@/types/profile";
import { Platform } from "react-native";

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  /** Set when a session exists but its profile could not be loaded. */
  profileError: string | null;
  retryProfile: () => void;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  authError: null,
  profileError: null,
  retryProfile: () => {},
  signOut: async () => {},
  clearAuthError: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileAttempt, setProfileAttempt] = useState(0);

  const retryProfile = () => setProfileAttempt((n) => n + 1);

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
        setProfileError(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  // Keyed on the access token, not the user id.
  //
  // Signing in again mints a new token for the *same* user, so a dependency of
  // [userId] never changed and this effect never re-ran: after a failed fetch
  // the profile stayed null for the life of the process, and a correct login
  // just bounced back to the login screen until the app was restarted. The
  // token also changes on every refresh, so a failure now heals itself within
  // the refresh cycle instead of needing a restart.
  const accessToken = session?.access_token ?? null;

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

      // Never reaching the server is not the same as the server saying no.
      // Both used to clear the profile, and _layout reads a session with no
      // profile as "not authorised" and sends the user to log in — throwing
      // away a perfectly good session because of a dropped request, and landing
      // them on a screen that cannot work offline either.
      if (error && isConnectionError(error)) {
        setProfileError(NO_CONNECTION);
        setLoading(false);
        return;
      }

      if (error || !data) {
        console.error("Error fetching profile:", error);
        setProfile(null);
        setProfileError(null);
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
      setProfileError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, accessToken, profileAttempt]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const clearAuthError = () => setAuthError(null);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, authError, profileError, retryProfile, signOut, clearAuthError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
