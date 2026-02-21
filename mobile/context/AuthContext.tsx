import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type UserRole = "admin" | "cashier" | null;

type AuthContextType = {
  session: Session | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  const extractRole = async (s: Session | null): Promise<UserRole> => {
    if (!s) return null;
    const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", s.user.id)
        .single();
    return (data?.role as UserRole) ?? null;
  };

  useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session: s } }) => {
    setSession(s);
    setRole(await extractRole(s));
    setLoading(false);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
    console.log("auth state changed:", _event, s);
    setSession(s);
    if (s) {
      setRole(await extractRole(s));
    } else {
      setRole(null);
    }
    setLoading(false);
  });

  return () => subscription.unsubscribe();
}, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);