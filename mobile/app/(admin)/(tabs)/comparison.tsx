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
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { TAX_RATE, orderTotal } from "../../../lib/constants";

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

/**
 * "Agu 2026". Every label on this screen sits in a fixed-width slot — between
 * the stepper arrows, or in a table column header — and "September 2026" at
 * full length overflows both on a phone.
 */
function monthLabelShort(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

function monthBounds(d: Date): { from: Date; to: Date } {
  return {
    from: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
    // Exclusive upper bound — the first instant of the next month. Avoids the
    // 23:59:59.999 trick, which silently drops anything in the final millisecond.
    to: new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

/** First of the current month — the newest month worth offering. */
function thisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Steps a month forwards or backwards, staying on the 1st. */
function shiftMonth(d: Date, by: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + by, 1);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
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

  // Default to comparing last month against this month.
  const [monthA, setMonthA] = useState<Date>(() => shiftMonth(thisMonth(), -1));
  const [monthB, setMonthB] = useState<Date>(thisMonth);

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
        return sum + orderTotal(subtotal, order.discount);
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
        {/* Month steppers. Nothing expands or collapses here on purpose: the
            old picker pushed the comparison table off screen the moment you
            touched it, so you could never see the numbers you were changing. */}
        <View className="flex-row gap-3 mb-3">
          {(["A", "B"] as const).map((slot) => {
            const value = slot === "A" ? monthA : monthB;
            const setValue = slot === "A" ? setMonthA : setMonthB;
            // Nothing to compare against the future, so forward stops at the
            // current month.
            const canGoForward = !sameMonth(value, thisMonth());

            return (
              <View
                key={slot}
                className="flex-1 border-2 border-gray-200 bg-white rounded-2xl px-2 py-2.5"
              >
                <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest text-center mb-1">
                  {slot === "A" ? "Bulan 1" : "Bulan 2"}
                </Text>

                <View className="flex-row items-center justify-between">
                  <TouchableOpacity
                    onPress={() => setValue(shiftMonth(value, -1))}
                    hitSlop={8}
                    className="px-1.5 py-1"
                  >
                    <ChevronLeft size={18} color="#3a7bd5" />
                  </TouchableOpacity>

                  <Text className="text-sm font-extrabold text-gray-900">
                    {monthLabelShort(value)}
                  </Text>

                  <TouchableOpacity
                    onPress={() => canGoForward && setValue(shiftMonth(value, 1))}
                    disabled={!canGoForward}
                    hitSlop={8}
                    className="px-1.5 py-1"
                  >
                    <ChevronRight size={18} color={canGoForward ? "#3a7bd5" : "#e5e7eb"} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* The two comparisons anyone actually reaches for, in one tap. */}
        <View className="flex-row gap-2 mb-4">
          {[
            {
              label: "Bulan lalu ↔ ini",
              apply: () => {
                setMonthA(shiftMonth(thisMonth(), -1));
                setMonthB(thisMonth());
              },
              active:
                sameMonth(monthA, shiftMonth(thisMonth(), -1)) &&
                sameMonth(monthB, thisMonth()),
            },
            {
              label: "vs tahun lalu",
              apply: () => {
                setMonthA(shiftMonth(monthB, -12));
              },
              active: sameMonth(monthA, shiftMonth(monthB, -12)),
            },
          ].map((preset) => (
            <TouchableOpacity
              key={preset.label}
              onPress={preset.apply}
              className={`flex-1 rounded-xl py-2 items-center border-2 ${
                preset.active
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <Text
                className={`text-xs font-extrabold ${
                  preset.active ? "text-blue-600" : "text-gray-500"
                }`}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Comparing a month with itself produces a table of zero deltas, which
            reads like a bug rather than a choice. */}
        {sameMonth(monthA, monthB) && (
          <View className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 mb-4">
            <Text className="text-xs font-bold text-amber-600 text-center">
              Kedua kolom bulan yang sama — pilih bulan berbeda untuk melihat
              selisih.
            </Text>
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
                {monthLabelShort(monthA)}
              </Text>
              <Text className="w-24 text-right text-[10px] font-extrabold text-gray-400">
                {monthLabelShort(monthB)}
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
