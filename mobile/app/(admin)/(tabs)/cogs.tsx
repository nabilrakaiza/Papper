import { View, Text, ScrollView, TouchableOpacity} from "react-native";
import { User } from "lucide-react-native";
import { MenuItem } from "../../../types/menu";
import { SafeAreaView } from "react-native-safe-area-context";

const DUMMY_MENU: MenuItem[] = [
  { id: 1, name: "Ayam Goreng", sellingPrice: 35000, cogs: 18000 },
  { id: 2, name: "Chicken Rice", sellingPrice: 30000, cogs: 14000 },
  { id: 3, name: "Laksa Mana", sellingPrice: 28000, cogs: null },
  { id: 4, name: "Rendang", sellingPrice: 40000, cogs: 22000 },
  { id: 5, name: "Gulai Ayam", sellingPrice: 32000, cogs: null },
  { id: 6, name: "Nasi Uduk", sellingPrice: 20000, cogs: 9000 },
];

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function MarginBadge({ cogs, price }: { cogs: number; price: number }) {
  const margin = ((price - cogs) / price) * 100;
  const isGood = margin >= 50;
  return (
    <View
      className={`px-2 py-0.5 rounded-lg ${isGood ? "bg-green-100" : "bg-yellow-100"}`}
    >
      <Text
        className={`text-xs font-extrabold ${isGood ? "text-green-600" : "text-yellow-600"}`}
      >
        {margin.toFixed(0)}% margin
      </Text>
    </View>
  );
}

export default function CogsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">COGS</Text>
        </View>
        <TouchableOpacity className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center">
          <User size={18} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Info banner */}
        <View className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs font-bold text-blue-400 leading-5">
            COGS is automatically updated based on the latest stock purchase prices.
            Items without linked ingredients show as pending.
          </Text>
        </View>

        {/* Menu cards */}
        {DUMMY_MENU.map((item) => (
          <View
            key={item.id}
            className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm shadow-yellow-300/30"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-black text-gray-900">{item.name}</Text>
              {item.cogs !== null ? (
                <MarginBadge cogs={item.cogs} price={item.sellingPrice} />
              ) : (
                <View className="bg-gray-100 px-2 py-0.5 rounded-lg">
                  <Text className="text-xs font-extrabold text-gray-400">Pending</Text>
                </View>
              )}
            </View>

            <View className="bg-cyan-100 rounded-xl px-4 py-3 gap-2">
              {/* Selling price */}
              <View className="flex-row justify-between items-center">
                <Text className="text-xs font-bold text-gray-500">Selling Price</Text>
                <Text className="text-sm font-extrabold text-gray-800">
                  {formatRupiah(item.sellingPrice)}
                </Text>
              </View>

              {/* Divider */}
              <View className="h-px bg-cyan-200" />

              {/* COGS */}
              <View className="flex-row justify-between items-center">
                <Text className="text-xs font-bold text-gray-500">COGS</Text>
                {item.cogs !== null ? (
                  <Text className="text-sm font-extrabold text-gray-800">
                    {formatRupiah(item.cogs)}
                  </Text>
                ) : (
                  <Text className="text-sm font-bold text-gray-300">
                    — not set
                  </Text>
                )}
              </View>

              {/* Gross profit */}
              {item.cogs !== null && (
                <>
                  <View className="h-px bg-cyan-200" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-xs font-bold text-gray-500">Gross Profit</Text>
                    <Text className="text-sm font-extrabold text-green-600">
                      {formatRupiah(item.sellingPrice - item.cogs)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}