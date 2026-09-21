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
  /** The day's order number, as printed on the kitchen ticket. */
  dailyNumber: number | null;
  customerName: string;
  seat: string;
  createdAt: Date;
  status: string;
  discount: number;
  isDineIn: boolean | null;
  /**
   * How it was paid, for the one-line summary: the method for an ordinary
   * order, "Split" when several people paid, null while it is still open.
   */
  methodLabel: string | null;
  /** True once this order has been reopened and corrected at least once. */
  corrected: boolean;
  /** Cash handed over, when a single payer settled in cash. */
  tendered: number | null;
  subtotal: number;
  total: number;
  items: OrderLine[];
  /** Per-payer rows on a split bill; empty on an ordinary order. */
  payments: PaymentLine[];
};

type PaymentLine = {
  customerNum: number;
  customerLabel: string | null;
  /** Negative on a correction that handed money back. */
  amount: number;
  amountTendered: number | null;
  methodOfPayment: string;
  /** Which correction round this row settles. 0 is the original payment. */
  reopenSeq: number;
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
  Split: "Terpisah",
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

    // Every returned-error branch cleared the spinner itself; a thrown request
    // cleared none of them. One finally covers all four exits.
    try {
      const { from, to } = getRange(period);

      // One query for the orders, one for every line item across them — rather
      // than a nested select, which PostgREST would return per order and which
      // makes the row shape harder to keep in step with OrderContext.
      let query = supabase
        .from("orders")
        .select("id, daily_number, customer_name, seat, created_at, status, discount, is_dine_in")
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
        return;
      }

      if (!orderData || orderData.length === 0) {
        setOrders([]);
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("order_items")
        .select("order_id, name, price, quantity, notes, is_cancelled, menu_id")
        .in("order_id", orderData.map((o) => o.id));

      if (itemError) {
        setError("Gagal memuat item pesanan.");
        setOrders([]);
        return;
      }

      // Split bills only. A failure here is not worth blanking the screen for —
      // the orders themselves are already loaded and correct, and the payer
      // breakdown is detail on top of them.
      const { data: paymentData } = await supabase
        .from("order_payments")
        .select("order_id, customer_num, customer_label, amount, amount_tendered, method_of_payment, reopen_seq")
        .in("order_id", orderData.map((o) => o.id));

      setOrders(
        orderData.map((o) => {
          const items = (itemData ?? []).filter((i) => i.order_id === o.id);
          const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
          const payments: PaymentLine[] = (paymentData ?? [])
            .filter((p) => p.order_id === o.id)
            .map((p) => ({
              customerNum: p.customer_num,
              reopenSeq: p.reopen_seq ?? 0,
              customerLabel: p.customer_label,
              amount: p.amount,
              amountTendered: p.amount_tendered,
              methodOfPayment: p.method_of_payment,
            }))
            .sort(
              (a, b) => a.customerNum - b.customerNum || a.reopenSeq - b.reopenSeq
            );

          // Divided between people, which is a different question from "has
          // more than one payment row". A corrected order has a second row for
          // the same payer, and counting rows labelled every correction
          // "Terpisah" — the payer count is what actually says it was split.
          const payerCount = new Set(payments.map((p) => p.customerNum)).size;
          // The original settlement. A correction appends rather than rewriting,
          // so this is still the row that says how the bill was first paid.
          const original = payments.find((p) => p.reopenSeq === 0);

          return {
            id: o.id,
            dailyNumber: o.daily_number ?? null,
            customerName: o.customer_name,
            seat: o.seat,
            createdAt: new Date(o.created_at),
            status: o.status,
            discount: o.discount,
            isDineIn: o.is_dine_in,
            // Derived from the payment rows, which are the only record of how an
            // order was paid. Null means nothing has been paid against it yet.
            methodLabel:
              payerCount > 1 ? "Split" : original?.methodOfPayment ?? null,
            corrected: payments.some((p) => p.reopenSeq > 0),
            // The cash handed over at the original settlement. Keyed on the
            // payer count, not the row count, so a corrected cash order does
            // not silently lose its tender to a second row.
            tendered: payerCount === 1 ? original?.amountTendered ?? null : null,
            subtotal,
            total: orderTotal(subtotal, o.discount),
            payments,
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
    } catch (e) {
      console.error("Failed to fetch orders:", e);
      setError("Gagal memuat pesanan.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
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
                        {/* The day's number, matching the kitchen ticket. The
                            date is on the line below, which is what makes it
                            unique. */}
                        #{order.dailyNumber ?? order.id} · {order.seat} ·{" "}
                        {order.isDineIn === false ? "Bawa Pulang" : "Makan di Tempat"}
                      </Text>
                      <Text className="text-xs font-bold text-gray-400 mt-0.5">
                        {formatDateTime(order.createdAt)}
                        {order.methodLabel
                          ? ` · ${METHOD_LABELS[order.methodLabel] ?? order.methodLabel}`
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

                    {/* Who paid what, when the bill was divided. Without this
                        a split order shows a single "Terpisah" and no way to
                        reconcile it against the till. */}
                    {order.payments.length > 1 && (
                      <View className="pt-1.5">
                        <Text className="text-xs font-extrabold text-gray-400 mb-1">
                          {order.corrected
                            ? "Rincian Pembayaran"
                            : "Pembayaran Terpisah"}
                        </Text>
                        {order.payments.map((p) => (
                          <View
                            key={`${p.customerNum}-${p.reopenSeq}`}
                            className="flex-row justify-between py-0.5"
                          >
                            <Text className="text-xs font-bold text-gray-500 flex-1 pr-2">
                              {/* A correction row is not another person, it is
                                  the same person settling a difference — say
                                  that instead of repeating their name. */}
                              {p.reopenSeq > 0
                                ? p.amount < 0
                                  ? "Dikembalikan"
                                  : "Tambahan bayar"
                                : p.customerLabel || `Pelanggan ${p.customerNum}`}{" "}
                              · {METHOD_LABELS[p.methodOfPayment] ?? p.methodOfPayment}
                              {p.methodOfPayment === "Cash" && p.amountTendered != null
                                ? ` (bayar ${formatRupiah(p.amountTendered)})`
                                : ""}
                            </Text>
                            <Text
                              className={`text-xs font-bold ${
                                p.amount < 0 ? "text-red-600" : "text-gray-700"
                              }`}
                            >
                              {formatRupiah(p.amount)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Cash is the only method where what was handed over
                        differs from the bill. */}
                    {order.status === "paid" && order.tendered != null && (
                        <>
                          <View className="flex-row justify-between pt-1.5">
                            <Text className="text-xs font-bold text-gray-500">
                              Jumlah Bayar
                            </Text>
                            <Text className="text-xs font-bold text-gray-700">
                              {formatRupiah(order.tendered)}
                            </Text>
                          </View>
                          <View className="flex-row justify-between py-0.5">
                            <Text className="text-xs font-bold text-gray-500">
                              Kembalian
                            </Text>
                            <Text className="text-xs font-bold text-gray-700">
                              {/* Against the bill that was actually settled in
                                  cash, which on a corrected order is not the
                                  current total — the corrections came after.
                                  Subtracting them back out recovers it. */}
                              {formatRupiah(
                                order.tendered -
                                  (order.total -
                                    order.payments
                                      .filter((p) => p.reopenSeq > 0)
                                      .reduce((sum, p) => sum + p.amount, 0))
                              )}
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
