// context/auth.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';

// Define what your user object looks like
// You can expand this later with name, cafeId, etc.
type User = {
  email: string;
  role: 'admin' | 'cashier' | 'waiter'; 
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  signIn: (role: 'admin' | 'cashier' | 'waiter') => void; // Modified for demo purposes
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  signIn: () => {},
  signOut: () => {},
});

// This hook can be used to access the user info.
export function useAuth() {
  return useContext(AuthContext);
}

// This provider wraps your app and makes auth available everywhere
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate checking for a stored token when the app starts
  useEffect(() => {
    // In a real app, you would check SecureStore or AsyncStorage here
    setTimeout(() => {
      setIsLoading(false); 
    }, 1000);
  }, []);

  const signIn = (role: 'admin' | 'cashier' | 'waiter') => {
    // In a real app, you'd validate credentials with your backend here
    setUser({
      email: 'user@example.com',
      role: role,
    });
  };

  const signOut = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}