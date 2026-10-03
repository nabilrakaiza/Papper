// One order of any day, opened from the Penjualan screen.
//
// Read straight from the database rather than from OrderContext, which only
// holds the open orders and today's paid ones. From here a paid order of any
// age can be corrected — behind the superadmin's PIN, exactly as on the order
// list — and its receipt printed again.
import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Check, Pencil, Printer, ShoppingBag, Undo2, UtensilsCrossed } from "lucide-react-native";
import { supabase } from "../../../lib/supabase";
import { isConnectionError, NO_CONNECTION } from "../../../lib/errors";
import { clampPercent, orderTotal } from "../../../lib/constants";
import { formatJakartaDateTime } from "../../../lib/jakartaDate";
import { groupItems } from "../../../lib/orderItems";
import { ORDER_SELECT, toOrder } from "../../../lib/orderRow";
import {
  amountCollected,
  defaultPayerLabel,
  isCorrected,
  isSplit,
  itemsForPayer,
  payerNumbers,
} from "../../../lib/splitBill";
import { methodLabel, rupiah } from "../../../components/owner/format";
import { useOrderActions } from "../../../hooks/useOrderActions";
import { useReceiptPrinter } from "../../../hooks/useReceiptPrinter";
import PrinterSelector from "../../../components/PrinterSelector";
import { Order, OrderItem, OrderPayment } from "../../../types/order";

const num = { fontVariant: ["tabular-nums" as const] };

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl px-4 py-4 mb-4 shadow-sm">
      {title ? (
        <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-2">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between items-center py-1">
      <Text className={`flex-1 pr-3 text-sm ${strong ? "font-black text-gray-900" : "font-bold text-gray-600"}`}>
        {label}
      </Text>
      <Text className={`text-sm ${strong ? "font-black text-gray-900" : "font-extrabold text-gray-800"}`} style={num}>
        {value}
      </Text>
    </View>
  );
}

function ItemLines({ items }: { items: OrderItem[] }) {
  return (
    <>
      {groupItems(items).map((item) => (
        <View key={item.key} className="flex-row items-start py-1">
          <Text className="w-8 text-sm font-extrabold text-gray-500">{item.quantity}x</Text>
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-gray-800">{item.name}</Text>
            {item.note ? (
              <Text className="text-[11px] font-bold text-gray-400">{item.note}</Text>
            ) : null}
          </View>
          <Text className="text-sm font-extrabold text-gray-800" style={num}>
            {rupiah(item.price * item.quantity)}
          </Text>
        </View>
      ))}
    </>
  );
}

/** The name a payer was given at the till, from any of their payment rows. */
function payerLabel(order: Order, customerNum: number): string {
  const named = order.payments.find((p) => p.customerNum === customerNum && p.customerLabel);
  return named?.customerLabel ?? defaultPayerLabel(customerNum);
}

function roundLabel(round: number): string {
  return round === 0 ? "Pembayaran" : `Koreksi ${round}`;
}

function StatusChip({ order }: { order: Order }) {
  const [label, bg, fg] =
    order.status === "paid"
      ? ["Lunas", "bg-green-100", "text-green-700"]
      : order.status === "cancelled"
      ? ["Dibatalkan", "bg-gray-200", "text-gray-500"]
      : isCorrected(order)
      ? ["Sedang dikoreksi", "bg-orange-100", "text-orange-700"]
      : ["Belum bayar", "bg-yellow-100", "text-yellow-700"];

  return (
    <View className={`${bg} rounded-lg px-2 py-0.5`}>
      <Text className={`text-[11px] font-extrabold ${fg}`}>{label}</Text>
    </View>
  );
}

