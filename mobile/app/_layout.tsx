import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, router, useSegments } from "expo-router";
import { ActivityIndicator, View, Platform, Text, TouchableOpacity } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import * as NavigationBar from 'expo-navigation-bar';
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { startTrail } from "../lib/printerTrail";

function Spinner() {
  return (
    <View className="flex-1 items-center justify-center bg-gray-100">
      <ActivityIndicator size="large" color="#3a7bd5" />
    </View>
  );
}

type Target = {
  group: string;
  path: "/(auth)/login" | "/(admin)/(tabs)" | "/(cashier)/(tabs)";
};

/**
 * Where a user belongs: the group the guard waits for, and the route the
 * redirect sends them to. Deliberately one function -- a guard that disagreed
 * with the redirect would hold the spinner forever.
 *
 * Null means there is nothing to decide: a session whose profile could not be
 * fetched, which gets the retry screen rather than a redirect.
 */
function targetFor(
  session: unknown,
  role: string | undefined,
  profileError: string | null
): Target | null {
  if (!session) return { group: "(auth)", path: "/(auth)/login" };
  if (role === "admin" || role === "superadmin") {
    return { group: "(admin)", path: "/(admin)/(tabs)" };
  }
  if (role === "cashier") return { group: "(cashier)", path: "/(cashier)/(tabs)" };

  // No profile and no excuse for it -- the account really has no usable role.
  if (!profileError) return { group: "(auth)", path: "/(auth)/login" };

  return null;
}

// app/_layout.tsx
function RootNavigator() {
  const { session, profile, loading, profileError, retryProfile, signOut } = useAuth();
  const [ready, setReady] = useState(false);
  const segments = useSegments();

  // Memoised so the object identity is stable: the redirect effect below
  // depends on it, and a fresh object each render would re-fire it each render.
  const target = useMemo(
    () => targetFor(session, profile?.role, profileError),
    [session, profile?.role, profileError]
  );

  // The tab bars ask for Nunito_700Bold but nothing ever loaded it, so the
  // labels silently fell back to the system font.
  //
  // Deliberately gated on `fontsLoaded || fontError`, not on `fontsLoaded`
  // alone: a font that fails to load is a cosmetic problem, and waiting on it
  // forever would turn it into the same splash-spinner hang we just fixed.
  const [fontsLoaded, fontError] = useFonts({ Nunito_700Bold });

  useEffect(() => {
    if (fontError) console.warn("Nunito failed to load, using system font:", fontError);
  }, [fontError]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    NavigationBar.setVisibilityAsync('hidden');
    const subscription = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === 'visible') {
        setTimeout(() => {
          NavigationBar.setVisibilityAsync('hidden');
        }, 3000);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);


  useEffect(() => {
    if (!loading) setReady(true);
  }, [loading]);

  useEffect(() => {
    if (!ready || !target) return;

    router.replace(target.path);
  }, [ready, target]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return <Spinner />;
  }

  // A valid session whose profile could not be fetched. Sending the user to log
  // in was the worst available option: they cannot sign in without a network
  // either, and the attempt reports itself as a wrong password. Hold here and
  // offer the two things that can actually help.
  if (session && !profile && profileError) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-100 px-8">
        <Text className="text-base font-black text-gray-900 mb-2 text-center">
          Tidak bisa memuat profil
        </Text>
        <Text className="text-sm font-bold text-gray-500 mb-6 text-center">
          {profileError}
        </Text>

        <TouchableOpacity
          onPress={retryProfile}
          className="w-full bg-blue-500 rounded-2xl py-4 items-center mb-3"
        >
          <Text className="text-sm font-extrabold text-white">Coba Lagi</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={signOut}
          className="w-full border-2 border-gray-200 rounded-2xl py-3 items-center"
        >
          <Text className="text-sm font-extrabold text-gray-500">Keluar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Nothing renders until the route matches who is logged in. router.replace
  // only runs in the effect above, a render *after* the one that would have
  // mounted the screen -- and that frame was enough for the admin Stok screen
  // to run its queries with no session, which the database refused out loud
  // once anon lost its grants. A screen the user has no business on should not
  // mount at all, not even briefly.
  if (!target || segments[0] !== target.group) {
    return <Spinner />;
  }

  return <Slot />;
}

export default function RootLayout() {
  // Read back the previous session's print trail before anything can overwrite
  // it. If the app died mid-print, this is the only record of how far it got.
  useEffect(() => {
    startTrail();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <RootNavigator />
          </BottomSheetModalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}