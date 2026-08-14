import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext"; // adjust path to match your project

export default function LoginScreen() {
  const { authError, clearAuthError } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Surface role/platform rejection errors coming from AuthProvider
  useEffect(() => {
    if (authError) {
      setError(authError);
      setLoading(false);
    }
  }, [authError]);

  const handleLogin = async () => {
    setError("");
    clearAuthError();
    const email = username.trim().toLowerCase();

    if (!email) {
      setError("Nama pengguna kosong");
      return;
    }

    if (!password) {
      setError("Kata sandi kosong");
      return;
    }

    setLoading(true);
    const { error: authSignInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authSignInError) {
      setError("Nama pengguna atau kata sandi salah");
      setLoading(false);
      return;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {/* Scrollable rather than a centred flex child: in landscape with the
            keyboard up there isn't enough height for the card, and a plain
            centred View would clip the password field instead of scrolling. */}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 32,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        {/* Capped on every platform, not just web — a landscape tablet would
            otherwise stretch the login card the full width of the screen. */}
        <View className="w-full max-w-sm self-center">
          {/* Logo / title */}
          <View className="items-center mb-10">
            <Text className="text-blue-500 text-4xl font-black mb-1">✛</Text>
            <Text className="text-3xl font-black text-gray-900">Papper</Text>
            <Text className="text-sm font-bold text-gray-400 mt-1">
              Masuk untuk melanjutkan
            </Text>
          </View>

          {/* Card */}
          <View className="bg-yellow-100 rounded-3xl px-6 py-8 shadow-sm shadow-yellow-300/30">
            {/* Username */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Nama Pengguna
            </Text>
            <TextInput
              className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-4"
              placeholder="cth. admin"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#ccc"
            />

            {/* Password */}
            <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Kata Sandi
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
                <Text className="text-sm font-extrabold text-white">Masuk</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}