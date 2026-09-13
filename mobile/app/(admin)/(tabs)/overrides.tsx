import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, ShieldCheck, ShieldX } from "lucide-react-native";
import { supabase } from "@/lib/supabase";

/**
 * The PIN override trail.
 *
 * Every action in this app that can rewrite a recorded sale — cancelling an
 * order, correcting a settled one — is gated behind a superadmin PIN, and each
 * attempt writes a row whether it succeeded or not. This is the first screen to
 * show them; until now the only way to read the trail was raw SQL, which meant
 * the people approving overrides had no practical way to review them.
 *
 * Names come from `override_log_report`, not from a join here: `profiles` is
 * readable own-row-only, so a client reading the log directly gets UUIDs.
 */

type LogRow = {
  id: number;
  orderId: number | null;
  action: string;
  success: boolean;
  createdAt: Date;
  cashierName: string | null;
  adminName: string | null;
};

const PERIODS = ["Hari Ini", "7 Hari", "Bulan Ini", "Bulan Lalu"] as const;
type Period = (typeof PERIODS)[number];

const FILTERS = ["Semua", "Koreksi", "Pembatalan", "Gagal"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * What each logged action means, in the language the staff use for it.
 *
 * The `_blocked` variants are not failed PIN attempts — they are attempts made
 * while the lockout was already in force, which is a different thing to see in
 * a list and worth naming differently.
 */
const ACTION_LABELS: Record<string, string> = {
  cancel: "Pembatalan pesanan",
  cancel_blocked: "Pembatalan ditolak (terkunci)",
  reopen: "Koreksi pesanan",
  reopen_blocked: "Koreksi ditolak (terkunci)",
  delete: "Hapus pesanan",
  delete_blocked: "Hapus ditolak (terkunci)",
};

function getRange(period: Period): { from: Date; to: Date } {
  const now = new Date();

  if (period === "Hari Ini") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (period === "7 Hari") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === "Bulan Ini") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

function formatWhen(d: Date): string {
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminOverridesScreen() {
  const [period, setPeriod] = useState<Period>("7 Hari");
  const [filter, setFilter] = useState<Filter>("Semua");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLog = useCallback(async () => {
    setLoading(true);
    setError("");

    // One finally covers every exit, including a thrown request — the pattern
    // the other admin screens settled on after a throw left one spinning.
    try {
      const { from, to } = getRange(period);

      const { data, error: rpcError } = await supabase.rpc("override_log_report", {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });

      if (rpcError) {
        // 42501 is the role check inside the RPC. Everything else is a
        // connection or server problem, and saying "not allowed" for those
        // would send an admin looking for a permission they already have.
        setError(
          rpcError.code === "42501"
            ? "Anda tidak punya akses ke catatan ini."
            : "Gagal memuat catatan otorisasi."
        );
        setRows([]);
        return;
      }

      setRows(
        (data ?? []).map((r: any) => ({
          id: r.id,
          orderId: r.order_id ?? null,
          action: r.action,
          success: r.success,
          createdAt: new Date(r.created_at),
          cashierName: r.cashier_name ?? null,
          adminName: r.admin_name ?? null,
        }))
      );
    } catch (e) {
      console.error("Failed to load override log:", e);
      setError("Gagal memuat catatan otorisasi. Periksa koneksi Anda.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const visible = rows.filter((r) => {
    if (filter === "Semua") return true;
    if (filter === "Gagal") return !r.success;
    if (filter === "Koreksi") return r.action.startsWith("reopen");
    return r.action.startsWith("cancel") || r.action.startsWith("delete");
  });

  const approvals = rows.filter((r) => r.success).length;
  const refused = rows.length - approvals;

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-lg font-black text-gray-900">Otorisasi Manager</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 48,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-xs font-bold text-gray-400 mb-4">
          Setiap pembatalan dan koreksi pesanan butuh PIN superadmin. Percobaan
          yang gagal ikut tercatat.
        </Text>

        {/* Period */}
        <View className="flex-row flex-wrap gap-2 mb-3">
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              className={`rounded-xl px-3 py-1.5 border-2 ${
                period === p
                  ? "bg-blue-500 border-blue-500"
                  : "bg-white border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  period === p ? "text-white" : "text-gray-500"
                }`}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Kind */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              className={`rounded-xl px-3 py-1.5 border-2 ${
                filter === f
                  ? "bg-gray-800 border-gray-800"
                  : "bg-white border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  filter === f ? "text-white" : "text-gray-500"
                }`}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!loading && !error && rows.length > 0 && (
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-white rounded-2xl px-4 py-3">
              <Text className="text-[10px] font-extrabold text-gray-400 uppercase">
                Disetujui
              </Text>
              <Text className="text-xl font-black text-gray-900">{approvals}</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl px-4 py-3">
              <Text className="text-[10px] font-extrabold text-gray-400 uppercase">
                Ditolak
              </Text>
              <Text
                className={`text-xl font-black ${
                  refused > 0 ? "text-red-500" : "text-gray-900"
                }`}
              >
                {refused}
              </Text>
            </View>
          </View>
        )}

        {loading && (
          <View className="items-center mt-16">
            <ActivityIndicator size="small" color="#3a7bd5" />
          </View>
        )}

        {!!error && !loading && (
          <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {!loading && !error && visible.length === 0 && (
          <View className="items-center mt-16">
            <Text className="text-gray-300 font-bold text-sm">
              Tidak ada catatan pada periode ini.
            </Text>
          </View>
        )}

        {!loading &&
          !error &&
          visible.map((row) => (
            <View
              key={row.id}
              className={`bg-white rounded-2xl px-4 py-3 mb-2 border-l-4 ${
                row.success ? "border-green-400" : "border-red-400"
              }`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-extrabold text-gray-800">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </Text>
                  <Text className="text-xs font-bold text-gray-400 mt-0.5">
                    {/* A hard-deleted order nulls its own id out of the log so
                        the trail survives it — say that rather than print
                        "Pesanan null". */}
                    {row.orderId != null
                      ? `Pesanan #${row.orderId}`
                      : "Pesanan sudah dihapus"}
                    {" · "}
                    {formatWhen(row.createdAt)}
                  </Text>
                </View>

                {row.success ? (
                  <ShieldCheck size={18} color="#22c55e" />
                ) : (
                  <ShieldX size={18} color="#ef4444" />
                )}
              </View>

              <View className="h-px bg-gray-100 my-2" />

              <Text className="text-xs font-bold text-gray-500">
                Diminta oleh : {row.cashierName ?? "—"}
              </Text>
              <Text className="text-xs font-bold text-gray-500 mt-0.5">
                {/* Null on a refusal, which is the whole point: nobody approved
                    it, so naming someone would be a lie. */}
                Disetujui oleh : {row.adminName ?? "— (tidak disetujui)"}
              </Text>
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}
