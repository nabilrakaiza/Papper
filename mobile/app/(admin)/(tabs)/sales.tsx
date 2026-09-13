import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from "victory-native";
import { supabase } from "../../../lib/supabase";
import { SalesPeriod } from "../../../types/sales";
import { orderTotal } from "../../../lib/constants";

type SalesDataPoint = { label: string; total: number };
type TopMenuItem = { name: string; quantity: number };
type MethodTotal = { method: string; label: string; count: number; total: number };

// Display labels for the stored method_of_payment values, which are English
// because they are what the CHECK constraint and the receipt logic use.
const METHOD_LABELS: Record<string, string> = {
  Cash: "Tunai",
  "Bank Transfer": "Transfer Bank",
  QRIS: "QRIS",
  Debit: "Debit",
  // Only ever reached by an order marked 'Split' that has no per-payer rows to
  // break down — which should not happen, but "Tidak dicatat" would be a lie
  // about an order that was very much recorded.
  Split: "Terpisah",
};

// Fixed order so the card doesn't reshuffle between periods.
const METHOD_ORDER = ["Cash", "QRIS", "Debit", "Bank Transfer"];

function formatRupiah(amount: number): string {
  if (amount >= 1_000_000) return "Rp " + (amount / 1_000_000).toFixed(1) + "M";
  if (amount >= 1_000) return "Rp " + (amount / 1_000).toFixed(0) + "K";
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatRupiahFull(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

const PERIOD_LABELS: { key: SalesPeriod; label: string }[] = [
  { key: "daily", label: "Harian" },
  { key: "weekly", label: "Mingguan" },
  { key: "monthly", label: "Bulanan" },
];

function PeriodToggle({
  period,
  onChange,
}: {
  period: SalesPeriod;
  onChange: (p: SalesPeriod) => void;
}) {
  return (
    <View className="flex-row bg-purple-100 rounded-2xl p-1 gap-1 self-start">
      {PERIOD_LABELS.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => onChange(key)}
          className={`px-3 py-1.5 rounded-xl ${period === key ? "bg-white" : ""}`}
        >
          <Text
            className={`text-xs font-extrabold ${
              period === key ? "text-purple-600" : "text-purple-300"
            }`}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Get date range based on period
function getDateRange(period: SalesPeriod): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();

  if (period === "daily") {
    // Last 7 days
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to };
  } else if (period === "weekly") {
    // Last 4 weeks
    const from = new Date(now);
    from.setDate(from.getDate() - 27);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to };
  } else {
    // Last 5 months
    const from = new Date(now);
    from.setMonth(from.getMonth() - 4);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to };
  }
}

// Group orders into chart data points
function groupOrders(
  orders: { created_at: string; total: number }[],
  period: SalesPeriod
): SalesDataPoint[] {
  const map: Record<string, number> = {};

  orders.forEach(({ created_at, total }) => {
    const date = new Date(created_at);
    let key = "";

    if (period === "daily") {
      key = date.toLocaleDateString("en-US", { weekday: "short" });
    } else if (period === "weekly") {
      // Week number label
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      key = date.toLocaleDateString("en-US", { month: "short" });
    }

    map[key] = (map[key] ?? 0) + total;
  });

  return Object.entries(map).map(([label, total]) => ({ label, total }));
}

