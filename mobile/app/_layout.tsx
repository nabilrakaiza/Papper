import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, router } from "expo-router";
import { ActivityIndicator, View, Platform } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";
import * as NavigationBar from 'expo-navigation-bar';

// app/_layout.tsx
function RootNavigator() {
  const { session, role, loading } = useAuth();
  const [ready, setReady] = useState(false);

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
      // console.log("p1") 
      router.replace("/(auth)/login");
    } else if (role === "admin") {
      // console.log("p2")
      router.replace("/(admin)/(tabs)");
    } else if (role === "cashier") {
      // console.log("p3")
      router.replace("/(cashier)/(tabs)");
    } else {
      // console.log("p4")
      router.replace("/(auth)/login");
    }
  }, [session, role, ready]);

  if (!ready) {
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
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}