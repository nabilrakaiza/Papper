import { View, Text, ScrollView } from "react-native";
import { useOrders } from "../../../context/OrderContext";
import { SafeAreaView } from "react-native-safe-area-context";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function CashierSalesScreen() {
  const { orders } = useOrders();

  const paidOrders = orders.filter((o) => o.status === "paid");

  const totalSales = paidOrders.reduce((sum, o) => {
    const subtotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
    return sum + subtotal * (1 - o.discount / 100);
  }, 0);

  const totalOrders = paidOrders.length;

  // Top items
  const itemCount: Record<string, { name: string; qty: number; revenue: number }> = {};
  paidOrders.forEach((o) => {
    o.items.forEach((item) => {
      if (!itemCount[item.name]) {
        itemCount[item.name] = { name: item.name, qty: 0, revenue: 0 };
      }
      itemCount[item.name].qty += item.quantity;
      itemCount[item.name].revenue += item.price * item.quantity;
    });
  });

  const topItems = Object.values(itemCount)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">Todays Sales</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-green-400 rounded-2xl px-4 py-4 shadow shadow-green-600/30">
            <Text className="text-xs font-extrabold text-white/70 mb-1">Total Sales</Text>
            <Text className="text-base font-black text-white">{formatRupiah(totalSales)}</Text>
          </View>
          <View className="flex-1 bg-yellow-100 rounded-2xl px-4 py-4 shadow-sm">
            <Text className="text-xs font-extrabold text-gray-400 mb-1">Orders</Text>
            <Text className="text-base font-black text-gray-800">{totalOrders} orders</Text>
          </View>
        </View>

        {/* Top selling items */}
        <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 shadow-sm">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
            <Text className="text-sm font-bold text-gray-700">Top Selling</Text>
          </View>

          <View className="bg-cyan-100 rounded-2xl px-4 py-2">
            {topItems.length === 0 && (
              <Text className="text-center text-gray-300 font-bold py-6">
                No sales yet today
              </Text>
            )}
            {topItems.map((item, index) => (
              <View key={item.name}>
                <View className="flex-row items-center justify-between py-3">
                  <View className="flex-row items-center gap-3">
                    <View className="w-6 h-6 rounded-full bg-white/80 items-center justify-center">
                      <Text className="text-xs font-black text-gray-500">{index + 1}</Text>
                    </View>
                    <Text className="text-sm font-bold text-gray-800">{item.name}</Text>
                  </View>
                  <Text className="text-sm font-extrabold text-gray-600">
                    {item.qty} pcs
                  </Text>
                </View>
                {index < topItems.length - 1 && (
                  <View className="h-px bg-cyan-200" />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Paid orders list */}
        <View className="mt-4">
          <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1">
            Completed Orders
          </Text>
          {paidOrders.length === 0 && (
            <Text className="text-center text-gray-300 font-bold">No completed orders yet</Text>
          )}
          {paidOrders.map((order) => {
            const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
            const total = subtotal * (1 - order.discount / 100);
            return (
              <View
                key={order.id}
                className="bg-white rounded-2xl px-4 py-3 mb-2 flex-row justify-between items-center shadow-sm"
              >
                <View>
                  <Text className="text-sm font-bold text-gray-800">{order.customerName}</Text>
                  <Text className="text-xs font-bold text-gray-400">Seat {order.seat}</Text>
                </View>
                <Text className="text-sm font-extrabold text-green-600">
                  {formatRupiah(total)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}