import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, router } from "expo-router";
import { ActivityIndicator, View, Platform } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import * as NavigationBar from 'expo-navigation-bar';
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts, Nunito_700Bold } from "@expo-google-fonts/nunito";

// app/_layout.tsx
function RootNavigator() {
  const { session, profile, loading } = useAuth();
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
    } else {
      router.replace("/(auth)/login");
    }
  }, [session, profile, ready]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-100">
        <ActivityIndicator size="large" color="#3a7bd5" />
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