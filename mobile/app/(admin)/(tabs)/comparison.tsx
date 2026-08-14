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
import { ChevronLeft, ArrowUpRight, ArrowDownRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { TAX_RATE } from "../../../lib/constants";

type MonthTotals = {
  purchases: number;
  revenue: number;
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function monthBounds(d: Date): { from: Date; to: Date } {
  return {
    from: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
    // Exclusive upper bound — the first instant of the next month. Avoids the
    // 23:59:59.999 trick, which silently drops anything in the final millisecond.
    to: new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

/** The last `count` months, newest first, as first-of-month dates. */
function recentMonths(count: number): Date[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - i, 1)
  );
}

function pct(from: number, to: number): number | null {
  if (from === 0) return null; // no meaningful percentage against a zero base
  return ((to - from) / Math.abs(from)) * 100;
}

function DeltaBadge({ value, higherIsBetter }: { value: number | null; higherIsBetter: boolean }) {
  if (value === null) {
    return <Text className="text-xs font-bold text-gray-300">—</Text>;
  }

  const rising = value >= 0;
  const good = higherIsBetter ? rising : !rising;
  const Icon = rising ? ArrowUpRight : ArrowDownRight;

  return (
    <View className="flex-row items-center gap-0.5">
      <Icon size={13} color={good ? "#16a34a" : "#dc2626"} />
      <Text
        className={`text-xs font-extrabold ${good ? "text-green-600" : "text-red-600"}`}
      >
        {rising ? "+" : ""}
        {value.toFixed(0)}%
      </Text>
    </View>
  );
}

export default function ComparisonScreen() {
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === "superadmin";

  const months = recentMonths(12);
  // Default to comparing last month against this month.
  const [monthA, setMonthA] = useState<Date>(months[1] ?? months[0]);
  const [monthB, setMonthB] = useState<Date>(months[0]);
  const [picking, setPicking] = useState<"A" | "B" | null>(null);

  const [totalsA, setTotalsA] = useState<MonthTotals | null>(null);
  const [totalsB, setTotalsB] = useState<MonthTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMonth = useCallback(async (month: Date): Promise<MonthTotals> => {
    const { from, to } = monthBounds(month);

    // Purchases: expenses.total_cost is a generated column (quantity * price).
    const { data: expenses, error: expenseError } = await supabase
      .from("expenses")
      .select("total_cost")
      .gte("expense_date", from.toISOString())
      .lt("expense_date", to.toISOString());

    if (expenseError) throw expenseError;

    const purchases = (expenses ?? []).reduce(
      (sum, e) => sum + Number(e.total_cost),
      0
    );

    // Revenue: paid orders only, with the same discount/tax formula the sales
    // screen and the receipt use, so the numbers reconcile across screens.
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id, discount")
      .eq("status", "paid")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString());

    if (orderError) throw orderError;

    let revenue = 0;
    if (orders && orders.length > 0) {
      const { data: items, error: itemError } = await supabase
        .from("order_items")
        .select("order_id, price, quantity")
        .in("order_id", orders.map((o) => o.id));

      if (itemError) throw itemError;

      revenue = orders.reduce((sum, order) => {
        const subtotal = (items ?? [])
          .filter((i) => i.order_id === order.id)
          .reduce((s, i) => s + i.price * i.quantity, 0);
        return sum + subtotal * (1 - order.discount / 100) * (1 + TAX_RATE);
      }, 0);
    }

    return { purchases, revenue };
  }, []);

  const load = useCallback(async () => {
    if (!isSuperadmin) return;

    setLoading(true);
    setError("");

    try {
      const [a, b] = await Promise.all([fetchMonth(monthA), fetchMonth(monthB)]);
      setTotalsA(a);
      setTotalsB(b);
    } catch {
      setError("Gagal memuat perbandingan.");
      setTotalsA(null);
      setTotalsB(null);
    }

    setLoading(false);
  }, [monthA, monthB, fetchMonth, isSuperadmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isSuperadmin) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
          <TouchableOpacity onPress={() => router.back()}>
            <ChevronLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text className="text-xl font-black text-gray-900">Perbandingan</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-sm font-bold text-gray-400 text-center">
            Halaman ini hanya untuk superadmin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const marginA = totalsA ? totalsA.revenue - totalsA.purchases : 0;
  const marginB = totalsB ? totalsB.revenue - totalsB.purchases : 0;

  const rows = [
    {
      label: "Pembelian",
      a: totalsA?.purchases ?? 0,
      b: totalsB?.purchases ?? 0,
      // Spending more is not an improvement.
      higherIsBetter: false,
    },
    {
      label: "Penjualan",
      a: totalsA?.revenue ?? 0,
      b: totalsB?.revenue ?? 0,
      higherIsBetter: true,
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Perbandingan Bulan</Text>
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
        {/* Month pickers */}
        <View className="flex-row gap-3 mb-4">
          {(["A", "B"] as const).map((slot) => {
            const value = slot === "A" ? monthA : monthB;
            return (
              <TouchableOpacity
                key={slot}
                onPress={() => setPicking(picking === slot ? null : slot)}
                className={`flex-1 border-2 rounded-2xl px-4 py-3 ${
                  picking === slot
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-0.5">
                  {slot === "A" ? "Bulan 1" : "Bulan 2"}
                </Text>
                <Text className="text-sm font-extrabold text-gray-900">
                  {monthLabel(value)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {picking && (
          <View className="bg-white rounded-2xl p-3 mb-4 flex-row flex-wrap gap-2">
            {months.map((m) => {
              const selected =
                monthLabel(m) === monthLabel(picking === "A" ? monthA : monthB);
              return (
                <TouchableOpacity
                  key={m.toISOString()}
                  onPress={() => {
                    if (picking === "A") setMonthA(m);
                    else setMonthB(m);
                    setPicking(null);
                  }}
                  className={`border-2 rounded-xl px-3 py-1.5 ${
                    selected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selected ? "text-blue-600" : "text-gray-600"
                    }`}
                  >
                    {monthLabel(m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {loading && (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#3a7bd5" />
          </View>
        )}

        {!!error && (
          <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {!loading && !error && (
          <View className="bg-white rounded-3xl px-5 py-5">
            {/* Column headers */}
            <View className="flex-row items-end pb-3 border-b border-gray-100">
              <Text className="flex-1 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                Pos
              </Text>
              <Text className="w-24 text-right text-[10px] font-extrabold text-gray-400">
                {monthLabel(monthA)}
              </Text>
              <Text className="w-24 text-right text-[10px] font-extrabold text-gray-400">
                {monthLabel(monthB)}
              </Text>
              <View className="w-16 items-end">
                <Text className="text-[10px] font-extrabold text-gray-400">Δ</Text>
              </View>
            </View>

            {rows.map((row) => (
              <View
                key={row.label}
                className="flex-row items-center py-3 border-b border-gray-50"
              >
                <Text className="flex-1 text-sm font-bold text-gray-700">
                  {row.label}
                </Text>
                <Text className="w-24 text-right text-xs font-bold text-gray-900">
                  {formatRupiah(row.a)}
                </Text>
                <Text className="w-24 text-right text-xs font-bold text-gray-900">
                  {formatRupiah(row.b)}
                </Text>
                <View className="w-16 items-end">
                  <DeltaBadge
                    value={pct(row.a, row.b)}
                    higherIsBetter={row.higherIsBetter}
                  />
                </View>
              </View>
            ))}

            {/* Margin */}
            <View className="flex-row items-center pt-4">
              <Text className="flex-1 text-sm font-black text-gray-900">
                Selisih
              </Text>
              <Text
                className={`w-24 text-right text-xs font-extrabold ${
                  marginA < 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {formatRupiah(marginA)}
              </Text>
              <Text
                className={`w-24 text-right text-xs font-extrabold ${
                  marginB < 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {formatRupiah(marginB)}
              </Text>
              <View className="w-16 items-end">
                <DeltaBadge value={pct(marginA, marginB)} higherIsBetter />
              </View>
            </View>
          </View>
        )}

        {!loading && !error && (
          <Text className="text-[11px] font-bold text-gray-400 leading-4 mt-4 px-1">
            Pembelian diambil dari tanggal pembelian (bukan tanggal input), jadi
            restock yang dibackdate masuk ke bulan yang benar. Penjualan dihitung
            dari pesanan berstatus lunas, setelah diskon dan termasuk pajak{" "}
            {TAX_RATE * 100}%. Selisih ini belum dikurangi biaya lain di luar
            pembelian stok.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