export default function OrderHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { edit, correct, dialogs } = useOrderActions();
  const {
    printing,
    printError,
    setPrintError,
    selectorVisible,
    setSelectorVisible,
    printCustomerReceipt,
    handlePrinterConnected,
  } = useReceiptPrinter();

  const fetchOrder = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", orderId)
        .maybeSingle();

      if (fetchError) {
        console.error("Failed to fetch order:", fetchError.message);
        setError(
          isConnectionError(fetchError) ? NO_CONNECTION : "Gagal memuat pesanan."
        );
        return;
      }

      setOrder(data ? toOrder(data) : null);
      setError(null);
    } catch (e) {
      console.error("Failed to fetch order:", e);
      setError("Gagal memuat pesanan. Periksa koneksi Anda.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Again on every return to this screen: coming back from the editor or the
  // payment screen, the order has just changed.
  useFocusEffect(
    useCallback(() => {
      fetchOrder();
    }, [fetchOrder])
  );

  // And while it is open, in case another tablet is working on the same order.
  useEffect(() => {
    const subscription = supabase
      .channel(`order-history-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => fetchOrder()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => fetchOrder()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [orderId, fetchOrder]);

  const header = (
    <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
      <TouchableOpacity onPress={() => router.back()}>
        <ChevronLeft size={24} color="#333" />
      </TouchableOpacity>
      <Text className="text-xl font-black text-gray-900">
        {order ? `Pesanan #${order.dailyNumber ?? order.id}` : "Pesanan"}
      </Text>
      <View className="w-6" />
    </View>
  );

  if (loading || !order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        {header}
        <View className="flex-1 items-center justify-center px-8">
          {loading ? (
            <ActivityIndicator size="large" color="#3a7bd5" />
          ) : (
            <TouchableOpacity onPress={fetchOrder}>
              <Text className="text-gray-400 font-bold text-center">
                {error ? `${error} Ketuk untuk mencoba lagi.` : "Pesanan tidak ditemukan"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const split = isSplit(order);
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPct = clampPercent(order.discount);
  const taxPct = clampPercent(order.tax);
  const afterDiscount = subtotal * (1 - discountPct / 100);
  const total = orderTotal(subtotal, order.discount, order.tax);
  const collected = amountCollected(order);

  // Oldest round first, so a correction reads as what happened after the sale.
  const rounds = [...new Set(order.payments.map((p) => p.reopenSeq))].sort((a, b) => a - b);
  const paymentsIn = (round: number): OrderPayment[] =>
    order.payments
      .filter((p) => p.reopenSeq === round)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const isPaid = order.status === "paid";
  const isOpen = order.status === "unpaid";

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {header}

      {(error || printError) && (
        <TouchableOpacity
          onPress={() => {
            setError(null);
            setPrintError(null);
          }}
          className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
        >
          <Text className="text-xs font-bold text-red-600">{printError ?? error}</Text>
        </TouchableOpacity>
      )}

      {printing && (
        <View className="mx-4 mb-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#3a7bd5" />
          <Text className="text-xs font-bold text-blue-500">Sedang mencetak...</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 120,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-lg font-black text-gray-900" numberOfLines={1}>
              {order.customerName}
            </Text>
            <StatusChip order={order} />
          </View>
          <Text className="text-xs font-bold text-gray-400 mt-1">
            {formatJakartaDateTime(order.createdAt.toISOString())} · Tempat Duduk {order.seat}
          </Text>
          <View className="flex-row items-center gap-1 mt-2">
            {order.isDineIn ? (
              <UtensilsCrossed size={12} color="#3a7bd5" />
            ) : (
              <ShoppingBag size={12} color="#f97316" />
            )}
            <Text
              className={`text-[11px] font-extrabold ${order.isDineIn ? "text-blue-600" : "text-orange-600"}`}
            >
              {order.isDineIn ? "Di Tempat" : "Bawa Pulang"}
            </Text>
            {isCorrected(order) && (
              <Text className="text-[11px] font-extrabold text-orange-700 ml-2">
                · Dikoreksi {order.reopenSeq}x
              </Text>
            )}
          </View>
        </Card>

        <Card title="Pesanan">
          {order.items.length === 0 ? (
            <Text className="text-sm font-bold text-gray-300 text-center py-2">Tidak ada item</Text>
          ) : split ? (
            payerNumbers(order).map((n, index) => (
              <View key={n} className={index > 0 ? "mt-3 pt-3 border-t border-gray-100" : ""}>
                <Text className="text-xs font-extrabold text-blue-600 mb-1">{payerLabel(order, n)}</Text>
                {itemsForPayer(order, n).length === 0 ? (
                  <Text className="text-[11px] font-bold text-gray-300">Tidak ada item</Text>
                ) : (
                  <ItemLines items={itemsForPayer(order, n)} />
                )}
              </View>
            ))
          ) : (
            <ItemLines items={order.items} />
          )}

          <View className="h-px bg-gray-100 my-2" />
          <Line label="Subtotal" value={rupiah(subtotal)} />
          {discountPct > 0 && (
            <Line label={`Diskon ${discountPct}%`} value={rupiah(-(subtotal - afterDiscount))} />
          )}
          <Line label={`Pajak ${taxPct}%`} value={rupiah(total - afterDiscount)} />
          <View className="h-px bg-gray-100 my-1" />
          <Line label="Total" value={rupiah(total)} strong />
        </Card>

        <Card title="Pembayaran">
          {rounds.length === 0 ? (
            <Text className="text-sm font-bold text-gray-300 text-center py-2">
              Belum ada pembayaran
            </Text>
          ) : (
            rounds.map((round, index) => (
              <View key={round} className={index > 0 ? "mt-3 pt-3 border-t border-gray-100" : ""}>
                <Text
                  className={`text-xs font-extrabold mb-1 ${round > 0 ? "text-orange-700" : "text-gray-500"}`}
                >
                  {roundLabel(round)}
                </Text>
                {paymentsIn(round).map((p) => (
                  <View key={p.id} className="flex-row items-start py-1">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-bold text-gray-800">
                        {methodLabel(p.methodOfPayment)}
                        {split ? ` · ${payerLabel(order, p.customerNum)}` : ""}
                      </Text>
                      <Text className="text-[11px] font-bold text-gray-400">
                        {formatJakartaDateTime(p.createdAt.toISOString())}
                        {p.amountTendered != null && p.amount > 0
                          ? ` · diterima ${rupiah(p.amountTendered)}`
                          : ""}
                      </Text>
                    </View>
                    <Text
                      className={`text-sm font-extrabold ${p.amount < 0 ? "text-red-500" : "text-gray-800"}`}
                      style={num}
                    >
                      {rupiah(p.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
          {rounds.length > 0 && (
            <>
              <View className="h-px bg-gray-100 my-2" />
              <Line label="Total diterima" value={rupiah(collected)} strong />
            </>
          )}
        </Card>
      </ScrollView>

      {/* Actions */}
      <View className="absolute bottom-6 left-4 right-4 flex-row gap-3" style={{ maxWidth: 640, alignSelf: "center" }}>
        {order.status !== "cancelled" && (
          <TouchableOpacity
            onPress={() => printCustomerReceipt(order)}
            disabled={printing}
            className={`flex-1 flex-row items-center justify-center gap-2 bg-white rounded-2xl py-4 shadow-sm ${
              printing ? "opacity-50" : ""
            }`}
          >
            <Printer size={18} color="#374151" />
            <Text className="text-sm font-extrabold text-gray-700">Cetak Struk</Text>
          </TouchableOpacity>
        )}

        {isPaid && (
          <TouchableOpacity
            onPress={() => correct(order)}
            className="flex-1 flex-row items-center justify-center gap-2 bg-orange-400 rounded-2xl py-4 shadow-sm"
          >
            <Undo2 size={18} color="#ffffff" />
            <Text className="text-sm font-extrabold text-white">Koreksi</Text>
          </TouchableOpacity>
        )}

        {isOpen && (
          <>
            <TouchableOpacity
              onPress={() => edit(order)}
              className="flex-1 flex-row items-center justify-center gap-2 bg-yellow-100 rounded-2xl py-4 shadow-sm"
            >
              <Pencil size={18} color="#a16207" />
              <Text className="text-sm font-extrabold text-yellow-700">Ubah</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push(`/(cashier)/payment/${order.id}`)}
              className="flex-1 flex-row items-center justify-center gap-2 bg-green-500 rounded-2xl py-4 shadow-sm"
            >
              <Check size={18} color="#ffffff" />
              <Text className="text-sm font-extrabold text-white">Bayar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {dialogs}

      <PrinterSelector
        visible={selectorVisible}
        initialRole="cashier"
        onClose={() => setSelectorVisible(false)}
        onConnected={async (role, device) => {
          setSelectorVisible(false);
          setPrintError(null);
          await handlePrinterConnected(role, device);
        }}
      />
    </SafeAreaView>
  );
}
