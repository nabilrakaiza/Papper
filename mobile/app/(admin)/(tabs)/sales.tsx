import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { VictoryBar, VictoryChart, VictoryAxis, VictoryTheme } from "victory-native";
import { supabase } from "../../../lib/supabase";
import { SalesPeriod } from "../../../types/sales";
import { SalesReport } from "../../../types/owner";
import { orderTotal } from "../../../lib/constants";
import { useAuth } from "../../../context/AuthContext";
import { PickerModal } from "../../../components/owner/DateRangePicker";
import {
  DateRange,
  IsoDate,
  MONTHS_SHORT,
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  daysBetween,
  formatDayMonth,
  formatRange,
  jakartaDateOf,
  jakartaDayBounds,
  parseIso,
  startOfMonth,
  startOfWeek,
  todayJakarta,
} from "../../../lib/jakartaDate";

type SalesDataPoint = { label: string; total: number };
type TopMenuItem = { name: string; quantity: number };
type MethodTotal = { method: string; label: string; count: number; total: number };

// Display labels for the stored method_of_payment values, which are English
// because they are what the CHECK constraint and the receipt logic use.
const METHOD_LABELS: Record<string, string> = {
  Cash: "Tunai",
  "Bank Transfer": "Transfer Bank",
  QRIS: "QRIS",
  Debit: "Debit",
  // Only ever reached by an order marked 'Split' that has no per-payer rows to
  // break down — which should not happen, but "Tidak dicatat" would be a lie
  // about an order that was very much recorded.
  Split: "Terpisah",
};

// Fixed order so the card doesn't reshuffle between periods.
const METHOD_ORDER = ["Cash", "QRIS", "Debit", "Bank Transfer"];

/** Axis ticks, as the owner dashboard writes them: "1,5 jt", "500 rb". */
function formatAxisRupiah(amount: number): string {
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  }
  if (amount >= 1_000) return Math.round(amount / 1_000).toLocaleString("id-ID") + " rb";
  return amount.toLocaleString("id-ID");
}

