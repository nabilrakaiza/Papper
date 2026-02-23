import {
  View,
  Text,
//   SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { User, Mail, Shield, LogOut } from "lucide-react-native";

type Profile = {
  email: string;
  role: string;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session) return;

      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      setProfile({
        email: session.user.email ?? "—",
        role: data?.role ?? "—",
      });
      setLoading(false);
    };

    fetchProfile();
  }, [session]);

  const roleLabel = profile?.role === "admin" ? "Admin" : "Cashier";
  const roleColor =
    profile?.role === "admin" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600";

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">Profile</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
        </View>
      ) : (
        <View className="px-5 mt-4">
          {/* Avatar */}
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-gray-900 items-center justify-center mb-3">
              <User size={36} color="white" />
            </View>
            <View className={`px-3 py-1 rounded-xl ${roleColor}`}>
              <Text className="text-xs font-extrabold">{roleLabel}</Text>
            </View>
          </View>

          {/* Info card */}
          <View className="bg-yellow-100 rounded-3xl px-5 py-5 shadow-sm mb-4">
            {/* Email */}
            <View className="flex-row items-center gap-3 py-3 border-b border-yellow-200">
              <View className="w-8 h-8 rounded-xl bg-white/70 items-center justify-center">
                <Mail size={16} color="#555" />
              </View>
              <View>
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                  Email
                </Text>
                <Text className="text-sm font-bold text-gray-800">{profile?.email}</Text>
              </View>
            </View>

            {/* Role */}
            <View className="flex-row items-center gap-3 py-3">
              <View className="w-8 h-8 rounded-xl bg-white/70 items-center justify-center">
                <Shield size={16} color="#555" />
              </View>
              <View>
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                  Role
                </Text>
                <Text className="text-sm font-bold text-gray-800">{roleLabel}</Text>
              </View>
            </View>
          </View>

          {/* Sign out */}
          <TouchableOpacity
            onPress={signOut}
            className="w-full bg-red-50 border-2 border-red-100 rounded-2xl py-4 flex-row items-center justify-center gap-2"
          >
            <LogOut size={18} color="#ef4444" />
            <Text className="text-sm font-extrabold text-red-500">Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}