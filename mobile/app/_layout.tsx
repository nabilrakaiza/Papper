import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot, router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import "../global.css";

function RootNavigator() {
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    console.log("session:", session);
    console.log("role:", role);

    if (!session) {
      router.replace("/(auth)/login");
    } else if (role === "admin") {
      router.replace("/(admin)/(tabs)");
    } else if (role === "cashier") {
      router.replace("/(cashier)/(tabs)");
    } else {
      // Logged in but no recognised role — send back to login
      router.replace("/(auth)/login");
    }
  }, [session, role, loading]);

  if (loading) {
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
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}