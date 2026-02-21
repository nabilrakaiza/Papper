// app/_layout.tsx
import "../global.css";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Slot } from "expo-router";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Slot />
    </GestureHandlerRootView>
  );
}