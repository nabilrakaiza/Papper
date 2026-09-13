import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js refreshes the access token on a timer, and on native that timer
// stops being serviced once the app is backgrounded. Coming back to a
// long-backgrounded app therefore left us holding an expired token until the
// next tick happened to fire — every query in between failed with a 401.
// Tying the refresher to foreground/background restarts it (and forces an
// immediate refresh) the moment the app becomes active again.
//
// Web is excluded: the browser keeps timers running and supabase-js already
// hooks visibility changes there itself.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