export default function AdminSalesScreen() {
  // Hook, not Dimensions.get at module scope: that captured the width once at
  // import time, so the chart kept the launch orientation's width after a
  // rotation and either overflowed or left a gap.
  const { width } = useWindowDimensions();

  // 1. Split state into two independent periods
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("daily");
  const [topSellingPeriod, setTopSellingPeriod] = useState<SalesPeriod>("daily");
  
  const [chartData, setChartData] = useState<SalesDataPoint[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [topMenu, setTopMenu] = useState<TopMenuItem[]>([]);
  const [byMethod, setByMethod] = useState<MethodTotal[]>([]);
  const [outstanding, setOutstanding] = useState<{ count: number; total: number }>({
    count: 0,
    total: 0,
  });

  // Optional: Split loading states so one chart doesn't block the other visually
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingTopSelling, setLoadingTopSelling] = useState(true);

  // 2. Separate fetch function for Sales Chart
  const fetchSalesData = async (p: SalesPeriod) => {
    setLoadingSales(true);
    const { from, to } = getDateRange(p);

    const { data: orders } = await supabase
      .from("orders")
      .select("id, created_at, discount")
      .eq("status", "paid")
      .gte("created_at", from)
      .lte("created_at", to);

    if (!orders || orders.length === 0) {
      setChartData([]);
      setTotalSales(0);
      setByMethod([]);
      setLoadingSales(false);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, price, quantity")
      .in("order_id", orderIds);

    const ordersWithTotal = orders.map((order) => {
      const orderItems = (items ?? []).filter((i) => i.order_id === order.id);
      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      return {
        id: order.id,
        created_at: order.created_at,
        total: orderTotal(subtotal, order.discount),
      };
    });

    const total = ordersWithTotal.reduce((sum, o) => sum + o.total, 0);

    // How every order was paid — the only record of it, for every order. One row
    // for an ordinary payment, one per payer for a split bill.
    const { data: payments } = await supabase
      .from("order_payments")
      .select("order_id, amount, method_of_payment")
      .in("order_id", orderIds);

    const paymentsByOrder = new Map<number, { amount: number; method: string }[]>();
    for (const p of payments ?? []) {
      const list = paymentsByOrder.get(p.order_id) ?? [];
      list.push({ amount: p.amount, method: p.method_of_payment });
      paymentsByOrder.set(p.order_id, list);
    }

    // Split by payment method off the same rows — the breakdown always agrees
    // with the headline total because it is the same arithmetic.
    //
    // order_payments keeps the bill and the tender in separate columns, so
    // `amount` is directly summable. The old orders.payment_amount was not:
    // for cash it held the tender, so summing it overstated takings by whatever
    // change was handed back.
    const methodTotals = new Map<string, { count: number; total: number }>();

    const addToMethod = (method: string | null, amount: number) => {
      const key = method ?? "—";
      const entry = methodTotals.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += amount;
      methodTotals.set(key, entry);
    };

    for (const o of ordersWithTotal) {
      const shares = paymentsByOrder.get(o.id);

      // A paid order with no payment row should not exist. Attributing it to a
      // method would be inventing one, so it lands under "Tidak dicatat" where
      // it is visible rather than quietly folded into a real method's takings.
      if (!shares || shares.length === 0) {
        addToMethod(null, o.total);
        continue;
      }

      // Each share was rounded on its own when it was charged, so the shares
      // can sum to a rupiah or two either side of the order's recomputed total.
      // The residual goes on the largest share, which keeps this breakdown
      // adding up to the headline figure exactly — the invariant this map has
      // always had — without inventing a method that took no money.
      const charged = shares.reduce((sum, s) => sum + s.amount, 0);
      const residual = o.total - charged;
      const largest = shares.reduce(
        (best, s, idx) => (s.amount > shares[best].amount ? idx : best),
        0
      );

      shares.forEach((share, idx) => {
        addToMethod(share.method, share.amount + (idx === largest ? residual : 0));
      });
    }

    setByMethod(
      [...methodTotals.entries()]
        .map(([method, v]) => ({
          method,
          label: METHOD_LABELS[method] ?? "Tidak dicatat",
          ...v,
        }))
        .sort(
          (a, b) =>
            (METHOD_ORDER.indexOf(a.method) + 1 || 99) -
            (METHOD_ORDER.indexOf(b.method) + 1 || 99)
        )
    );

    setTotalSales(total);
    setChartData(groupOrders(ordersWithTotal, p));
    setLoadingSales(false);
  };

  // Open tabs, deliberately not filtered by the period toggle: an unpaid order
  // from last week is still owed today, and filtering it out of a "this week"
  // view is exactly how it gets forgotten.
  const fetchOutstanding = async () => {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, discount")
      .eq("status", "unpaid");

    if (!orders || orders.length === 0) {
      setOutstanding({ count: 0, total: 0 });
      return;
    }

    const orderIds = orders.map((o) => o.id);

    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, price, quantity")
      .in("order_id", orderIds);

    // A split bill stays 'unpaid' until the last payer settles, so part of what
    // these orders are worth may already be in the till. Counting the whole
    // figure as outstanding would overstate what is still owed.
    const { data: payments } = await supabase
      .from("order_payments")
      .select("order_id, amount")
      .in("order_id", orderIds);

    const collectedByOrder = new Map<number, number>();
    for (const p of payments ?? []) {
      collectedByOrder.set(p.order_id, (collectedByOrder.get(p.order_id) ?? 0) + p.amount);
    }

    const total = orders.reduce((sum, order) => {
      const subtotal = (items ?? [])
        .filter((i) => i.order_id === order.id)
        .reduce((s, i) => s + i.price * i.quantity, 0);
      const owed =
        orderTotal(subtotal, order.discount) - (collectedByOrder.get(order.id) ?? 0);
      return sum + Math.max(0, owed);
    }, 0);

    setOutstanding({ count: orders.length, total });
  };

  // 3. Separate fetch function for Top Selling Menu
  const fetchTopSellingData = async (p: SalesPeriod) => {
    setLoadingTopSelling(true);
    const { from, to } = getDateRange(p);

    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .gte("created_at", from)
      .lte("created_at", to);

    if (!orders || orders.length === 0) {
      setTopMenu([]);
      setLoadingTopSelling(false);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("name, quantity")
      .in("order_id", orderIds);

    const itemCount: Record<string, { name: string; qty: number }> = {};
    (items ?? []).forEach((item) => {
      if (!itemCount[item.name]) {
        itemCount[item.name] = { name: item.name, qty: 0 };
      }
      itemCount[item.name].qty += item.quantity;
    });

    const top = Object.values(itemCount)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((i) => ({ name: i.name, quantity: i.qty }));
      
    setTopMenu(top);
    setLoadingTopSelling(false);
  };

  useEffect(() => {
    fetchSalesData(salesPeriod);
  }, [salesPeriod]);

  useEffect(() => {
    fetchTopSellingData(topSellingPeriod);
  }, [topSellingPeriod]);

  useEffect(() => {
    fetchOutstanding();
  }, []);

  useEffect(() => {
    const subscription = supabase
      .channel("sales-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchSalesData(salesPeriod);
        fetchTopSellingData(topSellingPeriod);
        fetchOutstanding();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers for respective Period Toggles
  const handleSalesPeriodChange = (p: SalesPeriod) => {
    setSalesPeriod(p);
  };

  const handleTopSellingPeriodChange = (p: SalesPeriod) => {
    setTopSellingPeriod(p);
  };

  // Show full screen loader only if BOTH are loading on initial render
  const isInitialLoading = loadingSales && loadingTopSelling && chartData.length === 0 && topMenu.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Papper</Text>
        </View>
      </View>

      {isInitialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Sales Graph Card */}
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 mb-4 shadow-sm shadow-yellow-300/30">
            <View className="flex-row items-center justify-between mb-4">
              {/* Pass the specific sales state and handler */}
              <PeriodToggle period={salesPeriod} onChange={handleSalesPeriodChange} />
              <Text className="text-lg font-black text-gray-900">Total Penjualan</Text>
            </View>

            <View className="bg-cyan-100 rounded-2xl overflow-hidden min-h-[200px]">
              {loadingSales ? (
                 <View className="h-40 items-center justify-center">
                   <ActivityIndicator size="small" color="#3a7bd5" />
                 </View>
              ) : chartData.length > 0 ? (
                <View collapsable={false}>
                  <VictoryChart
                    key={salesPeriod}
                    width={width - 64}
                    height={200}
                    theme={VictoryTheme.material}
                    domainPadding={{ x: 20 }}
                    padding={{ top: 20, bottom: 40, left: 48, right: 16 }}
                  >
                    <VictoryAxis
                      style={{
                        tickLabels: { fontSize: 10, fontWeight: "600", fill: "#666" },
                        axis: { stroke: "transparent" },
                        grid: { stroke: "transparent" },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      tickFormat={(t) => formatRupiah(t)}
                      style={{
                        tickLabels: { fontSize: 8, fontWeight: "600", fill: "#888" },
                        axis: { stroke: "transparent" },
                        grid: { stroke: "rgba(0,0,0,0.06)", strokeDasharray: "4" },
                      }}
                    />
                    <VictoryBar
                      data={chartData.map((d) => ({ x: d.label, y: d.total }))}
                      style={{ data: { fill: "#4caf50", rx: 6 } }}
                      animate={{ duration: 400, onLoad: { duration: 400 } }}
                    />
                  </VictoryChart>
                </View>
              ) : (
                <View className="h-40 items-center justify-center">
                  <Text className="text-gray-400 font-bold text-sm">Tidak ada data penjualan untuk periode ini</Text>
                </View>
              )}

              {!loadingSales && (
                <View className="mx-4 mb-4 mt-2">
                  <View className="border border-gray-300 rounded-xl px-4 py-2 self-start bg-white/70">
                    <Text className="text-sm font-extrabold text-gray-800">
                      Total Penjualan : {formatRupiahFull(totalSales)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Payment method breakdown — follows the sales period toggle above,
              since it is a split of exactly that figure. */}
          <View className="bg-white rounded-3xl px-5 py-5 mb-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-black text-gray-900">Metode Bayar</Text>
              <Text className="text-[10px] font-extrabold text-gray-300 uppercase tracking-widest">
                periode grafik
              </Text>
            </View>

            {loadingSales ? (
              <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#3a7bd5" />
              </View>
            ) : byMethod.length === 0 ? (
              <Text className="text-gray-400 font-bold text-sm py-4 text-center">
                Tidak ada data untuk periode ini
              </Text>
            ) : (
              byMethod.map((m) => {
                const share = totalSales > 0 ? (m.total / totalSales) * 100 : 0;
                return (
                  <View key={m.method} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-sm font-bold text-gray-800">
                        {m.label}
                        <Text className="text-xs font-bold text-gray-400">
                          {"  "}
                          {m.count} pesanan
                        </Text>
                      </Text>
                      <Text className="text-sm font-extrabold text-gray-900">
                        {formatRupiahFull(m.total)}
                      </Text>
                    </View>
                    {/* Share bar — quicker to read than the percentages when
                        reconciling a till against the bank. */}
                    <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <View
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </View>
                  </View>
                );
              })
            )}

            {byMethod.some((m) => m.method === "—") && (
              <Text className="text-[11px] font-bold text-amber-600 leading-4 mt-1">
                Sebagian pesanan lunas tidak mencatat metode bayar — kemungkinan
                ditutup sebelum fitur ini ada.
              </Text>
            )}
          </View>

          {/* Outstanding tabs. Not period-filtered: an old unpaid order is the
              one most worth chasing. */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/orders")}
            activeOpacity={0.8}
            className={`rounded-3xl px-5 py-5 mb-4 flex-row items-center justify-between ${
              outstanding.count > 0 ? "bg-amber-100" : "bg-white"
            }`}
          >
            <View className="flex-1 pr-3">
              <Text
                className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${
                  outstanding.count > 0 ? "text-amber-500" : "text-gray-400"
                }`}
              >
                Belum Dibayar
              </Text>
              <Text
                className={`text-2xl font-black ${
                  outstanding.count > 0 ? "text-amber-700" : "text-gray-900"
                }`}
              >
                {formatRupiahFull(outstanding.total)}
              </Text>
              <Text
                className={`text-xs font-bold mt-1 ${
                  outstanding.count > 0 ? "text-amber-500" : "text-gray-400"
                }`}
              >
                {outstanding.count} pesanan terbuka · ketuk untuk rincian
              </Text>
            </View>
            <ChevronRight size={20} color={outstanding.count > 0 ? "#b45309" : "#9ca3af"} />
          </TouchableOpacity>

          {/* Per-order drill-down */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/orders")}
            activeOpacity={0.8}
            className="bg-white rounded-3xl px-5 py-4 mb-4 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-sm font-extrabold text-gray-900">
                Rincian Pesanan
              </Text>
              <Text className="text-xs font-bold text-gray-400 mt-0.5">
                Telusuri tiap pesanan beserta itemnya
              </Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </TouchableOpacity>

          {/* The PIN override trail. Sits here rather than in the tab bar
              because it is something you go looking for while reading the day's
              takings — a total that moved is the reason to ask who approved it. */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/overrides")}
            activeOpacity={0.8}
            className="bg-white rounded-3xl px-5 py-4 mb-4 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-sm font-extrabold text-gray-900">
                Otorisasi Manager
              </Text>
              <Text className="text-xs font-bold text-gray-400 mt-0.5">
                Pembatalan dan koreksi pesanan, beserta yang menyetujui
              </Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </TouchableOpacity>

          {/* Top Selling Menu Card */}
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 shadow-sm shadow-yellow-300/30">
            <View className="flex-row items-center justify-between mb-4">
               {/* Pass the specific top selling state and handler */}
              <PeriodToggle period={topSellingPeriod} onChange={handleTopSellingPeriodChange} />
              <Text className="text-lg font-black text-gray-900">Terlaris</Text>
            </View>

            <View className="bg-cyan-100 rounded-2xl px-4 py-2 min-h-[100px] justify-center">
              {loadingTopSelling ? (
                <View className="py-6 items-center">
                  <ActivityIndicator size="small" color="#3a7bd5" />
                </View>
              ) : topMenu.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-gray-400 font-bold text-sm">Tidak ada data untuk periode ini</Text>
                </View>
              ) : (
                topMenu.map((item, index) => (
                  <View key={item.name}>
                    <View className="flex-row items-center justify-between py-3">
                      <View className="flex-row items-center gap-3">
                        <View className="w-6 h-6 rounded-full bg-white/80 items-center justify-center">
                          <Text className="text-xs font-black text-gray-500">{index + 1}</Text>
                        </View>
                        <Text className="text-sm font-bold text-gray-800">{item.name}</Text>
                      </View>
                      <Text className="text-sm font-extrabold text-gray-600">
                        {item.quantity} pcs
                      </Text>
                    </View>
                    {index < topMenu.length - 1 && (
                      <View className="h-px bg-cyan-200" />
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}