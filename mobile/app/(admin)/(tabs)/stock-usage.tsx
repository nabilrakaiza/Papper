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
import { ChevronLeft, AlertTriangle } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../../context/AuthContext";

type UsageRow = {
  stock_id: number;
  stock_name: string;
  unit: string;
  quantity_used: number;
  price_per_unit: number;
  value_used: number;
};

type Unmapped = {
  custom_lines: number;
  recipeless_lines: number;
};

const PERIODS = ["Bulan Ini", "Bulan Lalu", "30 Hari", "Semua"] as const;
type Period = (typeof PERIODS)[number];

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

// Ingredient quantities are stored in the recipe's own unit (gr, ml, pcs), so
// they can run to five figures. Showing "80.000 gr" rather than "80000 gr"
// keeps the column scannable.
function formatQuantity(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100;
  return `${rounded.toLocaleString("id-ID")} ${unit}`;
}

function getRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (period === "Bulan Ini") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
  }
  if (period === "Bulan Lalu") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (period === "30 Hari") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  // "Semua" — the app predates 2026, so this comfortably covers everything.
  return { from: new Date(2000, 0, 1), to };
}

export default function StockUsageScreen() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === "superadmin";

  const [period, setPeriod] = useState<Period>("Bulan Ini");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [unmapped, setUnmapped] = useState<Unmapped | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchUsage = useCallback(async () => {
    if (!isSuperadmin) return;

    setLoading(true);
    setError("");

    const { from, to } = getRange(period);
    const { data, error: rpcError } = await supabase.rpc("stock_usage_report", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });

    if (rpcError) {
      setError("Gagal memuat laporan pemakaian stok.");
      setRows([]);
      setUnmapped(null);
    } else {
      setRows(data?.items ?? []);
      setUnmapped(data?.unmapped ?? null);
    }

    setLoading(false);
  }, [period, isSuperadmin]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // The RPC enforces this too — this is just so the screen says why rather than
  // showing an empty report.
  if (!isSuperadmin) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
          <TouchableOpacity onPress={() => router.back()}>
            <ChevronLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-gray-900">Pemakaian Stok</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm font-bold text-gray-400 text-center">
            Halaman ini hanya untuk superadmin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalValue = rows.reduce((sum, r) => sum + Number(r.value_used), 0);
  const unaccounted =
    (unmapped?.custom_lines ?? 0) + (unmapped?.recipeless_lines ?? 0);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Pemakaian Stok</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 40,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              className={`border-2 rounded-xl px-3 py-1.5 ${
                p === period
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  p === period ? "text-blue-600" : "text-gray-500"
                }`}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total */}
        <View className="bg-blue-100 rounded-3xl px-5 py-5 mb-4">
          <Text className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest mb-1">
            Nilai Stok Terpakai
          </Text>
          <Text className="text-2xl font-black text-blue-700">
            {formatRupiah(totalValue)}
          </Text>
          <Text className="text-xs font-bold text-blue-400 mt-1">
            {rows.length} jenis bahan · dihitung dari resep saat ini
          </Text>
        </View>

        {loading && (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#3a7bd5" />
          </View>
        )}

        {!!error && (
          <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {/* Lines the report cannot attribute to any ingredient. Shown so the
            total above is never mistaken for the whole picture. */}
        {!loading && unaccounted > 0 && (
          <View className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4 flex-row gap-3">
            <AlertTriangle size={16} color="#d97706" />
            <View className="flex-1">
              <Text className="text-xs font-extrabold text-amber-700 mb-0.5">
                {unaccounted} item tidak terhitung
              </Text>
              <Text className="text-[11px] font-bold text-amber-600 leading-4">
                {unmapped?.custom_lines ?? 0} item kustom (di luar menu) dan{" "}
                {unmapped?.recipeless_lines ?? 0} menu tanpa resep. Keduanya tidak
                memotong stok, jadi tidak muncul di angka di atas.
              </Text>
            </View>
          </View>
        )}

        {!loading && rows.length === 0 && !error && (
          <View className="py-10 items-center">
            <Text className="text-sm font-bold text-gray-400">
              Belum ada pemakaian pada periode ini
            </Text>
          </View>
        )}

        {!loading &&
          rows.map((row) => (
            <View
              key={row.stock_id}
              className="bg-white rounded-2xl px-4 py-4 mb-3 shadow-sm"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-gray-900">
                    {row.stock_name}
                  </Text>
                  <Text className="text-xs font-bold text-gray-400 mt-0.5">
                    {formatQuantity(Number(row.quantity_used), row.unit)} ·{" "}
                    {formatRupiah(row.price_per_unit)}/{row.unit}
                  </Text>
                </View>
                <Text className="text-sm font-extrabold text-gray-900">
                  {formatRupiah(Number(row.value_used))}
                </Text>
              </View>
            </View>
          ))}

        {!loading && rows.length > 0 && (
          <Text className="text-[11px] font-bold text-gray-400 leading-4 mt-2 px-1">
            Dihitung dari pesanan yang sudah memotong stok, termasuk pesanan yang
            dibatalkan — pembatalan tidak mengembalikan stok. Resep dibaca sesuai
            kondisi saat ini, jadi perubahan resep ikut mempengaruhi angka
            periode lampau.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
