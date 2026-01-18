// app/_layout.tsx
import { Slot, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/context/auth";
import { useEffect, useState } from "react";

export default function Root() {
  // Wrap the entire app in the AuthProvider
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}

function MainLayout() {
  // This is where your Gatekeeper logic (useEffect) from the previous answer goes.
  // Because it's inside AuthProvider, it can use the useAuth() hook.

  const { user, isLoading } = useAuth();
  const segments = useSegments(); // Gets the current path segments
  const router = useRouter();
  const [isNavigationReady, setIsNavigationReady] = useState(false);

  const firstSegment = segments[0] as string;

  useEffect(() => {
    if (isLoading) return;

    // Check which "group" the user is trying to access
    const inAuthGroup = firstSegment === 'auth';
    const inAdminGroup = firstSegment === 'admin';
    const inCashierGroup = firstSegment === 'cashier';
    const inWaiterGroup = firstSegment === 'waiter';


    if (!user && !inAuthGroup) {
      // 1. If not logged in, kick to Login
      router.replace('/auth/login');

    } else if (user && inAuthGroup) {
      if (user.role === 'admin') {
        router.replace('/admin'); // Goes to app/(admin)/index.tsx
      } else if (user.role === 'cashier') {
        router.replace('/cashier'); // Goes to app/(cashier)/index.tsx
      } else {
        router.replace('/waiter'); // Goes to app/(waiter)/index.tsx
      }
    } else if (user && user.role === 'admin' && inCashierGroup) {
       // 3. Security: If admin tries to force access to cashier page
       router.replace('/admin');
    } else if (user && user.role === 'admin' && inWaiterGroup) {
       // 3. Security: If admin tries to force access to waiter page
       router.replace('/admin');
    }

    setIsNavigationReady(true);
  }, [user, segments, isLoading]);

  // Render the current screen
  if (isLoading || !isNavigationReady) {
    return null;
  }
  
  return <Slot />;
}