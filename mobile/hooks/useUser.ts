import { useAuth } from "@/context/AuthContext";
import { Profile } from "@/types/profile";

// Optional: Define what the combined user looks like
export type CurrentUser = Profile & { 
  email?: string; 
};

export const useUser = () => {
  const { session, profile, loading } = useAuth();

  if (!session || !profile) {
    return { user: null, loading };
  }

  // Combine them into one clean object
  const user: CurrentUser = {
    ...profile,
    email: session.user.email,
  };

  return { user, loading };
};