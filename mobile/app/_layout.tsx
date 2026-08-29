import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, router } from "expo-router";
import { ActivityIndicator, View, Platform, Text, TouchableOpacity } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import * as NavigationBar from 'expo-navigation-bar';
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts, Nunito_700Bold } from "@expo-google-fonts/nunito";

// app/_layout.tsx
function RootNavigator() {
  const { session, profile, loading, profileError, retryProfile, signOut } = useAuth();
  const [ready, setReady] = useState(false);

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
    if (!ready) return;

    if (!session) {
      router.replace("/(auth)/login");
    } else if (profile?.role === "admin" || profile?.role === "superadmin") {
      router.replace("/(admin)/(tabs)");
    } else if (profile?.role === "cashier") {
      router.replace("/(cashier)/(tabs)");
    } else if (!profileError) {
      // No profile and no excuse for it — the account really has no usable
      // role. A profileError means we simply could not ask, which is not
      // grounds for logging anyone out; the screen below handles that.
      router.replace("/(auth)/login");
    }
  }, [session, profile, ready, profileError]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-100">
        <ActivityIndicator size="large" color="#3a7bd5" />
      </View>
    );
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

  return <Slot />;
}

export default function RootLayout() {
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