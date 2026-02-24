import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
//   SafeAreaView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, markPaid } = useOrders();
  const order = orders.find((o) => o.id === Number(id));

  const [discount, setDiscount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order not found</Text>
      </SafeAreaView>
    );
  }

  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPct = parseFloat(discount) || 0;
  const total = subtotal * (1 - discountPct / 100);

  const handleConfirm = async () => {
    setSaving(true);
    setError("");

    const { error } = await markPaid(order.id, discountPct);

    if (error) {
      setError(error);
      setSaving(false);
      return;
    }

    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Papper</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer info */}
        <View className="bg-green-400 rounded-2xl px-4 py-3 mb-4 self-start shadow shadow-green-600/30">
          <Text className="text-sm font-bold text-white">
            Customer Name : {order.customerName}
          </Text>
          <Text className="text-sm font-bold text-white">
            Seat{"             "}: {order.seat}
          </Text>
        </View>

        {/* Order summary */}
        <View className="bg-yellow-100 rounded-3xl px-5 py-5 shadow-sm">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
            <Text className="text-sm font-bold text-gray-700">Order Summary</Text>
          </View>

          {order.items.map((item, index) => (
            <View key={`${item.menuId}-${index}`} className="flex-row justify-between items-start mb-4">
              <Text className="text-sm font-bold text-gray-800 flex-1">{item.name}</Text>
              <View className="items-end">
                <Text className="text-sm font-bold text-gray-800">
                  {formatRupiah(item.price)}
                </Text>
                <Text className="text-xs font-bold text-gray-400">{item.quantity} pcs</Text>
              </View>
            </View>
          ))}

          <View className="h-px bg-yellow-200 mb-4" />

          {/* Discount */}
          <View className="flex-row items-center gap-3 mb-3">
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">Discount</Text>
            </View>
            <TextInput
              className="bg-white border-2 border-gray-100 rounded-xl px-3 py-1.5 font-bold text-sm text-gray-900 w-20 text-center"
              value={discount}
              onChangeText={setDiscount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#ccc"
              editable={!saving}
            />
            <Text className="text-sm font-bold text-gray-500">%</Text>
          </View>

          {/* Total */}
          <View className="border-2 border-gray-200 rounded-xl px-3 py-2 bg-white/60 self-start">
            <Text className="text-sm font-extrabold text-gray-800">
              Total : {formatRupiah(total)}
            </Text>
          </View>
        </View>

        {/* Error */}
        {!!error && (
          <View className="mt-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Confirm payment */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6">
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={saving}
          className="w-full bg-green-400 rounded-2xl py-4 items-center shadow shadow-green-600/30"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm font-extrabold text-white">Confirm Payment</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}