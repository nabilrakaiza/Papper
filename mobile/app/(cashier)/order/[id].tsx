import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { CATEGORIES } from "../../../data/menu";
import { MenuCategory, OrderItem } from "../../../types/order";
import ConfirmDialog from "@/components/ConfirmDialog";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, menu, updateOrder } = useOrders();
  const order = orders.find((o) => o.id === Number(id));
  
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Handling cancel
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!order) return;
    setSaving(true); // Reuse your saving state to prevent multi-taps
    
    const { error } = await updateOrder(order.id, { status: "cancelled" });
    
    setSaving(false);
    if (error) {
      setCancelError(error);
      setShowCancelDialog(false);
    } else {
      setShowCancelDialog(false);
      router.back(); // Kick them back to the index screen after canceling
    }
  };

  // Initialize quantities AND existing notes from the current order
  const [quantities, setQuantities] = useState<Record<number, number>>(
    Object.fromEntries(order?.items.map((i) => [i.menuId, i.quantity]) ?? [])
  );
  
  const [notes, setNotes] = useState<Record<number, string>>(
    Object.fromEntries(order?.items.map((i) => [i.menuId, i.note || ""]) ?? [])
  );

  const increment = useCallback((menuId: number) => {
    setQuantities((prev) => ({ ...prev, [menuId]: (prev[menuId] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((menuId: number) => {
    setQuantities((prev) => {
      const current = prev[menuId] ?? 0;
      if (current <= 0) return prev;
      
      // Clear the note if quantity drops to 0
      if (current - 1 === 0) {
        setNotes((prevNotes) => {
          const newNotes = { ...prevNotes };
          delete newNotes[menuId];
          return newNotes;
        });
      }
      
      return { ...prev, [menuId]: current - 1 };
    });
  }, []);

  const handleNoteChange = useCallback((id: number, text: string) => {
    setNotes((prev) => ({ ...prev, [id]: text }));
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

  const currentMaxBatch = Math.max(...(order?.items.map(i => i.printBatch) ?? [1]), 1);
  const selectedItems: OrderItem[] = [];

  menu.forEach((m) => {
    const finalQty = quantities[m.id] ?? 0;
    if (finalQty === 0) return; // Item completely removed

    // Find all existing rows for this specific menu item
    const existingEntries = order?.items.filter((i) => i.menuId === m.id) ?? [];
    const oldTotalQty = existingEntries.reduce((sum, i) => sum + i.quantity, 0);
    const currentNote = notes[m.id] || "";

    if (finalQty === oldTotalQty) {
      // CASE A: No quantity change. Just keep existing entries.
      existingEntries.forEach((entry) => {
        selectedItems.push({ ...entry, note: currentNote });
      });
      
    } else if (finalQty > oldTotalQty) {
      // CASE B: Quantity increased! (The Delta)
      // First, keep the old entries exactly as they were
      existingEntries.forEach((entry) => {
        selectedItems.push({ ...entry, note: entry.note });
      });

      // Then, add the difference as a brand new batch!
      const addedQty = finalQty - oldTotalQty;
      selectedItems.push({
        menuId: m.id,
        name: m.name,
        price: m.price,
        quantity: addedQty,
        category: m.category,
        note: currentNote,
        isSent: false, // This ensures it will trigger the kitchen printer again
        isCancelled: false,
        printBatch: currentMaxBatch + 1, // Increment the batch!
      });
      
    } else {
      // CASE C: Quantity decreased. 
      // We need to remove items. Best practice: remove from the newest batches first.
      let remainingToKeep = finalQty;
      
      // Sort oldest to newest (Batch 1, then Batch 2...)
      const sortedEntries = [...existingEntries].sort((a, b) => a.printBatch - b.printBatch);

      sortedEntries.forEach((entry) => {
        if (remainingToKeep <= 0) return;

        if (entry.quantity <= remainingToKeep) {
          // Keep this whole batch
          selectedItems.push({ ...entry, note: entry.note });
          remainingToKeep -= entry.quantity;
        } else {
          // Keep a partial amount of this batch
          selectedItems.push({ ...entry, quantity: remainingToKeep, note: entry.note });
          remainingToKeep = 0;
        }
      });
    }
  });

  const totalItems = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleSave = async () => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    await updateOrder(order.id, { 
      items: selectedItems,
    });
    setSaving(false);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="bg-yellow-100 px-4 pt-4 pb-3 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <TouchableOpacity onPress={() => router.back()}>
              <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
                <ChevronLeft size={16} color="#555" />
                <Text className="text-sm font-bold text-gray-700">Menu Order</Text>
              </View>
            </TouchableOpacity>
            <View className="flex-row items-center gap-3">
              <Text className="text-xs font-bold text-gray-400">
                {order.customerName} · {order.seat}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowCancelDialog(true)} 
                className="bg-red-100 rounded-xl px-3 py-1.5"
              >
                <Text className="text-sm font-extrabold text-red-600">X</Text>
              </TouchableOpacity>
            </View>
          </View>

          {cancelError && (
            <View className="mx-4 mt-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <Text className="text-xs font-bold text-red-500">
                {cancelError}
              </Text>
            </View>
          )}

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
          keyboardShouldPersistTaps="handled"
        >
          {categoryItems.map((item) => {
            const qty = quantities[item.id] ?? 0;
            return (
              <View
                key={item.id}
                className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm"
              >
                {/* Top Row: Info & Controls */}
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

                {/* Bottom Row: Notes Input */}
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

        {/* Bottom bar */}
        {totalItems > 0 && (
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            {/* Swapped TouchableOpacity for a View to fix nested tap issues */}
            <View className="bg-green-400 rounded-3xl px-5 py-4 shadow-sm">
              
              {/* Expanded Summary */}
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
                  
                  {/* Save Button */}
                  <TouchableOpacity
                    onPress={handleSave}
                    disabled={saving}
                    className={`mt-3 bg-white rounded-xl py-3 items-center ${saving ? 'opacity-50' : ''}`}
                  >
                    <Text className="text-sm font-extrabold text-green-600">
                      {saving ? "Saving..." : "Save Changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Toggle Area */}
              <TouchableOpacity
                onPress={() => setSummaryOpen((o) => !o)}
                className="flex-row items-center gap-2"
              >
                <View className="border-2 border-white/60 rounded-xl px-3 py-1">
                  <Text className="text-sm font-extrabold text-white">
                    {totalItems} Items
                  </Text>
                </View>
                <Text className="text-white/70 text-xs font-bold">
                  {summaryOpen ? "▼ collapse" : "▲ review & save"}
                </Text>
              </TouchableOpacity>
              
            </View>
          </View>
        )}

        <ConfirmDialog
          visible={showCancelDialog}
          title="Cancel Order"
          message="Are you sure you want to cancel this order? This cannot be undone."
          confirmLabel="Yes, Cancel"
          cancelLabel="Keep"
          destructive
          onConfirm={handleCancel}
          onCancel={() => setShowCancelDialog(false)}
        />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}