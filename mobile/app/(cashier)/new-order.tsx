import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [step, setStep] = useState<"info" | "menu">("info");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [stockWarning, setStockWarning] = useState<string | null>(null);

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
      note: notes[m.id] || "",
      isSent: false,
      isCancelled: false,
      printBatch: 1,
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
      if (current - 1 === 0) {
        setNotes((prevNotes) => {
          const newNotes = { ...prevNotes };
          delete newNotes[id];
          return newNotes;
        });
      }
      return { ...prev, [id]: current - 1 };
    });
  }, []);

  const handleNoteChange = useCallback((id: number, text: string) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
  }, []);

  const handleConfirm = async (force = false) => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    setError("");

    try {
      const { error, stockWarning } = await addOrder(
        {
          customerName,
          seat,
          items: selectedItems,
          discount: 0,
          status: "unpaid",
        },
        force
      );

      if (stockWarning) {
        setStockWarning(stockWarning);
        setSaving(false);
        return;
      }

      if (error) {
        setError(error);
        setSaving(false);
        return;
      }

      setSaving(false);
      router.back();
    } catch (err: any) {
      console.error("Unhandled crash during order:", err);
      setError(err.message || "An unexpected error occurred.");
      setSaving(false);
    }
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="bg-yellow-100 px-4 pt-4 pb-3">
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
          keyboardShouldPersistTaps="handled"
        >
          {categoryItems.map((item) => {
            const qty = quantities[item.id] ?? 0;
            return (
              <View
                key={item.id}
                className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm"
              >
                <View className="flex-row items-center justify-between">
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

                {qty > 0 && (
                  <View className="mt-3 pt-3 border-t border-yellow-200/50">
                    <TextInput
                      className="w-full bg-white/70 rounded-xl px-3 py-2 text-xs font-bold text-gray-800"
                      placeholder={`Notes for ${item.name} (optional)`}
                      placeholderTextColor="#9ca3af"
                      value={notes[item.id] || ""}
                      onChangeText={(text) => handleNoteChange(item.id, text)}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {!!error && (
          <View className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {totalItems > 0 && (
          <View className="absolute bottom-0 left-0 right-0">
            <View className="mx-4 mb-2 bg-green-400 rounded-3xl px-5 py-4 shadow-sm">
              {summaryOpen && (
                <View className="mb-3 max-h-60">
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {selectedItems.map((item) => (
                      <View key={item.menuId} className="mb-2">
                        <View className="flex-row justify-between mb-0.5">
                          <Text className="text-sm font-bold text-white flex-1 pr-2">
                            {item.quantity}x {item.name}
                          </Text>
                          <Text className="text-sm font-bold text-white">
                            {formatRupiah(item.price * item.quantity)}
                          </Text>
                        </View>
                        {!!item.note && (
                          <Text className="text-xs font-bold text-white/80 italic">
                            └ Note: {item.note}
                          </Text>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                  <View className="h-px bg-white/30 my-2" />
                  <View className="flex-row justify-between">
                    <Text className="text-sm font-extrabold text-white">Total</Text>
                    <Text className="text-sm font-extrabold text-white">
                      {formatRupiah(subtotal)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleConfirm(false)}
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

              <TouchableOpacity
                onPress={() => setSummaryOpen((o) => !o)}
                disabled={saving}
                className="flex-row items-center gap-2"
              >
                <View className="border-2 border-white/60 rounded-xl px-3 py-1">
                  <Text className="text-sm font-extrabold text-white">
                    {totalItems} Items
                  </Text>
                </View>
                <Text className="text-white/70 text-xs font-bold">
                  {summaryOpen ? "▼ tap to collapse" : "▲ tap to review"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Stock Warning Modal */}
        {!!stockWarning && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center px-6">
            <View className="bg-white rounded-3xl px-6 py-6 w-full shadow-xl">
              <Text className="text-base font-black text-gray-900 mb-2">
                ⚠️ Stock Warning
              </Text>
              <Text className="text-sm font-bold text-gray-600 mb-5">
                {stockWarning}
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setStockWarning(null)}
                  className="flex-1 border-2 border-gray-200 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-extrabold text-gray-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setStockWarning(null);
                    handleConfirm(true);
                  }}
                  className="flex-1 bg-yellow-400 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-extrabold text-gray-900">
                    Proceed Anyway
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}