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

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, name")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.error("Error fetching profile:", error);
      return null;
    }

    if (Platform.OS === "web" && data.role !== "admin") {
      await supabase.auth.signOut();
      setAuthError("Hanya akun admin yang dapat masuk di versi web.");
      return null;
    }

    return data as Profile;
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const prof = s ? await fetchProfile(s.user.id) : null;
      if (!isMounted) return;

      // If we rejected this user (web + non-admin), don't keep the session around
      if (s && !prof) {
        setSession(null);
        setProfile(null);
      } else {
        setSession(s);
        setProfile(prof);
      }

      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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