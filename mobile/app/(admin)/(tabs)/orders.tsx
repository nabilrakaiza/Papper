import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { orderTotal, TAX_RATE } from "../../../lib/constants";

type OrderLine = {
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  is_cancelled: boolean;
  menu_id: number | null;
};

type OrderRow = {
  id: number;
  customerName: string;
  seat: string;
  createdAt: Date;
  status: string;
  discount: number;
  methodOfPayment: string | null;
  isDineIn: boolean | null;
  paymentAmount: number | null;
  subtotal: number;
  total: number;
  items: OrderLine[];
};

const PERIODS = ["Hari Ini", "7 Hari", "Bulan Ini", "Bulan Lalu"] as const;
type Period = (typeof PERIODS)[number];

const STATUSES = ["Semua", "Lunas", "Belum Bayar", "Batal"] as const;
type StatusFilter = (typeof STATUSES)[number];

const STATUS_VALUE: Record<Exclude<StatusFilter, "Semua">, string> = {
  Lunas: "paid",
  "Belum Bayar": "unpaid",
  Batal: "cancelled",
};

const METHOD_LABELS: Record<string, string> = {
  Cash: "Tunai",
  "Bank Transfer": "Transfer Bank",
  QRIS: "QRIS",
  Debit: "Debit",
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  paid: { bg: "bg-green-100", text: "text-green-700", label: "Lunas" },
  unpaid: { bg: "bg-amber-100", text: "text-amber-700", label: "Belum Bayar" },
  cancelled: { bg: "bg-red-100", text: "text-red-600", label: "Batal" },
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRange(period: Period): { from: Date; to: Date } {
  const now = new Date();

  if (period === "Hari Ini") {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (period === "7 Hari") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setDate(to.getDate() + 1);
    to.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (period === "Bulan Ini") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    to: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

export default function AdminOrdersScreen() {
  const [period, setPeriod] = useState<Period>("Hari Ini");
  const [status, setStatus] = useState<StatusFilter>("Semua");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError("");

    const { from, to } = getRange(period);

    // One query for the orders, one for every line item across them — rather
    // than a nested select, which PostgREST would return per order and which
    // makes the row shape harder to keep in step with OrderContext.
    let query = supabase
      .from("orders")
      .select("id, customer_name, seat, created_at, status, discount, method_of_payment, is_dine_in, payment_amount")
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: false });

    if (status !== "Semua") {
      query = query.eq("status", STATUS_VALUE[status]);
    }

    const { data: orderData, error: orderError } = await query;

    if (orderError) {
      setError("Gagal memuat pesanan.");
      setOrders([]);
      setLoading(false);
      return;
    }

    if (!orderData || orderData.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("order_items")
      .select("order_id, name, price, quantity, notes, is_cancelled, menu_id")
      .in("order_id", orderData.map((o) => o.id));

    if (itemError) {
      setError("Gagal memuat item pesanan.");
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders(
      orderData.map((o) => {
        const items = (itemData ?? []).filter((i) => i.order_id === o.id);
        const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

        return {
          id: o.id,
          customerName: o.customer_name,
          seat: o.seat,
          createdAt: new Date(o.created_at),
          status: o.status,
          discount: o.discount,
          methodOfPayment: o.method_of_payment,
          isDineIn: o.is_dine_in,
          paymentAmount: o.payment_amount,
          subtotal,
          total: orderTotal(subtotal, o.discount),
          items: items.map((i) => ({
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            notes: i.notes,
            is_cancelled: i.is_cancelled,
            menu_id: i.menu_id,
          })),
        };
      })
    );

    setLoading(false);
  }, [period, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const subscription = supabase
      .channel("admin-orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchOrders]);

  const term = search.trim().toLowerCase();
  const visible = term
    ? orders.filter(
        (o) =>
          o.customerName.toLowerCase().includes(term) ||
          o.seat.toLowerCase().includes(term) ||
          String(o.id) === term
      )
    : orders;

  const shownTotal = visible
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="flex-row items-center gap-3 px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Rincian Pesanan</Text>
      </View>

      {/* Search */}
      <View className="px-4 mb-2">
        <View className="flex-row items-center bg-white border-2 border-gray-100 rounded-2xl px-3 gap-2">
          <Search size={16} color="#aaa" />
          <TextInput
            className="flex-1 py-2.5 font-bold text-sm text-gray-900"
            placeholder="Cari nama, meja, atau no. pesanan"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#ccc"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X size={16} color="#aaa" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="flex-none mb-2"
      >
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPeriod(p)}
            className={`border-2 rounded-xl px-3 py-1.5 ${
              p === period ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                p === period ? "text-blue-600" : "text-gray-500"
              }`}
            >
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="flex-none mb-2"
      >
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatus(s)}
            className={`border-2 rounded-xl px-3 py-1.5 ${
              s === status ? "border-gray-800 bg-gray-800" : "border-gray-200 bg-white"
            }`}
          >
            <Text
              className={`text-xs font-extrabold ${
                s === status ? "text-white" : "text-gray-500"
              }`}
            >
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Running total for whatever is on screen. Cancelled orders are
            excluded — they were never revenue. */}
        {!loading && visible.length > 0 && (
          <View className="flex-row items-baseline justify-between mb-3 px-1">
            <Text className="text-xs font-bold text-gray-400">
              {visible.length} pesanan
            </Text>
            <Text className="text-sm font-extrabold text-gray-700">
              {formatRupiah(shownTotal)}
            </Text>
          </View>
        )}

        {loading && (
          <View className="py-10 items-center">
            <ActivityIndicator size="small" color="#3a7bd5" />
          </View>
        )}

        {!!error && (
          <View className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
          </View>
        )}

        {!loading && !error && visible.length === 0 && (
          <View className="py-10 items-center">
            <Text className="text-sm font-bold text-gray-400">
              Tidak ada pesanan
            </Text>
          </View>
        )}

        {!loading &&
          visible.map((order) => {
            const isOpen = expanded === order.id;
            const badge = STATUS_STYLE[order.status] ?? {
              bg: "bg-gray-100",
              text: "text-gray-600",
              label: order.status,
            };

            return (
              <View key={order.id} className="bg-white rounded-2xl mb-3 overflow-hidden">
                <TouchableOpacity
                  onPress={() => setExpanded(isOpen ? null : order.id)}
                  activeOpacity={0.7}
                  className="px-4 py-4"
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="text-sm font-black text-gray-900">
                          {order.customerName}
                        </Text>
                        <View className={`rounded-lg px-2 py-0.5 ${badge.bg}`}>
                          <Text className={`text-[10px] font-extrabold ${badge.text}`}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-xs font-bold text-gray-400">
                        #{order.id} · {order.seat} ·{" "}
                        {order.isDineIn === false ? "Bawa Pulang" : "Makan di Tempat"}
                      </Text>
                      <Text className="text-xs font-bold text-gray-400 mt-0.5">
                        {formatDateTime(order.createdAt)}
                        {order.methodOfPayment
                          ? ` · ${METHOD_LABELS[order.methodOfPayment] ?? order.methodOfPayment}`
                          : ""}
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text
                        className={`text-sm font-extrabold ${
                          order.status === "cancelled"
                            ? "text-gray-300 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {formatRupiah(order.total)}
                      </Text>
                      <View className="mt-1">
                        {isOpen ? (
                          <ChevronUp size={16} color="#9ca3af" />
                        ) : (
                          <ChevronDown size={16} color="#9ca3af" />
                        )}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {isOpen && (
                  <View className="px-4 pb-4 pt-1 border-t border-gray-100">
                    {order.items.map((item, idx) => (
                      <View key={`${order.id}-${idx}`} className="py-1.5">
                        <View className="flex-row justify-between">
                          <Text
                            className={`text-xs font-bold flex-1 pr-2 ${
                              item.is_cancelled
                                ? "text-gray-300 line-through"
                                : "text-gray-700"
                            }`}
                          >
                            {item.quantity}× {item.name}
                            {item.menu_id === null && (
                              <Text className="text-[10px] font-extrabold text-green-600">
                                {"  "}KUSTOM
                              </Text>
                            )}
                          </Text>
                          <Text className="text-xs font-bold text-gray-600">
                            {formatRupiah(item.price * item.quantity)}
                          </Text>
                        </View>
                        {!!item.notes && (
                          <Text className="text-[11px] font-bold text-gray-400 italic">
                            └ {item.notes}
                          </Text>
                        )}
                      </View>
                    ))}

                    <View className="h-px bg-gray-100 my-2" />

                    <View className="flex-row justify-between py-0.5">
                      <Text className="text-xs font-bold text-gray-500">Subtotal</Text>
                      <Text className="text-xs font-bold text-gray-700">
                        {formatRupiah(order.subtotal)}
                      </Text>
                    </View>

                    {order.discount > 0 && (
                      <View className="flex-row justify-between py-0.5">
                        <Text className="text-xs font-bold text-gray-500">
                          Diskon {order.discount}%
                        </Text>
                        <Text className="text-xs font-bold text-gray-700">
                          −{formatRupiah(order.subtotal * (order.discount / 100))}
                        </Text>
                      </View>
                    )}

                    <View className="flex-row justify-between py-0.5">
                      <Text className="text-xs font-bold text-gray-500">
                        Pajak {TAX_RATE * 100}%
                      </Text>
                      <Text className="text-xs font-bold text-gray-700">
                        {formatRupiah(
                          order.subtotal * (1 - order.discount / 100) * TAX_RATE
                        )}
                      </Text>
                    </View>

                    <View className="flex-row justify-between pt-1.5">
                      <Text className="text-xs font-black text-gray-900">Total</Text>
                      <Text className="text-xs font-black text-gray-900">
                        {formatRupiah(order.total)}
                      </Text>
                    </View>

                    {/* Cash is the only method where payment_amount differs from
                        the bill — it is what the customer handed over. */}
                    {order.status === "paid" &&
                      order.methodOfPayment === "Cash" &&
                      order.paymentAmount != null && (
                        <>
                          <View className="flex-row justify-between pt-1.5">
                            <Text className="text-xs font-bold text-gray-500">
                              Jumlah Bayar
                            </Text>
                            <Text className="text-xs font-bold text-gray-700">
                              {formatRupiah(order.paymentAmount)}
                            </Text>
                          </View>
                          <View className="flex-row justify-between py-0.5">
                            <Text className="text-xs font-bold text-gray-500">
                              Kembalian
                            </Text>
                            <Text className="text-xs font-bold text-gray-700">
                              {formatRupiah(order.paymentAmount - order.total)}
                            </Text>
                          </View>
                        </>
                      )}
                  </View>
                )}
              </View>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}
