import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";
import { orderTotal } from "../../../lib/constants";
import { isConnectionError, NO_CONNECTION } from "../../../lib/errors";
import {
  IsoDate,
  formatDate,
  formatDayMonth,
  jakartaDateOf,
  jakartaDayBounds,
  todayJakarta,
} from "../../../lib/jakartaDate";
import { count, methodLabel, percent, rupiah } from "../../../components/owner/format";
import DayPicker from "../../../components/DayPicker";
import { DailySalesReport } from "../../../types/owner";
import { OrderStatus } from "../../../types/order";

type OrderRow = {
  id: number;
  dailyNumber: number | null;
  customerName: string;
  seat: string;
  createdAt: string;
  total: number;
  status: OrderStatus;
  /** Already handed over on a split bill; 0 on an ordinary order. */
  collected: number;
  /** Reopened at least once to correct it. */
  corrected: boolean;
};

/**
 * Money that moved on the chosen day to correct an order taken on an earlier
 * one. Every report books it on the order's own day, so it is in none of the
 * figures above — but it went into or out of today's drawer all the same.
 */
type CorrectionRow = {
  id: number;
  orderId: number;
  dailyNumber: number | null;
  customerName: string;
  orderDay: IsoDate;
  method: string;
  /** Negative when money was handed back. */
  amount: number;
  createdAt: string;
};

// Every method is listed, in this order, even on a day it took nothing — "Debit
// Rp 0" is an answer, and a row that only appears some days is not.
const METHOD_ORDER = ["Cash", "QRIS", "Debit", "Bank Transfer"];

// How many items the menu list shows before "Tampilkan semua".
const ITEMS_SHOWN = 10;

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function categoryLabel(category: string): string {
  return category === "Custom" ? "Item kustom" : category;
}

