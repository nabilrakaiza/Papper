import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { Order } from "@/types/order";

type PaymentMethod = "QRIS" | "Bank Transfer" | "Cash";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function orderTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tax = 0.1
  return subtotal * (1 - order.discount / 100) * (1 + tax);
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, markPaid } = useOrders();
  const order = orders.find((o) => o.id === Number(id));

  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [methodOfPayment, setMethodOfPayment] = useState<PaymentMethod>("Cash");
  const paymentOptions: PaymentMethod[] = ["QRIS", "Bank Transfer", "Cash"];
  const [paymentAmount, setPaymentAmount] = useState("");

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  // --- FIXED CALCULATION LOGIC ---
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPct = parseFloat(discount) || 0;

  // Prevent discount from exceeding 100% or dropping below 0%
  const safeDiscountPct = Math.min(Math.max(0, discountPct), 100);
  const discountAmount = subtotal * (safeDiscountPct / 100);
  
  const taxableAmount = subtotal - discountAmount;
  const taxRate = 0.1; // 10%
  const taxAmount = taxableAmount * taxRate;
  
  // Math.round fixes floating point precision errors (e.g., 10.00000000001)
  const total = Math.round(taxableAmount + taxAmount);
  // -------------------------------

  const handleConfirm = async () => {
    setSaving(true);
    setError("");

    if (methodOfPayment === "Cash"){
      const { error } = await markPaid(order.id, safeDiscountPct, methodOfPayment, parseInt(paymentAmount));
    }
    else {
      const { error } = await markPaid(order.id, safeDiscountPct, methodOfPayment, orderTotal(order));
    }

    if (error) {
      setError(error);
      setSaving(false);
      return;
    }

    router.back();
  };

  const groupedItems = Object.values(
    order.items.reduce<Record<string, typeof order.items[0]>>((acc, item) => {
      if (acc[item.menuId]) {
        acc[item.menuId] = { ...acc[item.menuId], quantity: acc[item.menuId].quantity + item.quantity };
      } else {
        acc[item.menuId] = { ...item };
      }
      return acc;
    }, {})
  );

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
            Nama Customer : {order.customerName}
          </Text>
          <Text className="text-sm font-bold text-white">
            Tempat Duduk{"    "}: {order.seat}
          </Text>
        </View>

        {/* Order summary */}
        <View className="bg-yellow-100 rounded-3xl px-5 py-5 shadow-sm">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
            <Text className="text-sm font-bold text-gray-700">Order Customer</Text>
          </View>

          {groupedItems.map((item) => (
            <View key={item.menuId} className="flex-row justify-between items-start mb-4">
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

          {/* Tax */}
          <View className="flex-row items-center gap-3 mb-3">
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">Tax/Pajak</Text>
            </View>
           <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">10 %</Text>
            </View>
          </View>

          {/* Total */}
          <View className="border-2 border-gray-200 rounded-xl px-3 py-2 bg-white/60 self-start">
            <Text className="text-sm font-extrabold text-gray-800">
              Total : {formatRupiah(total)}
            </Text>
          </View>
        </View>

        {/* Payment Method UI */}
        <View className="bg-white rounded-3xl px-5 py-5 shadow-sm mt-4">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-gray-50">
            <Text className="text-sm font-bold text-gray-700">Payment Method</Text>
          </View>

          {paymentOptions.map((method) => {
            const isSelected = methodOfPayment === method;

            return (
              <TouchableOpacity
                key={method}
                className="flex-row items-center mb-3"
                onPress={() => setMethodOfPayment(method)}
                activeOpacity={0.7}
              >
                {/* Custom Radio Circle */}
                <View 
                  className={`h-6 w-6 rounded-full border-2 items-center justify-center mr-3 ${
                    isSelected ? 'border-green-400' : 'border-gray-300'
                  }`}
                >
                  {isSelected && <View className="h-3 w-3 rounded-full bg-green-400" />}
                </View>
                
                {/* Radio Text */}
                <Text 
                  className={`text-sm font-bold ${
                    isSelected ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {method}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
          
        {/* Handle cash payment */}
        {methodOfPayment === "Cash" && (
          <View className="mt-1">
            <Text className="text-sm font-bold text-gray-700 mb-2">Payment Amount</Text>
            <TextInput
              className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={paymentAmount}
              onChangeText={(text) => setPaymentAmount(text.replace(/[^0-9]/g, ""))}
            />
          </View>
        )}

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
          disabled={saving || !methodOfPayment} // Added disabled check if no payment method selected
          className={`w-full rounded-2xl py-4 items-center shadow ${
            saving || !methodOfPayment ? 'bg-gray-400 shadow-gray-400/30' : 'bg-green-400 shadow-green-600/30'
          }`}
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