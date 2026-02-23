import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from "victory-native";
import { supabase } from "../../../lib/supabase";
import { SalesPeriod } from "../../../types/sales";

const { width } = Dimensions.get("window");

type SalesDataPoint = { label: string; total: number };
type TopMenuItem = { name: string; quantity: number };

function formatRupiah(amount: number): string {
  if (amount >= 1_000_000) return "Rp " + (amount / 1_000_000).toFixed(1) + "M";
  if (amount >= 1_000) return "Rp " + (amount / 1_000).toFixed(0) + "K";
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatRupiahFull(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

const PERIOD_LABELS: { key: SalesPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
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
          className={`px-3 py-1.5 rounded-xl ${period === key ? "bg-white shadow" : ""}`}
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
  const [period, setPeriod] = useState<SalesPeriod>("daily");
  const [chartData, setChartData] = useState<SalesDataPoint[]>([]);
  const [topMenu, setTopMenu] = useState<TopMenuItem[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSales = async (p: SalesPeriod) => {
    setLoading(true);
    const { from, to } = getDateRange(p);

    // Fetch paid orders in range
    const { data: orders } = await supabase
      .from("orders")
      .select("id, created_at, discount")
      .eq("status", "paid")
      .gte("created_at", from)
      .lte("created_at", to);

    if (!orders || orders.length === 0) {
      setChartData([]);
      setTopMenu([]);
      setTotalSales(0);
      setLoading(false);
      return;
    }

    // Fetch order items for those orders
    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, name, price, quantity")
      .in("order_id", orderIds);

    // Calculate total per order (with discount)
    const ordersWithTotal = orders.map((order) => {
      const orderItems = (items ?? []).filter((i) => i.order_id === order.id);
      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const total = subtotal * (1 - order.discount / 100);
      return { created_at: order.created_at, total };
    });

    // Total sales
    const total = ordersWithTotal.reduce((sum, o) => sum + o.total, 0);
    setTotalSales(total);

    // Chart data
    setChartData(groupOrders(ordersWithTotal, p));

    // Top menu items
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

    setLoading(false);
  };

  useEffect(() => {
    fetchSales(period);

    const subscription = supabase
      .channel("sales-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchSales(period)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [period]);

  const handlePeriodChange = (p: SalesPeriod) => {
    setPeriod(p);
    fetchSales(p);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Papper</Text>
        </View>
      </View>

      {loading ? (
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
              <PeriodToggle period={period} onChange={handlePeriodChange} />
              <Text className="text-lg font-black text-gray-900">Total Sales</Text>
            </View>

            <View className="bg-cyan-100 rounded-2xl overflow-hidden">
              {chartData.length > 0 ? (
                <View collapsable={false}>
                  <VictoryChart
                    key={period}
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
                  <Text className="text-gray-400 font-bold text-sm">No sales data for this period</Text>
                </View>
              )}

              <View className="mx-4 mb-4">
                <View className="border border-gray-300 rounded-xl px-4 py-2 self-start bg-white/70">
                  <Text className="text-sm font-extrabold text-gray-800">
                    Total Sales : {formatRupiahFull(totalSales)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Top Selling Menu Card */}
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 shadow-sm shadow-yellow-300/30">
            <View className="flex-row items-center justify-between mb-4">
              <PeriodToggle period={period} onChange={handlePeriodChange} />
              <Text className="text-lg font-black text-gray-900">Top Selling</Text>
            </View>

            <View className="bg-cyan-100 rounded-2xl px-4 py-2">
              {topMenu.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-gray-400 font-bold text-sm">No data for this period</Text>
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