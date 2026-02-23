import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Printer, Check, X } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
// import { useAuth } from "../../../context/AuthContext";
import { Order } from "../../../types/order";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function orderTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return subtotal * (1 - order.discount / 100);
}

function OrderCard({ order }: { order: Order }) {
  const isPaid = order.status === "paid";

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(cashier)/order/${order.id}`)}
      className={`rounded-2xl px-4 py-4 mb-3 ${
        isPaid
          ? "bg-green-500 shadow shadow-green-600/30"
          : "bg-yellow-100 shadow shadow-yellow-300/20"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View
          className={`rounded-xl px-3 py-1.5 ${
            isPaid ? "bg-white/20" : "bg-white/80"
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              isPaid ? "text-white" : "text-gray-800"
            }`}
          >
            Order : {order.customerName}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          {/* Print */}
          <TouchableOpacity>
            <Printer size={20} color={isPaid ? "white" : "#555"} />
          </TouchableOpacity>

          {/* Unpaid actions */}
          {!isPaid && (
            <>
              <TouchableOpacity
                onPress={() => router.push(`/(cashier)/payment/${order.id}`)}
              >
                <Check size={20} color="#22c55e" />
              </TouchableOpacity>
              <TouchableOpacity>
                <X size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Seat + total */}
      <View className="flex-row justify-between mt-2 px-1">
        <Text
          className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}
        >
          Seat {order.seat}
        </Text>
        <Text
          className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}
        >
          {formatRupiah(orderTotal(order))}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CashierHomeScreen() {
  const { orders } = useOrders();
  // const { signOut } = useAuth();

  const unpaid = orders.filter((o) => o.status === "unpaid");
  const paid = orders.filter((o) => o.status === "paid");

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Orders</Text>
        </View>
        {/* <TouchableOpacity
          onPress={signOut}
          className="w-10 h-10 rounded-full bg-gray-900 items-center justify-center"
        >
          <Text className="text-white text-xs font-bold">Out</Text>
        </TouchableOpacity> */}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Unpaid first */}
        {unpaid.map((o) => <OrderCard key={o.id} order={o} />)}
        {/* Then paid */}
        {paid.map((o) => <OrderCard key={o.id} order={o} />)}

        {orders.length === 0 && (
          <View className="items-center mt-24">
            <Text className="text-gray-300 font-bold text-sm">No orders yet.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add New Order */}
      <View className="absolute bottom-6 left-4 right-4">
        <TouchableOpacity
          onPress={() => router.push("/(cashier)/new-order")}
          className="w-full bg-cyan-200 rounded-2xl py-4 items-center shadow shadow-cyan-400/20"
        >
          <Text className="text-sm font-extrabold text-gray-600">Add New Order</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}