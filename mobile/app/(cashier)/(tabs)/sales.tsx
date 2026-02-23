import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
//   SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../../lib/supabase";

type OrderRow = {
  id: number;
  customerName: string;
  seat: string;
  total: number;
  status: "paid" | "unpaid";
};

type TopMenuItem = { name: string; quantity: number };

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export default function CashierSalesScreen() {
  const [totalSales, setTotalSales] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [topItems, setTopItems] = useState<TopMenuItem[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodaySales = async () => {
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch all of today's orders (both paid and unpaid)
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, customer_name, seat, discount, status")
      .gte("created_at", today.toISOString())
      .lt("created_at", tomorrow.toISOString())
      .order("created_at", { ascending: false });

    if (!ordersData || ordersData.length === 0) {
      setTotalSales(0);
      setTotalPaid(0);
      setTotalUnpaid(0);
      setTopItems([]);
      setOrders([]);
      setLoading(false);
      return;
    }

    // Fetch order items
    const orderIds = ordersData.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, name, price, quantity")
      .in("order_id", orderIds);

    // Build order rows with totals
    let paidTotal = 0;
    let unpaidTotal = 0;

    const orderRows: OrderRow[] = ordersData.map((order) => {
      const orderItems = (items ?? []).filter((i) => i.order_id === order.id);
      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const total = subtotal * (1 - order.discount / 100);

      if (order.status === "paid") paidTotal += total;
      else unpaidTotal += total;

      return {
        id: order.id,
        customerName: order.customer_name,
        seat: order.seat,
        total,
        status: order.status,
      };
    });

    setOrders(orderRows);
    setTotalSales(paidTotal + unpaidTotal);
    setTotalPaid(paidTotal);
    setTotalUnpaid(unpaidTotal);

    // Top menu items (from paid orders only)
    const paidOrderIds = ordersData
      .filter((o) => o.status === "paid")
      .map((o) => o.id);

    const itemCount: Record<string, { name: string; qty: number }> = {};
    (items ?? [])
      .filter((i) => paidOrderIds.includes(i.order_id))
      .forEach((item) => {
        if (!itemCount[item.name]) {
          itemCount[item.name] = { name: item.name, qty: 0 };
        }
        itemCount[item.name].qty += item.quantity;
      });

    const top = Object.values(itemCount)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((i) => ({ name: i.name, quantity: i.qty }));

    setTopItems(top);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { fetchTodaySales(); }, []));

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <ActivityIndicator size="large" color="#3a7bd5" />
      </SafeAreaView>
    );
  }

  const paidOrders = orders.filter((o) => o.status === "paid");
  const unpaidOrders = orders.filter((o) => o.status === "unpaid");

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
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
            <Text className="text-xs font-extrabold text-white/70 mb-1">Paid</Text>
            <Text className="text-base font-black text-white">
              {formatRupiah(totalPaid)}
            </Text>
            <Text className="text-xs text-white/60 mt-0.5">
              {paidOrders.length} orders
            </Text>
          </View>
          <View className="flex-1 bg-yellow-100 rounded-2xl px-4 py-4 shadow-sm">
            <Text className="text-xs font-extrabold text-gray-400 mb-1">Unpaid</Text>
            <Text className="text-base font-black text-gray-800">
              {formatRupiah(totalUnpaid)}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {unpaidOrders.length} orders
            </Text>
          </View>
        </View>

        {/* Total */}
        <View className="bg-gray-900 rounded-2xl px-4 py-3 mb-4 flex-row justify-between items-center">
          <Text className="text-sm font-extrabold text-white/70">Total Today</Text>
          <Text className="text-base font-black text-white">
            {formatRupiah(totalSales)}
          </Text>
        </View>

        {/* Top selling */}
        {topItems.length > 0 && (
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 mb-4 shadow-sm">
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
              <Text className="text-sm font-bold text-gray-700">Top Selling</Text>
            </View>
            <View className="bg-cyan-100 rounded-2xl px-4 py-2">
              {topItems.map((item, index) => (
                <View key={item.name}>
                  <View className="flex-row items-center justify-between py-3">
                    <View className="flex-row items-center gap-3">
                      <View className="w-6 h-6 rounded-full bg-white/80 items-center justify-center">
                        <Text className="text-xs font-black text-gray-500">
                          {index + 1}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-gray-800">{item.name}</Text>
                    </View>
                    <Text className="text-sm font-extrabold text-gray-600">
                      {item.quantity} pcs
                    </Text>
                  </View>
                  {index < topItems.length - 1 && <View className="h-px bg-cyan-200" />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Unpaid orders */}
        {unpaidOrders.length > 0 && (
          <>
            <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Unpaid Orders
            </Text>
            {unpaidOrders.map((order) => (
              <View
                key={order.id}
                className="bg-yellow-100 rounded-2xl px-4 py-3 mb-2 flex-row justify-between items-center shadow-sm"
              >
                <View>
                  <Text className="text-sm font-bold text-gray-800">{order.customerName}</Text>
                  <Text className="text-xs font-bold text-gray-400">Seat {order.seat}</Text>
                </View>
                <Text className="text-sm font-extrabold text-yellow-600">
                  {formatRupiah(order.total)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Paid orders */}
        <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1 mt-2">
          Completed Orders
        </Text>
        {paidOrders.length === 0 ? (
          <Text className="text-center text-gray-300 font-bold mb-4">
            No completed orders today
          </Text>
        ) : (
          paidOrders.map((order) => (
            <View
              key={order.id}
              className="bg-white rounded-2xl px-4 py-3 mb-2 flex-row justify-between items-center shadow-sm"
            >
              <View>
                <Text className="text-sm font-bold text-gray-800">{order.customerName}</Text>
                <Text className="text-xs font-bold text-gray-400">Seat {order.seat}</Text>
              </View>
              <Text className="text-sm font-extrabold text-green-600">
                {formatRupiah(order.total)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}