function hourLabel(hour: number): string {
  const h = String(hour).padStart(2, "0");
  return `${h}.00 – ${h}.59`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View className="bg-white rounded-3xl px-4 pt-4 pb-3 mb-4 shadow-sm">
      <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start bg-gray-50">
        <Text className="text-sm font-bold text-gray-700">{title}</Text>
      </View>
      {subtitle ? (
        <Text className="text-[11px] font-bold text-gray-400 mt-2">{subtitle}</Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

const num = { fontVariant: ["tabular-nums" as const] };

/**
 * A label and a figure on one line, with an optional note under both. The note
 * gets the full width: squeezed beside the figure, a phone wraps it mid-amount.
 */
function Line({
  label,
  value,
  note,
  strong = false,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <View className="py-1.5">
      <View className="flex-row justify-between items-start">
        <Text
          className={`flex-1 pr-3 text-sm ${strong ? "font-black text-gray-900" : "font-bold text-gray-600"}`}
        >
          {label}
        </Text>
        <Text
          className={`text-sm ${strong ? "font-black text-gray-900" : "font-extrabold text-gray-800"}`}
          style={num}
        >
          {value}
        </Text>
      </View>
      {note ? <Text className="text-[11px] font-bold text-gray-400 mt-0.5">{note}</Text> : null}
    </View>
  );
}

const Divider = () => <View className="h-px bg-gray-100 my-1.5" />;

/**
 * The owner dashboard's figures for one day, as numbers: Ringkasan, Pembayaran
 * and Menu, plus the hourly table. No cost, profit or margin — the database
 * does not send them to this screen at all.
 */
function DailyDetail({ report }: { report: DailySalesReport }) {
  const [showAllItems, setShowAllItems] = useState(false);
  const { summary } = report;

  const average = summary.transactions > 0 ? summary.net / summary.transactions : 0;

  // Payments: the fixed four first, then anything else the report has — in
  // practice only "not recorded", for a paid order with no payment row.
  const byMethod = new Map(report.payments.map((p) => [p.method, p]));
  const methods = [
    ...METHOD_ORDER.map((m) => byMethod.get(m) ?? { method: m, count: 0, amount: 0 }),
    ...report.payments.filter((p) => p.method === null || !METHOD_ORDER.includes(p.method)),
  ];
  const paymentsTotal = methods.reduce((s, p) => s + p.amount, 0);
  const paymentsCount = methods.reduce((s, p) => s + p.count, 0);

  const categories = [
    ...report.items
      .reduce((map, item) => {
        const entry = map.get(item.category) ?? { qty: 0, gross: 0 };
        entry.qty += item.qty;
        entry.gross += item.gross;
        return map.set(item.category, entry);
      }, new Map<string, { qty: number; gross: number }>())
      .entries(),
  ]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.gross - a.gross);
  const itemsGross = categories.reduce((s, c) => s + c.gross, 0);

  // Already sorted by quantity sold, then by sales, in the database.
  const items = showAllItems ? report.items : report.items.slice(0, ITEMS_SHOWN);

  const hours = report.hourly.filter((h) => h.orders > 0);

  return (
    <>
      <Section title="Ringkasan" subtitle="Pesanan yang dibuat pada tanggal ini dan sudah lunas">
        <Line label="Penjualan kotor" value={rupiah(summary.gross)} note="Sebelum diskon dan pajak" />
        <Line label="Diskon" value={rupiah(-summary.discount)} />
        <Line label="Penjualan bersih" value={rupiah(summary.net)} />
        <Line label="Pajak" value={rupiah(summary.tax)} />
        <Divider />
        <Line label="Total diterima" value={rupiah(summary.collected)} note="Penjualan bersih + pajak" strong />
        <Divider />
        <Line label="Transaksi" value={count(summary.transactions)} />
        <Line label="Rata-rata per transaksi" value={rupiah(average)} note="Penjualan bersih ÷ transaksi" />
      </Section>

      <Section
        title="Metode Bayar"
        subtitle="Termasuk pajak. Split bill dihitung per pembayar; uang yang dikembalikan saat koreksi sudah dikurangi."
      >
        {methods.map((p) => (
          <Line
            key={p.method ?? "none"}
            label={methodLabel(p.method)}
            value={rupiah(p.amount)}
            note={
              p.count > 0
                ? `${count(p.count)} pembayaran · ${
                    paymentsTotal > 0 ? percent(p.amount / paymentsTotal) : "0%"
                  } · rata-rata ${rupiah(p.amount / p.count)}`
                : "Belum ada pembayaran"
            }
          />
        ))}
        <Divider />
        <Line label="Total" value={rupiah(paymentsTotal)} note={`${count(paymentsCount)} pembayaran`} strong />
        {byMethod.has(null) && (
          <Text className="text-[11px] font-bold text-amber-700 mt-1">
            Ada pesanan lunas yang tidak mencatat metode bayar.
          </Text>
        )}
      </Section>

      <Section title="Menu Terjual" subtitle="Penjualan kotor, sebelum diskon dan pajak">
        {report.items.length === 0 ? (
          <Text className="text-sm font-bold text-gray-300 text-center py-2">Belum ada item terjual</Text>
        ) : (
          <>
            <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-1">
              Per kategori
            </Text>
            {categories.map((c) => (
              <Line
                key={c.category}
                label={categoryLabel(c.category)}
                value={rupiah(c.gross)}
                note={`${count(c.qty)} terjual · ${itemsGross > 0 ? percent(c.gross / itemsGross) : "0%"}`}
              />
            ))}

            <Divider />
            <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mt-2 mb-1">
              Per item
            </Text>
            {items.map((item, index) => (
              <View key={`${item.menu_id ?? "custom"}-${item.name}`} className="flex-row items-center py-1.5">
                <View className="w-6 h-6 rounded-full bg-cyan-100 items-center justify-center mr-3">
                  <Text className="text-xs font-black text-gray-500">{index + 1}</Text>
                </View>
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-[11px] font-bold text-gray-400">
                    {categoryLabel(item.category)} · {count(item.qty)} pcs
                  </Text>
                </View>
                <Text className="text-sm font-extrabold text-gray-800" style={num}>
                  {rupiah(item.gross)}
                </Text>
              </View>
            ))}
            {report.items.length > ITEMS_SHOWN && (
              <TouchableOpacity onPress={() => setShowAllItems((v) => !v)} className="py-2 items-center">
                <Text className="text-xs font-extrabold text-blue-600">
                  {showAllItems ? "Tampilkan lebih sedikit" : `Tampilkan semua (${report.items.length} item)`}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </Section>

      <Section title="Per Jam" subtitle="Menurut jam pesanan dibuat (WIB), penjualan kotor">
        {hours.length === 0 ? (
          <Text className="text-sm font-bold text-gray-300 text-center py-2">Belum ada transaksi</Text>
        ) : (
          hours.map((h) => (
            <Line
              key={h.hour}
              label={hourLabel(h.hour)}
              value={rupiah(h.gross)}
              note={`${count(h.orders)} transaksi`}
            />
          ))
        )}
      </Section>
    </>
  );
}

/**
 * Correction money that moved on this day for orders from other days, with a
 * total per method so the drawer can be counted against it.
 */
function OtherDayCorrections({ rows }: { rows: CorrectionRow[] }) {
  const byMethod = new Map<string, number>();
  for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <Section
      title="Koreksi Pesanan Hari Lain"
      subtitle="Uang yang diterima atau dikembalikan pada tanggal ini untuk pesanan dari hari lain. Tidak termasuk dalam angka di atas — laporan mencatatnya pada tanggal pesanan."
    >
      {rows.map((r) => (
        <TouchableOpacity
          key={r.id}
          onPress={() => router.push(`/(cashier)/history/${r.orderId}`)}
          className="flex-row items-center py-1.5"
        >
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
              #{r.dailyNumber ?? r.orderId} · {r.customerName}
            </Text>
            <Text className="text-[11px] font-bold text-gray-400">
              Pesanan {formatDate(r.orderDay)} · {methodLabel(r.method)}
            </Text>
          </View>
          <Text
            className={`text-sm font-extrabold ${r.amount < 0 ? "text-red-500" : "text-gray-800"}`}
            style={num}
          >
            {rupiah(r.amount)}
          </Text>
        </TouchableOpacity>
      ))}
      <Divider />
      {[...byMethod.entries()].map(([method, amount]) => (
        <Line key={method} label={methodLabel(method)} value={rupiah(amount)} />
      ))}
      <Line label="Total" value={rupiah(total)} note="Negatif berarti uang keluar dari kasir" strong />
    </Section>
  );
}

/** One order on the day's lists. Tapping it opens the order. */
function OrderListRow({
  order,
  tone,
  amount,
  note,
}: {
  order: OrderRow;
  tone: "paid" | "unpaid" | "cancelled";
  amount: string;
  note?: string;
}) {
  const bg = tone === "unpaid" ? "bg-yellow-100" : tone === "cancelled" ? "bg-gray-50" : "bg-white";
  const amountColor =
    tone === "unpaid" ? "text-yellow-600" : tone === "cancelled" ? "text-gray-300 line-through" : "text-green-600";

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(cashier)/history/${order.id}`)}
      className={`${bg} rounded-2xl px-4 py-3 mb-2 flex-row justify-between items-center shadow-sm`}
    >
      <View className="flex-1 pr-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-bold text-gray-800" numberOfLines={1}>
            {order.customerName}
          </Text>
          {order.corrected && (
            <View className="bg-orange-100 rounded-lg px-2 py-0.5">
              <Text className="text-[10px] font-extrabold text-orange-700">Koreksi</Text>
            </View>
          )}
        </View>
        <Text className="text-xs font-bold text-gray-400">
          #{order.dailyNumber ?? order.id} · {formatJakartaTime(order.createdAt)} · Tempat Duduk{" "}
          {order.seat}
        </Text>
        {note ? (
          <Text className="text-[10px] font-extrabold text-blue-600 mt-0.5">{note}</Text>
        ) : null}
      </View>
      <Text className={`text-sm font-extrabold ${amountColor}`}>{amount}</Text>
      <ChevronRight size={16} color="#d1d5db" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

/** "14.05" on Jakarta's clock. */
function formatJakartaTime(timestamp: string): string {
  const shifted = new Date(new Date(timestamp).getTime() + 7 * 60 * 60 * 1000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}.${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

export default function CashierSalesScreen() {
  // Null follows today, so a screen left open past midnight moves on to the new
  // day by itself, as it did before there was a choice. A picked date stays put.
  const [pickedDay, setPickedDay] = useState<IsoDate | null>(null);
  const day = pickedDay ?? todayJakarta();
  const isToday = day === todayJakarta();

  // The realtime callback is set up once, so it reads the choice from here
  // rather than from the render it was created in — and works "today" out when
  // it runs, so a refresh after midnight loads the new day.
  const pickedRef = useRef(pickedDay);
  pickedRef.current = pickedDay;

  const [totalSales, setTotalSales] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [totalUnpaid, setTotalUnpaid] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  // Which day the figures on screen belong to. Until the chosen day's figures
  // arrive the old ones are hidden, not shown under the new date.
  const [loadedDay, setLoadedDay] = useState<IsoDate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<DailySalesReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  // Only the newest request of each kind may land. A payment fires a change on
  // order_payments and then another on orders, and the fetches can come back in
  // either order — and stepping through days quickly would otherwise let a slow
  // answer for the day before overwrite the one now chosen.
  const latestSales = useRef(0);
  const latestReport = useRef(0);

  const fetchSales = useCallback(async () => {
    const request = ++latestSales.current;
    const forDay = pickedRef.current ?? todayJakarta();
    setError(null);

    try {
      // The chosen day in Jakarta, the same day the report below covers — not
      // the device's own midnight, which is only the same while its clock is on
      // WIB.
      const { from, to } = jakartaDayBounds(forDay);

      // Fetch all of the day's orders, whatever their status
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, daily_number, customer_name, seat, created_at, discount, tax, status, reopen_seq")
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false });

      // Correction rows written on this day. The ones for this day's own orders
      // are already in its figures and are dropped below.
      const { data: correctionData, error: correctionError } = await supabase
        .from("order_payments")
        .select("id, order_id, amount, method_of_payment, created_at, orders(daily_number, customer_name, created_at)")
        .gt("reopen_seq", 0)
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: true });

      if (request !== latestSales.current) return;

      // A failed request used to be indistinguishable from a quiet day: the
      // error was never destructured, so everything reset to zero and the cashier
      // was shown "Rp 0" for the day's sales as though that were the real figure.
      if (ordersError || correctionError) {
        console.error("Failed to fetch sales:", (ordersError ?? correctionError)?.message);
        setError("Gagal memuat penjualan. Periksa koneksi Anda.");
        return;
      }

      setCorrections(
        (correctionData ?? [])
          .map((p: any) => ({
            id: p.id,
            orderId: p.order_id,
            dailyNumber: p.orders?.daily_number ?? null,
            customerName: p.orders?.customer_name ?? "",
            orderDay: p.orders ? jakartaDateOf(p.orders.created_at) : forDay,
            method: p.method_of_payment,
            amount: p.amount,
            createdAt: p.created_at,
          }))
          .filter((r) => r.orderDay !== forDay)
      );

      if (!ordersData || ordersData.length === 0) {
        setTotalSales(0);
        setTotalPaid(0);
        setTotalUnpaid(0);
        setOrders([]);
        setLoadedDay(forDay);
        return;
      }

      // Fetch order items
      const orderIds = ordersData.map((o) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id, price, quantity")
        .in("order_id", orderIds);

      // What each order has already taken from a split bill. An order stays
      // 'unpaid' until the last payer settles, so without this a table that has
      // paid two shares of three counts as wholly unpaid — the "Belum Dibayar"
      // figure would claim money that is already in the till.
      const { data: payments } = await supabase
        .from("order_payments")
        .select("order_id, amount")
        .in("order_id", orderIds);

      if (request !== latestSales.current) return;

      const collectedByOrder = new Map<number, number>();
      for (const p of payments ?? []) {
        collectedByOrder.set(p.order_id, (collectedByOrder.get(p.order_id) ?? 0) + p.amount);
      }

      // Build order rows with totals
      let paidTotal = 0;
      let unpaidTotal = 0;

      const orderRows: OrderRow[] = ordersData.map((order) => {
        const orderItems = (items ?? []).filter((i) => i.order_id === order.id);
        const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const total = orderTotal(subtotal, order.discount, order.tax);
        const collected = collectedByOrder.get(order.id) ?? 0;

        if (order.status === "paid") {
          paidTotal += total;
        } else if (order.status === "unpaid") {
          // A part-settled order lands on both sides: what has been handed over
          // is takings, what is left is still owed.
          paidTotal += Math.min(collected, total);
          unpaidTotal += Math.max(0, total - collected);
        }

        return {
          id: order.id,
          dailyNumber: order.daily_number ?? null,
          customerName: order.customer_name,
          seat: order.seat,
          createdAt: order.created_at,
          total,
          status: order.status,
          collected,
          corrected: (order.reopen_seq ?? 0) > 0,
        };
      });

      setOrders(orderRows);
      setTotalSales(paidTotal + unpaidTotal);
      setTotalPaid(paidTotal);
      setTotalUnpaid(unpaidTotal);
      setLoadedDay(forDay);
      setError(null);
    } catch (e) {
      if (request !== latestSales.current) return;
      console.error("Failed to fetch sales:", e);
      setError("Gagal memuat penjualan. Periksa koneksi Anda.");
    }
  }, []);

  // Fetched apart from the cards above and failing on its own: the cards are
  // what the cashier works from, and a missing breakdown should not take them
  // down with it.
  const fetchReport = useCallback(async () => {
    const request = ++latestReport.current;
    try {
      const { data, error: rpcError } = await supabase.rpc("daily_sales_report", {
        p_date: pickedRef.current ?? todayJakarta(),
      });
      if (request !== latestReport.current) return;

      if (rpcError) {
        console.error("Failed to fetch daily sales report:", rpcError.message);
        setReportError(
          isConnectionError(rpcError)
            ? NO_CONNECTION
            : // PostgREST's "no such function": this build is running against a
              // database the daily_sales_report migration has not reached yet.
              rpcError.code === "PGRST202"
              ? "Rincian penjualan belum tersedia — database belum diperbarui."
              : "Gagal memuat rincian penjualan."
        );
        return;
      }

      setReport(data as DailySalesReport);
      setReportError(null);
    } catch (e) {
      if (request !== latestReport.current) return;
      console.error("Failed to fetch daily sales report:", e);
      setReportError("Gagal memuat rincian penjualan. Periksa koneksi Anda.");
    }
  }, []);

  // A new day: drop the old day's breakdown at once rather than leave it under
  // the new date until the fetch lands.
  useEffect(() => {
    setReport(null);
    setReportError(null);
    fetchSales();
    fetchReport();
  }, [day, fetchSales, fetchReport]);

  useEffect(() => {
    const refresh = () => {
      fetchSales();
      fetchReport();
    };

    // order_payments as well as orders: one payer settling their share of a
    // split bill writes only a payment row, and the figures here move with it.
    const subscription = supabase
      .channel("sales-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments" }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchSales, fetchReport]);

  const loaded = loadedDay === day;
  const paidOrders = orders.filter((o) => o.status === "paid");
  const unpaidOrders = orders.filter((o) => o.status === "unpaid");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-black text-gray-900">Penjualan Harian</Text>
      </View>

      <View
        className="px-4 pb-3"
        style={{ width: "100%", maxWidth: 720, alignSelf: "center" }}
      >
        <DayPicker
          value={day}
          onChange={(d) => setPickedDay(d === todayJakarta() ? null : d)}
        />
      </View>

      {!!error && (
        <TouchableOpacity
          onPress={() => {
            setError(null);
            fetchSales();
          }}
          className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
        >
          <Text className="text-xs font-bold text-red-600">{error} Ketuk untuk mencoba lagi.</Text>
        </TouchableOpacity>
      )}

      {!loaded ? (
        <View className="flex-1 items-center justify-center">
          {!error && <ActivityIndicator size="large" color="#3a7bd5" />}
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 24,
          // Readable columns on a landscape tablet rather than figures stranded
          // at opposite edges of the screen.
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-green-400 rounded-2xl px-4 py-4 shadow shadow-green-600/30">
            <Text className="text-xs font-extrabold text-white/70 mb-1">Dibayar</Text>
            <Text className="text-base font-black text-white">
              {formatRupiah(totalPaid)}
            </Text>
            <Text className="text-xs text-white/60 mt-0.5">
              {paidOrders.length} pesanan
            </Text>
          </View>
          <View className="flex-1 bg-yellow-100 rounded-2xl px-4 py-4 shadow-sm">
            <Text className="text-xs font-extrabold text-gray-400 mb-1">Belum Bayar</Text>
            <Text className="text-base font-black text-gray-800">
              {formatRupiah(totalUnpaid)}
            </Text>
            <Text className="text-xs text-gray-400 mt-0.5">
              {unpaidOrders.length} pesanan
            </Text>
          </View>
        </View>

        {/* Total */}
        <View className="bg-gray-900 rounded-2xl px-4 py-3 mb-4 flex-row justify-between items-center">
          <Text className="text-sm font-extrabold text-white/70">
            {isToday ? "Total Hari Ini" : `Total ${formatDayMonth(day)}`}
          </Text>
          <Text className="text-base font-black text-white">
            {formatRupiah(totalSales)}
          </Text>
        </View>

        {!!reportError && (
          <TouchableOpacity
            onPress={fetchReport}
            className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3"
          >
            <Text className="text-xs font-bold text-amber-800">
              {reportError} Ketuk untuk mencoba lagi.
            </Text>
          </TouchableOpacity>
        )}

        {report && <DailyDetail key={day} report={report} />}

        {corrections.length > 0 && <OtherDayCorrections rows={corrections} />}

        {/* Unpaid orders */}
        {unpaidOrders.length > 0 && (
          <>
            <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1">
              Pesanan Belum Selesai
            </Text>
            {/* What is still owed, not the whole bill — part of this one may
                already be in the till. */}
            {unpaidOrders.map((order) => (
              <OrderListRow
                key={order.id}
                order={order}
                tone="unpaid"
                amount={formatRupiah(Math.max(0, order.total - order.collected))}
                note={
                  order.collected > 0
                    ? `Sudah dibayar sebagian · ${formatRupiah(order.collected)}`
                    : undefined
                }
              />
            ))}
          </>
        )}

        {/* Paid orders */}
        <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1 mt-2">
          Pesanan Selesai
        </Text>
        {paidOrders.length === 0 ? (
          <Text className="text-center text-gray-300 font-bold mb-4">
            {isToday ? "Belum ada pesanan selesai hari ini" : "Tidak ada pesanan selesai"}
          </Text>
        ) : (
          paidOrders.map((order) => (
            <OrderListRow
              key={order.id}
              order={order}
              tone="paid"
              amount={formatRupiah(order.total)}
            />
          ))
        )}

        {/* Cancelled orders, so one can still be looked up. */}
        {cancelledOrders.length > 0 && (
          <>
            <Text className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3 px-1 mt-2">
              Dibatalkan
            </Text>
            {cancelledOrders.map((order) => (
              <OrderListRow
                key={order.id}
                order={order}
                tone="cancelled"
                amount={formatRupiah(order.total)}
              />
            ))}
          </>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}
