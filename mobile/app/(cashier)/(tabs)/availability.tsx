import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
//   SafeAreaView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrders } from "../../../context/OrderContext";
import { CATEGORIES } from "../../../data/menu";
import { MenuCategory } from "../../../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function AvailabilityScreen() {
  const { menu, toggleMenuAvailability } = useOrders();
  const [expandedCategory, setExpandedCategory] = useState<MenuCategory | null>("Ayam");

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">Availability</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map((category) => {
          const categoryItems = menu.filter((m) => m.category === category);
          const isExpanded = expandedCategory === category;

          return (
            <View key={category} className="mb-3">
              {/* Category header */}
              <TouchableOpacity
                onPress={() =>
                  setExpandedCategory(isExpanded ? null : category)
                }
                className="bg-yellow-100 rounded-2xl px-4 py-4 shadow-sm"
              >
                <View className="flex-row items-center justify-between">
                  <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
                    <Text className="text-sm font-bold text-gray-700">
                      {category} Selections
                    </Text>
                  </View>
                  <Text className="text-gray-400 font-bold text-sm">
                    {isExpanded ? "▲" : "▼"}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Expanded items */}
              {isExpanded && (
                <View className="bg-yellow-50 rounded-2xl mt-1 overflow-hidden border border-yellow-200">
                  {categoryItems.map((item, index) => (
                    <View key={item.id}>
                      <View className="flex-row items-center justify-between px-4 py-3">
                        <View>
                          <Text className="text-sm font-bold text-gray-800">
                            {item.name}
                          </Text>
                          <Text className="text-xs font-bold text-gray-400">
                            {formatRupiah(item.price)}
                          </Text>
                        </View>
                        <Switch
                          value={item.available}
                          onValueChange={() => toggleMenuAvailability(item.id)}
                          trackColor={{ false: "#e5e7eb", true: "#a78bfa" }}
                          thumbColor={item.available ? "white" : "#f4f3f4"}
                        />
                      </View>
                      {index < categoryItems.length - 1 && (
                        <View className="h-px bg-yellow-200 mx-4" />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Confirm button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6">
        <TouchableOpacity className="w-full bg-green-400 rounded-2xl py-4 items-center shadow shadow-green-600/30">
          <Text className="text-sm font-extrabold text-white">
            Confirm Availability
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}