function formatRupiahFull(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

// What a card is showing: one of the fixed periods, or — superadmin only — any
// range of Jakarta dates.
type Selection = { period: SalesPeriod } | { period: "custom"; range: DateRange };

const PERIOD_LABELS: { key: SalesPeriod | "custom"; label: string }[] = [
  { key: "daily", label: "Harian" },
  { key: "weekly", label: "Mingguan" },
  { key: "monthly", label: "Bulanan" },
  { key: "custom", label: "Kustom" },
];

function PeriodToggle({
  selection,
  allowCustom,
  onChange,
  onPickCustom,
}: {
  selection: Selection;
  allowCustom: boolean;
  onChange: (p: SalesPeriod) => void;
  onPickCustom: () => void;
}) {
  const period = selection.period;
  return (
    <View className="flex-row bg-purple-100 rounded-2xl p-1 gap-1 self-start">
      {PERIOD_LABELS.filter(({ key }) => allowCustom || key !== "custom").map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => (key === "custom" ? onPickCustom() : onChange(key))}
          className={`px-3 py-1.5 rounded-xl ${period === key ? "bg-white" : ""}`}
        >
          <Text
            className={`text-xs font-extrabold ${
              period === key ? "text-purple-600" : "text-purple-300"
            }`}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// The chosen range under a card's toggle, tappable to choose another.
function CustomRangeLabel({ selection, onPress }: { selection: Selection; onPress: () => void }) {
  if (selection.period !== "custom") return null;
  return (
    <TouchableOpacity onPress={onPress} className="self-start -mt-2 mb-3">
      <Text className="text-xs font-extrabold text-purple-600">
        {formatRange(selection.range.from, selection.range.to)} · ubah
      </Text>
    </TouchableOpacity>
  );
}

// The bars a period is drawn with, oldest first, as Jakarta dates: one per day
// for the last 7 days, one per Monday-start week for the last 4 weeks (this
// week included), one per month for the last 5 months (this month included).
//
// Built from the calendar rather than from the orders, so the bars always come
// in date order and a day with no sales shows as an empty bar instead of
// vanishing. They used to be keyed by whichever order the database returned
// rows in, which put the days out of order ("Sun, Fri, Mon, ...").
//
// A custom range is drawn a bar per day up to a month, a bar per week up to
// about four months, and a bar per month beyond that. Its first bar starts on
// the range's first day even mid-week or mid-month, so no bar reaches back
// before what was asked for.
function customBuckets(range: DateRange): { start: IsoDate; label: string }[] {
  const { from, to } = range;
  const span = daysBetween(from, to) + 1;
  const bars: { start: IsoDate; label: string }[] = [];

  if (span <= 31) {
    for (let day = from; day <= to; day = addDays(day, 1)) {
      bars.push({ start: day, label: formatDayMonth(day) });
    }
    return bars;
  }

  if (span <= 112) {
    for (let week = startOfWeek(from); week <= to; week = addDays(week, 7)) {
      const start = week < from ? from : week;
      bars.push({ start, label: formatDayMonth(start) });
    }
    return bars;
  }

  // The year goes on the label once the range spans more than one, or every
  // January would read the same.
  const multiYear = from.slice(0, 4) !== to.slice(0, 4);
  for (let month = startOfMonth(from); month <= to; month = addMonths(month, 1)) {
    const start = month < from ? from : month;
    const m = MONTHS_SHORT[parseIso(month).getUTCMonth()];
    bars.push({ start, label: multiYear ? `${m} ${month.slice(2, 4)}` : m });
  }
  return bars;
}

function buckets(selection: Selection): { start: IsoDate; label: string }[] {
  if (selection.period === "custom") return customBuckets(selection.range);
  const period = selection.period;
  const today = todayJakarta();
  if (period === "daily") {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { start: day, label: WEEKDAYS_SHORT[parseIso(day).getUTCDay()] };
    });
  }
  if (period === "weekly") {
    return Array.from({ length: 4 }, (_, i) => {
      const week = addDays(startOfWeek(today), (i - 3) * 7);
      return { start: week, label: formatDayMonth(week) };
    });
  }
  return Array.from({ length: 5 }, (_, i) => {
    const month = addMonths(startOfMonth(today), i - 4);
    return { start: month, label: MONTHS_SHORT[parseIso(month).getUTCMonth()] };
  });
}

// From the start of the first bar, Jakarta time, to now.
function getDateRange(period: SalesPeriod): { from: string; to: string } {
  return {
    from: jakartaDayBounds(buckets({ period })[0].start).from,
    to: new Date().toISOString(),
  };
}

// Add each amount to the bar its Jakarta date falls in.
function groupByDay(
  amounts: { day: IsoDate; total: number }[],
  selection: Selection
): SalesDataPoint[] {
  const bars = buckets(selection).map((b) => ({ ...b, total: 0 }));
  for (const { day, total } of amounts) {
    // The last bar whose start is on or before the day.
    for (let i = bars.length - 1; i >= 0; i--) {
      if (bars[i].start <= day) {
        bars[i].total += total;
        break;
      }
    }
  }
  return bars.map(({ label, total }) => ({ label, total }));
}

// A custom range is worked out by owner_sales_report rather than by pulling
// every order, line and payment in it to the phone: over months those are far
// more rows than one response carries, and the total would quietly stop short.
// It is the owner dashboard's own report, so the figures match it exactly.
async function fetchReport(range: DateRange): Promise<SalesReport | null> {
  const { data, error } = await supabase.rpc("owner_sales_report", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) {
    console.error("Failed to load sales report:", error.message);
    return null;
  }
  return data as SalesReport;
}

// Sorted into the fixed method order, with the labels the screen uses.
function toMethodTotals(totals: Map<string, { count: number; total: number }>): MethodTotal[] {
  return [...totals.entries()]
    .map(([method, v]) => ({
      method,
      label: METHOD_LABELS[method] ?? "Tidak dicatat",
      ...v,
    }))
    .sort(
      (a, b) =>
        (METHOD_ORDER.indexOf(a.method) + 1 || 99) -
        (METHOD_ORDER.indexOf(b.method) + 1 || 99)
    );
}

// More bars than fit a label each — a month of days on a phone — get every
// nth labelled, the last always among them.
function tickLabel(data: SalesDataPoint[], index: number): string {
  const step = Math.ceil(data.length / 8);
  return (data.length - 1 - index) % step === 0 ? data[index].label : "";
}

// A week ending today, as a starting point for the first custom pick.
function defaultCustomRange(): DateRange {
  const today = todayJakarta();
  return { from: addDays(today, -6), to: today, preset: "custom" };
}

const CHART_PADDING = { top: 20, bottom: 40, left: 56, right: 16 };

export default function AdminSalesScreen() {
  // Hook, not Dimensions.get at module scope: that captured the width once at
  // import time, so the chart kept the launch orientation's width after a
  // rotation and either overflowed or left a gap.
  const { width } = useWindowDimensions();
  // The chart card's own width once laid out. The screen width minus a guess at
  // the margins was close enough on a phone, but in a desktop browser it is the
  // card that sets the width, and the bars were sized for neither.
  const [chartWidth, setChartWidth] = useState<number | null>(null);
  const { profile } = useAuth();
  const isSuperadmin = profile?.role === "superadmin";

  // 1. Split state into two independent periods
  const [salesSelection, setSalesSelection] = useState<Selection>({ period: "daily" });
  const [topSellingSelection, setTopSellingSelection] = useState<Selection>({ period: "daily" });
  // Which card's range picker is open, if either.
  const [pickingFor, setPickingFor] = useState<"sales" | "topSelling" | null>(null);

  // What the cards show right now, for the realtime handler: it is subscribed
  // once, so reading the state directly kept refetching the first period
  // whatever had been chosen since.
  const salesSelectionRef = useRef(salesSelection);
  salesSelectionRef.current = salesSelection;
  const topSellingSelectionRef = useRef(topSellingSelection);
  topSellingSelectionRef.current = topSellingSelection;

  // Each fetch's number. A slow custom-range report that finishes after the
  // user has moved on must not overwrite what they moved on to.
  const salesFetchSeq = useRef(0);
  const topSellingFetchSeq = useRef(0);

  const [chartData, setChartData] = useState<SalesDataPoint[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [topMenu, setTopMenu] = useState<TopMenuItem[]>([]);
  const [byMethod, setByMethod] = useState<MethodTotal[]>([]);
  const [outstanding, setOutstanding] = useState<{ count: number; total: number }>({
    count: 0,
    total: 0,
  });

  // Optional: Split loading states so one chart doesn't block the other visually
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingTopSelling, setLoadingTopSelling] = useState(true);
  const [salesError, setSalesError] = useState(false);
  const [topSellingError, setTopSellingError] = useState(false);

  const fetchCustomSalesData = async (selection: Selection & { period: "custom" }, seq: number) => {
    const report = await fetchReport(selection.range);
    if (seq !== salesFetchSeq.current) return;

    if (!report) {
      setSalesError(true);
      setChartData([]);
      setTotalSales(0);
      setByMethod([]);
      setLoadingSales(false);
      return;
    }

    // The report already puts each split bill's rounding residual on its
    // largest share and nets correction rows out, as the code below does.
    const methodTotals = new Map<string, { count: number; total: number }>();
    for (const p of report.payments) {
      methodTotals.set(p.method ?? "—", { count: p.count, total: p.amount });
    }

    const hasSales = report.summary.transactions > 0;
    setByMethod(toMethodTotals(methodTotals));
    setTotalSales(report.summary.collected);
    setChartData(
      hasSales
        ? groupByDay(
            report.daily.map((d) => ({ day: d.date, total: d.collected ?? 0 })),
            selection
          )
        : []
    );
    setLoadingSales(false);
  };

  // 2. Separate fetch function for Sales Chart
  const fetchSalesData = async (selection: Selection) => {
    const seq = ++salesFetchSeq.current;
    setLoadingSales(true);
    setSalesError(false);

    if (selection.period === "custom") {
      await fetchCustomSalesData(selection, seq);
      return;
    }

    const { from, to } = getDateRange(selection.period);

    const { data: orders } = await supabase
      .from("orders")
      .select("id, paid_at, discount, tax")
      .eq("status", "paid")
      .gte("paid_at", from)
      .lte("paid_at", to);

    if (seq !== salesFetchSeq.current) return;

    if (!orders || orders.length === 0) {
      setChartData([]);
      setTotalSales(0);
      setByMethod([]);
      setLoadingSales(false);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, price, quantity")
      .in("order_id", orderIds);

    const ordersWithTotal = orders.map((order) => {
      const orderItems = (items ?? []).filter((i) => i.order_id === order.id);
      const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
      return {
        id: order.id,
        paid_at: order.paid_at,
        total: orderTotal(subtotal, order.discount, order.tax),
      };
    });

    const total = ordersWithTotal.reduce((sum, o) => sum + o.total, 0);

    // How every order was paid — the only record of it, for every order. One row
    // for an ordinary payment, one per payer for a split bill.
    const { data: payments } = await supabase
      .from("order_payments")
      .select("order_id, amount, method_of_payment")
      .in("order_id", orderIds);

    if (seq !== salesFetchSeq.current) return;

    const paymentsByOrder = new Map<number, { amount: number; method: string }[]>();
    for (const p of payments ?? []) {
      const list = paymentsByOrder.get(p.order_id) ?? [];
      list.push({ amount: p.amount, method: p.method_of_payment });
      paymentsByOrder.set(p.order_id, list);
    }

    // Split by payment method off the same rows — the breakdown always agrees
    // with the headline total because it is the same arithmetic.
    //
    // order_payments keeps the bill and the tender in separate columns, so
    // `amount` is directly summable. The old orders.payment_amount was not:
    // for cash it held the tender, so summing it overstated takings by whatever
    // change was handed back.
    const methodTotals = new Map<string, { count: number; total: number }>();

    const addToMethod = (method: string | null, amount: number) => {
      const key = method ?? "—";
      const entry = methodTotals.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += amount;
      methodTotals.set(key, entry);
    };

    for (const o of ordersWithTotal) {
      const shares = paymentsByOrder.get(o.id);

      // A paid order with no payment row should not exist. Attributing it to a
      // method would be inventing one, so it lands under "Tidak dicatat" where
      // it is visible rather than quietly folded into a real method's takings.
      if (!shares || shares.length === 0) {
        addToMethod(null, o.total);
        continue;
      }

      // Each share was rounded on its own when it was charged, so the shares
      // can sum to a rupiah or two either side of the order's recomputed total.
      // The residual goes on the largest share, which keeps this breakdown
      // adding up to the headline figure exactly — the invariant this map has
      // always had — without inventing a method that took no money.
      const charged = shares.reduce((sum, s) => sum + s.amount, 0);
      const residual = o.total - charged;
      const largest = shares.reduce(
        (best, s, idx) => (s.amount > shares[best].amount ? idx : best),
        0
      );

      shares.forEach((share, idx) => {
        addToMethod(share.method, share.amount + (idx === largest ? residual : 0));
      });
    }

    setByMethod(toMethodTotals(methodTotals));

    setTotalSales(total);
    // Each order goes on the bar for the Jakarta date it was paid on — not the
    // date it was taken, which for a table that settles the next day is a day
    // whose drawer has already been counted.
    setChartData(
      groupByDay(
        ordersWithTotal.map((o) => ({ day: jakartaDateOf(o.paid_at), total: o.total })),
        selection
      )
    );
    setLoadingSales(false);
  };

  // Open tabs, deliberately not filtered by the period toggle: an unpaid order
  // from last week is still owed today, and filtering it out of a "this week"
  // view is exactly how it gets forgotten.
  const fetchOutstanding = async () => {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, discount, tax")
      .eq("status", "unpaid");

    if (!orders || orders.length === 0) {
      setOutstanding({ count: 0, total: 0 });
      return;
    }

    const orderIds = orders.map((o) => o.id);

    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, price, quantity")
      .in("order_id", orderIds);

    // A split bill stays 'unpaid' until the last payer settles, so part of what
    // these orders are worth may already be in the till. Counting the whole
    // figure as outstanding would overstate what is still owed.
    const { data: payments } = await supabase
      .from("order_payments")
      .select("order_id, amount")
      .in("order_id", orderIds);

    const collectedByOrder = new Map<number, number>();
    for (const p of payments ?? []) {
      collectedByOrder.set(p.order_id, (collectedByOrder.get(p.order_id) ?? 0) + p.amount);
    }

    const total = orders.reduce((sum, order) => {
      const subtotal = (items ?? [])
        .filter((i) => i.order_id === order.id)
        .reduce((s, i) => s + i.price * i.quantity, 0);
      const owed =
        orderTotal(subtotal, order.discount, order.tax) - (collectedByOrder.get(order.id) ?? 0);
      return sum + Math.max(0, owed);
    }, 0);

    setOutstanding({ count: orders.length, total });
  };

  // 3. Separate fetch function for Top Selling Menu
  const fetchTopSellingData = async (selection: Selection) => {
    const seq = ++topSellingFetchSeq.current;
    setLoadingTopSelling(true);
    setTopSellingError(false);

    // The report's items come sorted by quantity sold, most first. They are
    // per menu under its current name, where the fixed periods below count by
    // the name each line was rung up under.
    if (selection.period === "custom") {
      const report = await fetchReport(selection.range);
      if (seq !== topSellingFetchSeq.current) return;
      if (!report) setTopSellingError(true);
      setTopMenu(
        (report?.items ?? []).slice(0, 5).map((i) => ({ name: i.name, quantity: i.qty }))
      );
      setLoadingTopSelling(false);
      return;
    }

    const { from, to } = getDateRange(selection.period);

    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "paid")
      .gte("paid_at", from)
      .lte("paid_at", to);

    if (seq !== topSellingFetchSeq.current) return;

    if (!orders || orders.length === 0) {
      setTopMenu([]);
      setLoadingTopSelling(false);
      return;
    }

    const orderIds = orders.map((o) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("name, quantity")
      .in("order_id", orderIds);

    if (seq !== topSellingFetchSeq.current) return;

    const itemCount: Record<string, { name: string; qty: number }> = {};
    (items ?? []).forEach((item) => {
      if (!itemCount[item.name]) {
        itemCount[item.name] = { name: item.name, qty: 0 };
      }
      itemCount[item.name].qty += item.quantity;
    });

    const top = Object.values(itemCount)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((i) => ({ name: i.name, quantity: i.qty }));
      
    setTopMenu(top);
    setLoadingTopSelling(false);
  };

  useEffect(() => {
    fetchSalesData(salesSelection);
  }, [salesSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTopSellingData(topSellingSelection);
  }, [topSellingSelection]);

  useEffect(() => {
    fetchOutstanding();
  }, []);

  useEffect(() => {
    const subscription = supabase
      .channel("sales-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchSalesData(salesSelectionRef.current);
        fetchTopSellingData(topSellingSelectionRef.current);
        fetchOutstanding();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers for respective Period Toggles
  const handleSalesPeriodChange = (p: SalesPeriod) => {
    setSalesSelection({ period: p });
  };

  const handleTopSellingPeriodChange = (p: SalesPeriod) => {
    setTopSellingSelection({ period: p });
  };

  // The picker opens on the card's current range, or on the last week the first
  // time. Closing it without applying leaves the card on what it was showing.
  const pickerSelection = pickingFor === "sales" ? salesSelection : topSellingSelection;
  const pickerInitial =
    pickerSelection.period === "custom" ? pickerSelection.range : defaultCustomRange();

  const handleApplyRange = (range: DateRange) => {
    const next: Selection = { period: "custom", range };
    if (pickingFor === "sales") setSalesSelection(next);
    else setTopSellingSelection(next);
    setPickingFor(null);
  };

  // Bars no wider than 48px, and the edge padding at least half a bar, so the
  // first and last bars stay inside the card however wide it is.
  const chartW = chartWidth ?? width - 64;
  const plotW = chartW - CHART_PADDING.left - CHART_PADDING.right;
  const barWidth = Math.max(10, Math.min(48, (plotW / Math.max(chartData.length, 1)) * 0.5));

  // Show full screen loader only if BOTH are loading on initial render
  const isInitialLoading = loadingSales && loadingTopSelling && chartData.length === 0 && topMenu.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Papper</Text>
        </View>
      </View>

      {isInitialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Sales Graph Card */}
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 mb-4 shadow-sm shadow-yellow-300/30">
            <View className="flex-row flex-wrap items-center justify-between gap-2 mb-4">
              {/* Pass the specific sales state and handler */}
              <PeriodToggle
                selection={salesSelection}
                allowCustom={isSuperadmin}
                onChange={handleSalesPeriodChange}
                onPickCustom={() => setPickingFor("sales")}
              />
              <Text className="text-lg font-black text-gray-900">Total Penjualan</Text>
            </View>
            <CustomRangeLabel selection={salesSelection} onPress={() => setPickingFor("sales")} />

            <View
              className="bg-cyan-100 rounded-2xl overflow-hidden min-h-[200px]"
              onLayout={(e) => setChartWidth(Math.round(e.nativeEvent.layout.width))}
            >
              {loadingSales ? (
                 <View className="h-40 items-center justify-center">
                   <ActivityIndicator size="small" color="#3a7bd5" />
                 </View>
              ) : chartData.length > 0 ? (
                <View collapsable={false}>
                  <VictoryChart
                    key={
                      salesSelection.period === "custom"
                        ? `${salesSelection.range.from}:${salesSelection.range.to}`
                        : salesSelection.period
                    }
                    width={chartW}
                    height={200}
                    theme={VictoryTheme.material}
                    domainPadding={{ x: barWidth / 2 + 12 }}
                    padding={CHART_PADDING}
                  >
                    {/* Bars are placed by position and labelled from it, since a
                        custom range's labels need not be unique to the axis.
                        From 1, not 0: Victory will not pad the domain below
                        zero, so a bar at 0 sat on top of the axis labels. */}
                    <VictoryAxis
                      tickValues={chartData.map((_, i) => i + 1)}
                      tickFormat={(t) => tickLabel(chartData, t - 1)}
                      style={{
                        tickLabels: { fontSize: 10, fontWeight: "600", fill: "#666" },
                        axis: { stroke: "transparent" },
                        grid: { stroke: "transparent" },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      tickFormat={(t) => formatAxisRupiah(t)}
                      style={{
                        tickLabels: { fontSize: 8, fontWeight: "600", fill: "#888" },
                        axis: { stroke: "transparent" },
                        grid: { stroke: "rgba(0,0,0,0.06)", strokeDasharray: "4" },
                      }}
                    />
                    <VictoryBar
                      data={chartData.map((d, i) => ({ x: i + 1, y: d.total }))}
                      barWidth={barWidth}
                      style={{ data: { fill: "#4caf50", rx: 6 } }}
                      animate={{ duration: 400, onLoad: { duration: 400 } }}
                    />
                  </VictoryChart>
                </View>
              ) : (
                <View className="h-40 items-center justify-center">
                  <Text className="text-gray-400 font-bold text-sm">
                    {salesError
                      ? "Gagal memuat penjualan. Periksa koneksi Anda."
                      : "Tidak ada data penjualan untuk periode ini"}
                  </Text>
                </View>
              )}

              {!loadingSales && (
                <View className="mx-4 mb-4 mt-2">
                  <View className="border border-gray-300 rounded-xl px-4 py-2 self-start bg-white/70">
                    <Text className="text-sm font-extrabold text-gray-800">
                      Total Penjualan : {formatRupiahFull(totalSales)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Payment method breakdown — follows the sales period toggle above,
              since it is a split of exactly that figure. */}
          <View className="bg-white rounded-3xl px-5 py-5 mb-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-lg font-black text-gray-900">Metode Bayar</Text>
              <Text className="text-[10px] font-extrabold text-gray-300 uppercase tracking-widest">
                periode grafik
              </Text>
            </View>

            {loadingSales ? (
              <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#3a7bd5" />
              </View>
            ) : byMethod.length === 0 ? (
              <Text className="text-gray-400 font-bold text-sm py-4 text-center">
                {salesError ? "Gagal memuat data." : "Tidak ada data untuk periode ini"}
              </Text>
            ) : (
              byMethod.map((m) => {
                const share = totalSales > 0 ? (m.total / totalSales) * 100 : 0;
                return (
                  <View key={m.method} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-sm font-bold text-gray-800">
                        {m.label}
                        <Text className="text-xs font-bold text-gray-400">
                          {"  "}
                          {m.count} pesanan
                        </Text>
                      </Text>
                      <Text className="text-sm font-extrabold text-gray-900">
                        {formatRupiahFull(m.total)}
                      </Text>
                    </View>
                    {/* Share bar — quicker to read than the percentages when
                        reconciling a till against the bank. */}
                    <View className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <View
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${Math.max(share, 1)}%` }}
                      />
                    </View>
                  </View>
                );
              })
            )}

            {byMethod.some((m) => m.method === "—") && (
              <Text className="text-[11px] font-bold text-amber-600 leading-4 mt-1">
                Sebagian pesanan lunas tidak mencatat metode bayar — kemungkinan
                ditutup sebelum fitur ini ada.
              </Text>
            )}
          </View>

          {/* Outstanding tabs. Not period-filtered: an old unpaid order is the
              one most worth chasing. */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/orders")}
            activeOpacity={0.8}
            className={`rounded-3xl px-5 py-5 mb-4 flex-row items-center justify-between ${
              outstanding.count > 0 ? "bg-amber-100" : "bg-white"
            }`}
          >
            <View className="flex-1 pr-3">
              <Text
                className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${
                  outstanding.count > 0 ? "text-amber-500" : "text-gray-400"
                }`}
              >
                Belum Dibayar
              </Text>
              <Text
                className={`text-2xl font-black ${
                  outstanding.count > 0 ? "text-amber-700" : "text-gray-900"
                }`}
              >
                {formatRupiahFull(outstanding.total)}
              </Text>
              <Text
                className={`text-xs font-bold mt-1 ${
                  outstanding.count > 0 ? "text-amber-500" : "text-gray-400"
                }`}
              >
                {outstanding.count} pesanan terbuka · ketuk untuk rincian
              </Text>
            </View>
            <ChevronRight size={20} color={outstanding.count > 0 ? "#b45309" : "#9ca3af"} />
          </TouchableOpacity>

          {/* Per-order drill-down */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/orders")}
            activeOpacity={0.8}
            className="bg-white rounded-3xl px-5 py-4 mb-4 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-sm font-extrabold text-gray-900">
                Rincian Pesanan
              </Text>
              <Text className="text-xs font-bold text-gray-400 mt-0.5">
                Telusuri tiap pesanan beserta itemnya
              </Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </TouchableOpacity>

          {/* The PIN override trail. Sits here rather than in the tab bar
              because it is something you go looking for while reading the day's
              takings — a total that moved is the reason to ask who approved it. */}
          <TouchableOpacity
            onPress={() => router.push("/(admin)/(tabs)/overrides")}
            activeOpacity={0.8}
            className="bg-white rounded-3xl px-5 py-4 mb-4 flex-row items-center justify-between"
          >
            <View>
              <Text className="text-sm font-extrabold text-gray-900">
                Otorisasi Manager
              </Text>
              <Text className="text-xs font-bold text-gray-400 mt-0.5">
                Pembatalan dan koreksi pesanan, beserta yang menyetujui
              </Text>
            </View>
            <ChevronRight size={20} color="#9ca3af" />
          </TouchableOpacity>

          {/* Top Selling Menu Card */}
          <View className="bg-yellow-100 rounded-3xl px-4 pt-4 pb-5 shadow-sm shadow-yellow-300/30">
            <View className="flex-row flex-wrap items-center justify-between gap-2 mb-4">
               {/* Pass the specific top selling state and handler */}
              <PeriodToggle
                selection={topSellingSelection}
                allowCustom={isSuperadmin}
                onChange={handleTopSellingPeriodChange}
                onPickCustom={() => setPickingFor("topSelling")}
              />
              <Text className="text-lg font-black text-gray-900">Terlaris</Text>
            </View>
            <CustomRangeLabel
              selection={topSellingSelection}
              onPress={() => setPickingFor("topSelling")}
            />

            <View className="bg-cyan-100 rounded-2xl px-4 py-2 min-h-[100px] justify-center">
              {loadingTopSelling ? (
                <View className="py-6 items-center">
                  <ActivityIndicator size="small" color="#3a7bd5" />
                </View>
              ) : topMenu.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-gray-400 font-bold text-sm">
                    {topSellingError ? "Gagal memuat data." : "Tidak ada data untuk periode ini"}
                  </Text>
                </View>
              ) : (
                topMenu.map((item, index) => (
                  <View key={item.name}>
                    <View className="flex-row items-center justify-between py-3">
                      <View className="flex-row items-center gap-3">
                        <View className="w-6 h-6 rounded-full bg-white/80 items-center justify-center">
                          <Text className="text-xs font-black text-gray-500">{index + 1}</Text>
                        </View>
                        <Text className="text-sm font-bold text-gray-800">{item.name}</Text>
                      </View>
                      <Text className="text-sm font-extrabold text-gray-600">
                        {item.quantity} pcs
                      </Text>
                    </View>
                    {index < topMenu.length - 1 && (
                      <View className="h-px bg-cyan-200" />
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {pickingFor !== null && (
        <PickerModal
          initial={pickerInitial}
          onClose={() => setPickingFor(null)}
          onApply={handleApplyRange}
        />
      )}
    </SafeAreaView>
  );
}