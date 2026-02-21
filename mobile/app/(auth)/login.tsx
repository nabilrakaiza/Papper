import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
//   SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

// Maps plain username → email used in Supabase
const USERNAME_MAP: Record<string, string> = {
  admin: "admin@papper.com",
  cashier: "cashier@papper.com",
};

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    const email = USERNAME_MAP[username.trim().toLowerCase()];

    if (!email) {
      setError("Unknown username");
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (authError) {
      setError("Invalid username or password");
    }
    // Navigation is handled by the root layout reacting to session change
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-center px-8"
      >
        {/* Logo / title */}
        <View className="items-center mb-10">
          <Text className="text-blue-500 text-4xl font-black mb-1">✛</Text>
          <Text className="text-3xl font-black text-gray-900">Papper</Text>
          <Text className="text-sm font-bold text-gray-400 mt-1">
            Sign in to continue
          </Text>
        </View>

        {/* Card */}
        <View className="bg-yellow-100 rounded-3xl px-6 py-8 shadow-sm shadow-yellow-300/30">
          {/* Username */}
          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
            Username
          </Text>
          <TextInput
            className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-4"
            placeholder="e.g. admin"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#ccc"
          />

          {/* Password */}
          <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
            Password
          </Text>
          <TextInput
            className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-2"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#ccc"
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          {/* Error */}
          {!!error && (
            <Text className="text-xs font-bold text-red-500 mb-3">{error}</Text>
          )}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            className="bg-green-500 rounded-2xl py-4 items-center mt-2 shadow shadow-green-600/30"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-sm font-extrabold text-white">Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}