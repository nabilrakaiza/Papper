import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { User } from "lucide-react-native";
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from "victory-native";
import { SalesPeriod, SalesDataPoint, TopMenuItem } from "../../../types/sales";

const { width } = Dimensions.get("window");

// ── Dummy data ────────────────────────────────────────────────
const DAILY_DATA: SalesDataPoint[] = [
  { label: "Mon", total: 2800000 },
  { label: "Tue", total: 3200000 },
  { label: "Wed", total: 2100000 },
  { label: "Thu", total: 4000000 },
  { label: "Fri", total: 4800000 },
  { label: "Sat", total: 5200000 },
  { label: "Sun", total: 3800000 },
];

const WEEKLY_DATA: SalesDataPoint[] = [
  { label: "Wk 1", total: 18000000 },
  { label: "Wk 2", total: 22000000 },
  { label: "Wk 3", total: 19500000 },
  { label: "Wk 4", total: 25000000 },
];

const MONTHLY_DATA: SalesDataPoint[] = [
  { label: "Oct", total: 72000000 },
  { label: "Nov", total: 85000000 },
  { label: "Dec", total: 98000000 },
  { label: "Jan", total: 76000000 },
  { label: "Feb", total: 20000000 },
];

const TOP_MENU: TopMenuItem[] = [
  { id: 1, name: "Ayam Goreng", quantity: 23 },
  { id: 2, name: "Chicken Rice", quantity: 22 },
  { id: 3, name: "Laksa Mana", quantity: 21 },
  { id: 4, name: "Rendang", quantity: 20 },
  { id: 5, name: "Gulai Ayam", quantity: 19 },
];

const PERIOD_LABELS: { key: SalesPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

function formatRupiah(amount: number): string {
  if (amount >= 1_000_000) return "Rp " + (amount / 1_000_000).toFixed(1) + "M";
  if (amount >= 1_000) return "Rp " + (amount / 1_000).toFixed(0) + "K";
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatRupiahFull(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

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

export default function SalesScreen() {
  const [period, setPeriod] = useState<SalesPeriod>("daily");

  const data =
    period === "daily"
      ? DAILY_DATA
      : period === "weekly"
      ? WEEKLY_DATA
      : MONTHLY_DATA;

  const totalSales = data.reduce((sum, d) => sum + d.total, 0);

  const chartData = data.map((d, i) => ({ x: d.label, y: d.total, i }));

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Papper</Text>
        </View>
        <TouchableOpacity className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center">
          <User size={18} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Sales Graph Card ─────────────────────────────── */}
        <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 mb-4 shadow-sm shadow-yellow-300/30">
          <View className="flex-row items-center justify-between mb-4">
            <PeriodToggle period={period} onChange={setPeriod} />
            <Text className="text-lg font-black text-gray-900">Total Sales</Text>
          </View>

          {/* Chart */}
          <View className="bg-cyan-100 rounded-2xl overflow-hidden">
            <VictoryChart
              width={width - 64}
              height={200}
            //   theme={VictoryTheme.clean}
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
                data={chartData}
                style={{
                  data: {
                    fill: "#4caf50",
                    rx: 6,
                  },
                }}
                animate={{ duration: 400, onLoad: { duration: 400 } }}
              />
            </VictoryChart>

            {/* Total label */}
            <View className="mx-4 mb-4">
              <View className="border border-gray-300 rounded-xl px-4 py-2 self-start bg-white/70">
                <Text className="text-sm font-extrabold text-gray-800">
                  Total Sales : {formatRupiahFull(totalSales)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Top Selling Menu Card ─────────────────────────── */}
        <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 shadow-sm shadow-yellow-300/30">
          <View className="flex-row items-center justify-between mb-4">
            <PeriodToggle period={period} onChange={setPeriod} />
            <Text className="text-lg font-black text-gray-900">Top Selling</Text>
          </View>

          <View className="bg-cyan-100 rounded-2xl px-4 py-2">
            {TOP_MENU.map((item, index) => (
              <View key={item.id}>
                <View className="flex-row items-center justify-between py-3">
                  {/* Rank + name */}
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
                {index < TOP_MENU.length - 1 && (
                  <View className="h-px bg-cyan-200" />
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}