import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { TAX_RATE, orderTotal } from "../../../lib/constants";
import { groupItems } from "../../../lib/orderItems";

type PaymentMethod = "QRIS" | "Bank Transfer" | "Cash" | "Debit";

// Display-only labels (Indonesian) — the underlying values above are kept
// as-is since they're stored in the database and used for payment logic.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  QRIS: "QRIS",
  "Bank Transfer": "Transfer Bank",
  Cash: "Tunai",
  Debit: "Debit",
};

const formatRupiahInput = (digits: string) => {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, markPaid } = useOrders();
  const order = orders.find((o) => o.id === Number(id));

  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [methodOfPayment, setMethodOfPayment] = useState<PaymentMethod>("Cash");
  const paymentOptions: PaymentMethod[] = ["QRIS", "Bank Transfer", "Debit", "Cash"];
  const [paymentAmount, setPaymentAmount] = useState("");

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPct = parseFloat(discount) || 0;

  // Prevent discount from exceeding 100% or dropping below 0%
  const safeDiscountPct = Math.min(Math.max(0, discountPct), 100);

  // Shared with every report and the receipt, so what the cashier is shown here
  // is exactly what the books will say later.
  const total = orderTotal(subtotal, safeDiscountPct);

  const cashGiven = parseInt(paymentAmount, 10) || 0;
  const changeDue = cashGiven - total;

  const handleConfirm = async () => {
    setError("");

    if (methodOfPayment === "Cash" && changeDue < 0) {
      setError(
        `Pembayaran kurang dari total. Butuh ${formatRupiah(-changeDue)} lagi.`
      );
      return;
    }

    setSaving(true);

    // Both branches used to declare their own block-scoped `error`, so the
    // check below silently read the `error` state instead of the result of
    // markPaid. A second attempt after a "kurang" error therefore paid the
    // order, then re-showed the stale message and never navigated back.
    //
    // The non-cash branch also recorded orderTotal(order), which recomputes
    // from the *saved* discount and so ignored whatever was typed here.
    const { error: saveError } = await markPaid(
      order.id,
      safeDiscountPct,
      methodOfPayment,
      methodOfPayment === "Cash" ? cashGiven : total
    );

    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    router.back();
  };

  const handleDiscountChange = (text: string) => {
    let digitsOnly = text.replace(/[^0-9]/g, "");

    // Strip leading zeros (e.g. "05" -> "5"), but allow a lone "0"
    digitsOnly = digitsOnly.replace(/^0+(?=\d)/, "");

    if (digitsOnly === "") {
      setDiscount("");
      return;
    }

    const num = parseInt(digitsOnly, 10);
    if (num > 100) {
      setDiscount("100");
    } else {
      setDiscount(digitsOnly);
    }
  };

  // Grouped by itemKey rather than menuId: custom items all carry a null menu
  // id, so keying on that would fold every unrelated one into a single row.
  const groupedItems = groupItems(order.items);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* In landscape there is very little height left once the keyboard is up,
          and the cash amount field sits near the bottom of the scroll view. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Papper</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 120,
          // Keeps the column readable rather than stretching edge to edge on a
          // landscape tablet or the web build.
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer info */}
        <View className="bg-green-400 rounded-2xl px-4 py-3 mb-4 self-start shadow shadow-green-600/30">
          <Text className="text-sm font-bold text-white">
            Nama Pelanggan : {order.customerName}
          </Text>
          <Text className="text-sm font-bold text-white">
            Tempat Duduk{"    "}: {order.seat}
          </Text>
        </View>

        {/* Order summary */}
        <View className="bg-yellow-100 rounded-3xl px-5 py-5 shadow-sm">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
            <Text className="text-sm font-bold text-gray-700">Pesanan Pelanggan</Text>
          </View>

          {groupedItems.map((item) => (
            <View key={item.key} className="flex-row justify-between items-start mb-4">
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
              <Text className="text-sm font-bold text-gray-600">Diskon</Text>
            </View>
            <TextInput
              className="bg-white border-2 border-gray-100 rounded-xl px-3 py-1.5 font-bold text-sm text-gray-900 w-20 text-center"
              value={discount}
              onChangeText={handleDiscountChange}
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
              <Text className="text-sm font-bold text-gray-600">Pajak</Text>
            </View>
           <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">{TAX_RATE * 100} %</Text>
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
            <Text className="text-sm font-bold text-gray-700">Metode Pembayaran</Text>
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
                  {PAYMENT_METHOD_LABELS[method]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
          
        {/* Handle cash payment */}
        {methodOfPayment === "Cash" && (
          <View className="mt-1">
            <Text className="text-sm font-bold text-gray-700 mb-2">Jumlah Pembayaran</Text>
            <TextInput
              className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={paymentAmount ? `Rp ${formatRupiahInput(paymentAmount)}` : ""}
              onChangeText={(text) => setPaymentAmount(text.replace(/[^0-9]/g, ""))}
              editable={!saving}
            />

            {!!paymentAmount && (
              <Text
                className={`text-xs font-bold mt-2 ${
                  changeDue < 0 ? "text-red-500" : "text-gray-500"
                }`}
              >
                {changeDue < 0
                  ? `Kurang ${formatRupiah(-changeDue)}`
                  : `Kembalian ${formatRupiah(changeDue)}`}
              </Text>
            )}
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
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 items-center">
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={saving || !methodOfPayment} // Added disabled check if no payment method selected
          style={{ width: "100%", maxWidth: 640 }}
          className={`rounded-2xl py-4 items-center shadow ${
            saving || !methodOfPayment ? 'bg-gray-400 shadow-gray-400/30' : 'bg-green-400 shadow-green-600/30'
          }`}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm font-extrabold text-white">Konfirmasi Pembayaran</Text>
          )}
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}