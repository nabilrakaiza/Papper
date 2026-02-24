import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
//   SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react-native";
import { useOrders } from "../../context/OrderContext";
import { CATEGORIES } from "../../data/menu";
import { MenuCategory, OrderItem } from "../../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function NewOrderScreen() {
  const { menu, addOrder } = useOrders();

  const [customerName, setCustomerName] = useState("");
  const [seat, setSeat] = useState("");
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [step, setStep] = useState<"info" | "menu">("info");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const increment = useCallback((id: number) => {
    setQuantities((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((id: number) => {
    setQuantities((prev) => {
      const current = prev[id] ?? 0;
      if (current <= 0) return prev;
      return { ...prev, [id]: current - 1 };
    });
  }, []);

  const handleConfirm = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    setError("");

    const { error } = await addOrder({
      customerName,
      seat,
      items: selectedItems,
      discount: 0,
      status: "unpaid",
    });

    if (error) {
      setError(error);
      setSaving(false);
      return;
    }

    router.back();
  };

  // Step 1: customer info
  if (step === "info") {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
            <TouchableOpacity onPress={() => router.back()}>
              <ChevronLeft size={24} color="#333" />
            </TouchableOpacity>
            <Text className="text-xl font-black text-gray-900">New Order</Text>
          </View>

          <View className="px-5 mt-4">
            <View className="bg-yellow-100 rounded-3xl px-5 py-6 shadow-sm">
              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Customer Name
              </Text>
              <TextInput
                className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-4"
                placeholder="e.g. Bu Aliyah"
                value={customerName}
                onChangeText={setCustomerName}
                placeholderTextColor="#ccc"
                autoFocus
              />

              <Text className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">
                Seat
              </Text>
              <TextInput
                className="w-full bg-white border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-sm text-gray-900 mb-2"
                placeholder="e.g. A1"
                value={seat}
                onChangeText={setSeat}
                placeholderTextColor="#ccc"
                autoCapitalize="characters"
              />

              {!!error && (
                <Text className="text-xs font-bold text-red-500 mb-2">{error}</Text>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (!customerName.trim()) { setError("Customer name is required"); return; }
                  if (!seat.trim()) { setError("Seat is required"); return; }
                  setError("");
                  setStep("menu");
                }}
                className="bg-green-500 rounded-2xl py-4 items-center mt-2 shadow shadow-green-600/30"
              >
                <Text className="text-sm font-extrabold text-white">
                  Next → Select Menu
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Step 2: menu selection
  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="bg-yellow-100 px-4 pt-4 pb-3 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity onPress={() => setStep("info")}>
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5">
              <Text className="text-sm font-bold text-gray-700">Menu Order</Text>
            </View>
          </TouchableOpacity>
          <Text className="text-xs font-bold text-gray-400">
            {customerName} · {seat}
          </Text>
        </View>

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

        {categoryItems.length === 0 && (
          <Text className="text-center text-gray-300 font-bold mt-10">
            No available items in this category
          </Text>
        )}
      </ScrollView>

      {/* Error message */}
      {!!error && (
        <View className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
        </View>
      )}

      {/* Bottom summary bar */}
      {totalItems > 0 && (
        <View className="absolute bottom-0 left-0 right-0">
          <TouchableOpacity
            onPress={() => setSummaryOpen((o) => !o)}
            disabled={saving}
            className="mx-4 mb-2 bg-green-400 rounded-3xl px-5 py-4 shadow shadow-green-600/30"
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
                  onPress={handleConfirm}
                  disabled={saving}
                  className="mt-3 bg-white rounded-xl py-3 items-center"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#22c55e" />
                  ) : (
                    <Text className="text-sm font-extrabold text-green-600">
                      Confirm Order
                    </Text>
                  )}
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
                {summaryOpen ? "▼ tap to collapse" : "▲ tap to review"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}