import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { orderTotal, TAX_RATE } from "@/lib/constants";
import { formatJakartaDateTime } from "@/lib/jakartaDate";
import { describeError, useOwnerReport } from "@/context/OwnerReportContext";
import { ACCENT, Card, Empty, ErrorBanner, Segmented } from "@/components/owner/ui";
import { count, methodLabel, rupiah, STATUS_LABELS } from "@/components/owner/format";
import { OrderStatus, OwnerOrderRow, OwnerOrdersPage } from "@/types/owner";

const PAGE_SIZE = 50;

type StatusFilter = "all" | OrderStatus;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "paid", label: "Lunas" },
  { key: "unpaid", label: "Belum bayar" },
  { key: "cancelled", label: "Dibatalkan" },
];

const STATUS_STYLE: Record<OrderStatus, string> = {
  paid: "bg-green-50 text-green-700",
  unpaid: "bg-amber-50 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
};

type Detail = {
  items: {
    id: number;
    name: string;
    price: number;
    quantity: number;
    notes: string | null;
    menu_id: number | null;
    customer_num: number;
  }[];
  payments: {
    id: number;
    customer_num: number;
    customer_label: string | null;
    amount: number;
    method_of_payment: string;
    reopen_seq: number;
  }[];
};

function OrderDetail({ order }: { order: OwnerOrderRow }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [items, payments] = await Promise.all([
        supabase
          .from("order_items")
          .select("id, name, price, quantity, notes, menu_id, customer_num")
          .eq("order_id", order.id)
          .order("id"),
        supabase
          .from("order_payments")
          .select("id, customer_num, customer_label, amount, method_of_payment, reopen_seq")
          .eq("order_id", order.id)
          .order("reopen_seq")
          .order("customer_num"),
      ]);
      if (cancelled) return;
      if (items.error || payments.error) {
        setError(describeError(items.error ?? payments.error));
        return;
      }
      setDetail({ items: items.data ?? [], payments: payments.data ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  if (error) return <Text className="text-sm font-bold text-red-600 px-4 pb-4">{error}</Text>;
  if (!detail) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color={ACCENT} />
      </View>
    );
  }

  const subtotal = detail.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const afterDiscount = Math.round(subtotal * (1 - order.discount / 100));
  const total = orderTotal(subtotal, order.discount);
  const payers = new Set(detail.items.map((i) => i.customer_num)).size;

  const line = (label: string, value: string, strong = false) => (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-sm ${strong ? "font-black text-gray-900" : "font-bold text-gray-500"}`}>{label}</Text>
      <Text className={`text-sm ${strong ? "font-black text-gray-900" : "font-bold text-gray-700"}`}>{value}</Text>
    </View>
  );

  return (
    <View className="flex-row flex-wrap gap-6 px-4 pb-5 pt-2 bg-gray-50">
      <View className="flex-1 min-w-[280px]">
        <Text className="text-xs font-extrabold text-gray-400 mb-2">ITEM</Text>
        {detail.items.map((i) => (
          <View key={i.id} className="flex-row justify-between py-1">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-gray-800">
                {i.quantity}× {i.name}
                {i.menu_id === null && <Text className="text-[10px] font-extrabold text-green-600">{"  "}KUSTOM</Text>}
                {payers > 1 && <Text className="text-xs font-bold text-gray-400">{"  "}pembayar {i.customer_num}</Text>}
              </Text>
              {i.notes ? <Text className="text-xs font-bold text-gray-400">{i.notes}</Text> : null}
            </View>
            <Text className="text-sm font-bold text-gray-700">{rupiah(i.price * i.quantity)}</Text>
          </View>
        ))}
      </View>

      <View className="min-w-[260px]" style={{ flexBasis: 300 }}>
        <Text className="text-xs font-extrabold text-gray-400 mb-2">RINCIAN</Text>
        {line("Subtotal", rupiah(subtotal))}
        {order.discount > 0 && line(`Diskon ${order.discount}%`, rupiah(afterDiscount - subtotal))}
        {line(`Pajak ${Math.round(TAX_RATE * 100)}%`, rupiah(total - afterDiscount))}
        {line("Total", rupiah(total), true)}

        {detail.payments.length > 0 && (
          <>
            <Text className="text-xs font-extrabold text-gray-400 mt-4 mb-2">PEMBAYARAN</Text>
            {detail.payments.map((p) =>
              line(
                [
                  methodLabel(p.method_of_payment),
                  p.customer_label || (payers > 1 ? `Pembayar ${p.customer_num}` : null),
                  p.reopen_seq > 0 ? `koreksi ${p.reopen_seq}` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                rupiah(p.amount)
              )
            )}
          </>
        )}
      </View>
    </View>
  );
}

function OrderRow({ order, open, onToggle }: { order: OwnerOrderRow; open: boolean; onToggle: () => void }) {
  const num = { fontVariant: ["tabular-nums" as const] };
  // Every method money moved through, not "Terpisah": a corrected bill refunded
  // in cash has two methods and one payer.
  const methods = order.methods.length === 0 ? "—" : order.methods.map(methodLabel).join(" + ");

  return (
    <View className="border-b border-gray-100">
      <TouchableOpacity onPress={onToggle} className="flex-row items-center py-3 px-3">
        <Text className="text-sm font-black text-gray-900" style={{ width: 56 }}>#{order.daily_number ?? "—"}</Text>
        <Text className="text-sm font-bold text-gray-600" style={{ width: 170 }}>{formatJakartaDateTime(order.created_at)}</Text>
        <View className="flex-1 pr-3" style={{ minWidth: 180 }}>
          <Text className="text-sm font-bold text-gray-900" numberOfLines={1}>{order.customer_name || "Tanpa nama"}</Text>
          <Text className="text-xs font-bold text-gray-400">
            {order.is_dine_in === false ? "Takeaway" : `Dine-in${order.seat ? ` · meja ${order.seat}` : ""}`}
          </Text>
        </View>
        <Text className="text-sm font-bold text-gray-600 text-right" style={[{ width: 70 }, num]}>{count(order.item_count)}</Text>
        <Text className="text-sm font-bold text-gray-600 pl-4" style={{ width: 200 }} numberOfLines={1}>{methods}</Text>
        <Text className="text-sm font-black text-gray-900 text-right" style={[{ width: 130 }, num]}>{rupiah(order.total)}</Text>
        <View style={{ width: 150 }} className="flex-row items-center justify-end gap-2">
          {order.reopen_seq > 0 && (
            <Text className="text-[10px] font-extrabold text-purple-700 bg-purple-50 rounded-md px-1.5 py-0.5">DIKOREKSI</Text>
          )}
          <Text className={`text-xs font-extrabold rounded-md px-2 py-0.5 ${STATUS_STYLE[order.status]}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Text>
        </View>
        <View style={{ width: 28 }} className="items-end">
          {open ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
        </View>
      </TouchableOpacity>
      {open && <OrderDetail order={order} />}
    </View>
  );
}

export default function Pesanan() {
  const { range, refreshKey } = useOwnerReport();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<OwnerOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to what is being asked for starts again from the first page.
  useEffect(() => {
    setPageIndex(0);
  }, [range, status, debounced]);

  useEffect(() => {
    const request = ++latest.current;
    setLoading(true);
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("owner_orders", {
        p_from: range.from,
        p_to: range.to,
        p_status: status === "all" ? null : status,
        p_search: debounced.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: pageIndex * PAGE_SIZE,
      });
      if (request !== latest.current) return;
      if (rpcError || !data) {
        console.error("owner_orders failed:", rpcError);
        setError(describeError(rpcError));
      } else {
        setPage(data as OwnerOrdersPage);
        setError(null);
      }
      setLoading(false);
    })();
  }, [range, status, debounced, pageIndex, refreshKey, retry]);

  const total = page?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center gap-3">
        <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} onPage />
        <View className="flex-row items-center gap-2 bg-white rounded-xl px-3 py-2" style={{ minWidth: 320 }}>
          <Search size={14} color="#9ca3af" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama pelanggan atau nomor"
            placeholderTextColor="#9ca3af"
            className="flex-1 text-sm font-bold text-gray-900"
            style={{ outlineStyle: "none" } as object}
          />
        </View>
      </View>

      {error && <ErrorBanner message={error} onRetry={() => setRetry((r) => r + 1)} />}

      <Card
        title={`${count(total)} pesanan`}
        subtitle="Nomor harian dan jam menurut WIB. Klik pesanan untuk melihat isinya."
      >
        {!page && loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color={ACCENT} />
          </View>
        ) : (
          <View style={{ opacity: loading ? 0.5 : 1 }}>
            <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
              <View style={{ minWidth: 1000, flex: 1 }}>
                <View className="flex-row items-center py-2 px-3 bg-gray-50 rounded-t-xl border-b border-gray-200">
                  <Text className="text-xs font-extrabold text-gray-500" style={{ width: 56 }}>No.</Text>
                  <Text className="text-xs font-extrabold text-gray-500" style={{ width: 170 }}>Waktu</Text>
                  <Text className="flex-1 text-xs font-extrabold text-gray-500" style={{ minWidth: 180 }}>Pelanggan</Text>
                  <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 70 }}>Item</Text>
                  <Text className="text-xs font-extrabold text-gray-500 pl-4" style={{ width: 200 }}>Metode</Text>
                  <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 130 }}>Total</Text>
                  <Text className="text-xs font-extrabold text-gray-500 text-right" style={{ width: 150 }}>Status</Text>
                  <View style={{ width: 28 }} />
                </View>
                {page && page.rows.length === 0 ? (
                  <Empty text="Tidak ada pesanan untuk filter ini" />
                ) : (
                  page?.rows.map((o) => (
                    <OrderRow key={o.id} order={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} />
                  ))
                )}
              </View>
            </ScrollView>

            {pages > 1 && (
              <View className="flex-row items-center justify-end gap-3 mt-4">
                <Text className="text-xs font-bold text-gray-500">
                  {count(pageIndex * PAGE_SIZE + 1)}–{count(Math.min((pageIndex + 1) * PAGE_SIZE, total))} dari {count(total)}
                </Text>
                <TouchableOpacity
                  disabled={pageIndex === 0}
                  onPress={() => setPageIndex((p) => p - 1)}
                  className={`w-9 h-9 rounded-full border border-gray-200 items-center justify-center ${pageIndex === 0 ? "opacity-30" : ""}`}
                  accessibilityLabel="Halaman sebelumnya"
                >
                  <ChevronLeft size={16} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={pageIndex >= pages - 1}
                  onPress={() => setPageIndex((p) => p + 1)}
                  className={`w-9 h-9 rounded-full border border-gray-200 items-center justify-center ${pageIndex >= pages - 1 ? "opacity-30" : ""}`}
                  accessibilityLabel="Halaman berikutnya"
                >
                  <ChevronRight size={16} color="#374151" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}
