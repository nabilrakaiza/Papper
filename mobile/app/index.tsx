import { View, ActivityIndicator } from "react-native";

/**
 * The route the app opens on, and deliberately empty.
 *
 * With no index here, expo-router's default route was the first group it found
 * -- (admin)/(tabs) -- so the admin Stok screen mounted and fired its queries
 * for a frame before the guard in _layout.tsx could send a logged-out user to
 * login. Opening on a route that asks the database for nothing means there is
 * nothing to fail and nothing to leak; the guard then routes by role.
 */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-gray-100">
      <ActivityIndicator size="large" color="#3a7bd5" />
    </View>
  );
}
