import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
//   SafeAreaView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { CATEGORIES } from "../../../data/menu";
import { MenuCategory, OrderItem } from "../../../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, menu, updateOrder } = useOrders();

  const order = orders.find((o) => o.id === Number(id));

  const [categoryIndex, setCategoryIndex] = useState(0);
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(order?.items.map((i) => [i.menuId, i.quantity]) ?? [])
  );
  const [summaryOpen, setSummaryOpen] = useState(false);

  const increment = useCallback((menuId: number) => {
    setQuantities((prev) => ({ ...prev, [menuId]: (prev[menuId] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((menuId: number) => {
    setQuantities((prev) => {
      const current = prev[menuId] ?? 0;
      if (current <= 0) return prev;
      return { ...prev, [menuId]: current - 1 };
    });
  }, []);

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order not found</Text>
      </SafeAreaView>
    );
  }

  const currentCategory: MenuCategory = CATEGORIES[categoryIndex];
  const categoryItems = menu.filter(
    (m) => m.category === currentCategory && m.available
  );

  const selectedItems: OrderItem[] = menu
    .filter((m) => (quantities[m.id] ?? 0) > 0)
    .map((m) => ({
      menuId: m.id,
      name: m.name,
      price: m.price,
      quantity: quantities[m.id],
      category: m.category,
    }));

  const totalItems = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleSave = () => {
    updateOrder(order.id, { items: selectedItems });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="bg-yellow-100 px-4 pt-4 pb-3 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity onPress={() => router.back()}>
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
              <ChevronLeft size={16} color="#555" />
              <Text className="text-sm font-bold text-gray-700">Menu Order</Text>
            </View>
          </TouchableOpacity>
          <Text className="text-xs font-bold text-gray-400">
            {order.customerName} · {order.seat}
          </Text>
        </View>

        {/* Category selector */}
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setCategoryIndex((i) => Math.max(0, i - 1))}
            disabled={categoryIndex === 0}
          >
            <ChevronLeft size={22} color={categoryIndex === 0 ? "#ccc" : "#333"} />
          </TouchableOpacity>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            <View className="flex-row gap-2">
              {CATEGORIES.map((cat, idx) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategoryIndex(idx)}
                  className={`border-2 rounded-xl px-3 py-1.5 ${
                    idx === categoryIndex
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      idx === categoryIndex ? "text-green-600" : "text-gray-600"
                    }`}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            onPress={() =>
              setCategoryIndex((i) => Math.min(CATEGORIES.length - 1, i + 1))
            }
            disabled={categoryIndex === CATEGORIES.length - 1}
          >
            <ChevronRight
              size={22}
              color={categoryIndex === CATEGORIES.length - 1 ? "#ccc" : "#333"}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menu items */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        {categoryItems.map((item) => {
          const qty = quantities[item.id] ?? 0;
          return (
            <View
              key={item.id}
              className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-900">{item.name}</Text>
                <Text className="text-xs font-bold text-gray-400 mt-0.5">
                  {formatRupiah(item.price)}
                </Text>
              </View>

              <View className="flex-row items-center gap-3">
                {qty > 0 && (
                  <>
                    <TouchableOpacity onPress={() => decrement(item.id)}>
                      <Minus size={18} color="#555" />
                    </TouchableOpacity>
                    <Text className="text-sm font-extrabold text-gray-900 w-5 text-center">
                      {qty}
                    </Text>
                  </>
                )}
                <TouchableOpacity onPress={() => increment(item.id)}>
                  <Plus size={18} color="#555" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom bar */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-4">
        <TouchableOpacity
          onPress={() => setSummaryOpen((o) => !o)}
          className="bg-green-400 rounded-3xl px-5 py-4 shadow shadow-green-600/30"
        >
          {summaryOpen && (
            <View className="mb-3">
              {selectedItems.map((item) => (
                <View key={item.menuId} className="flex-row justify-between mb-1">
                  <Text className="text-sm font-bold text-white">
                    {item.quantity}x {item.name}
                  </Text>
                  <Text className="text-sm font-bold text-white">
                    {formatRupiah(item.price * item.quantity)}
                  </Text>
                </View>
              ))}
              <View className="h-px bg-white/30 my-2" />
              <View className="flex-row justify-between">
                <Text className="text-sm font-extrabold text-white">Total</Text>
                <Text className="text-sm font-extrabold text-white">
                  {formatRupiah(subtotal)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleSave}
                className="mt-3 bg-white rounded-xl py-3 items-center"
              >
                <Text className="text-sm font-extrabold text-green-600">Save Changes</Text>
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row items-center gap-2">
            <View className="border-2 border-white/60 rounded-xl px-3 py-1">
              <Text className="text-sm font-extrabold text-white">
                {totalItems} Items
              </Text>
            </View>
            <Text className="text-white/70 text-xs font-bold">
              {summaryOpen ? "▼ collapse" : "▲ review & save"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}