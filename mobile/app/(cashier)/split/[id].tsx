import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Plus, Minus, Users, Merge } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { OrderItem } from "../../../types/order";
import { orderTotal } from "../../../lib/constants";
import { canResplit, defaultPayerLabel, isSplit, payerNumbers } from "../../../lib/splitBill";
import { itemKey } from "../../../lib/orderItems";
import ConfirmDialog from "@/components/ConfirmDialog";

const MAX_PAYERS = 8;

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

/**
 * How many units of one line item each payer is taking, keyed by row id.
 * `[2, 1]` against a row of 3 means payer 1 takes two and payer 2 takes one.
 */
type Allocation = Record<number, number[]>;

export default function SplitBillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, splitBill } = useOrders();
  const order = orders.find((o) => o.id === Number(id));

  const [payerCount, setPayerCount] = useState(() =>
    Math.max(2, order ? payerNumbers(order).length : 2)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);

  // Seeded from how the order is divided right now, so reopening the screen
  // shows the current split rather than starting from nothing.
  const [allocation, setAllocation] = useState<Allocation>(() => {
    const seed: Allocation = {};
    for (const item of order?.items ?? []) {
      if (item.id == null) continue;
      const slots = new Array(Math.max(2, payerNumbers(order!).length)).fill(0);
      slots[(item.customerNum ?? 1) - 1] = item.quantity;
      seed[item.id] = slots;
    }
    return seed;
  });

  const rows = useMemo(
    () => (order?.items ?? []).filter((i) => i.id != null),
    [order]
  );

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  // Once anyone has paid, the database freezes their lines and the division
  // they paid against has to stand. Say so here rather than letting the cashier
  // rearrange the whole screen and meet a refusal at the end of it.
  if (!canResplit(order)) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100">
        <View className="flex-row items-center px-5 pt-4 pb-3">
          <TouchableOpacity onPress={() => router.back()}>
            <ChevronLeft size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-base font-black text-gray-700 text-center mb-2">
            Tagihan sudah terbagi
          </Text>
          <Text className="text-sm font-bold text-gray-400 text-center">
            Ada pelanggan yang sudah membayar, jadi pembagiannya tidak bisa
            diubah lagi. Lanjutkan pembayaran untuk pelanggan yang tersisa.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-6 bg-green-400 rounded-2xl px-6 py-3"
          >
            <Text className="text-sm font-extrabold text-white">
              Kembali ke Pembayaran
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const slotsFor = (item: OrderItem): number[] => {
    const existing = allocation[item.id!] ?? [];
    const padded = [...existing];
    while (padded.length < payerCount) padded.push(0);
    return padded.slice(0, payerCount);
  };

  const assignedOf = (item: OrderItem) =>
    slotsFor(item).reduce((sum, n) => sum + n, 0);

  const unassignedOf = (item: OrderItem) => item.quantity - assignedOf(item);

  const move = (item: OrderItem, payerIndex: number, delta: number) => {
    setAllocation((prev) => {
      const slots = slotsFor(item);
      const next = [...slots];
      const target = next[payerIndex] + delta;

      if (target < 0) return prev;
      if (delta > 0 && unassignedOf(item) <= 0) return prev;

      next[payerIndex] = target;
      return { ...prev, [item.id!]: next };
    });
  };

  // Reducing the payer count would strand whatever was assigned to the payers
  // that disappear, so push it back into the unassigned pool rather than
  // silently dropping it.
  const changePayerCount = (next: number) => {
    if (next < 2 || next > MAX_PAYERS) return;
    setAllocation((prev) => {
      const trimmed: Allocation = {};
      for (const [rowId, slots] of Object.entries(prev)) {
        trimmed[Number(rowId)] = slots.slice(0, next);
      }
      return trimmed;
    });
    setPayerCount(next);
  };

  const payerSubtotal = (payerIndex: number) =>
    rows.reduce(
      (sum, item) => sum + item.price * (slotsFor(item)[payerIndex] ?? 0),
      0
    );

  const totalUnassigned = rows.reduce((sum, i) => sum + unassignedOf(i), 0);
  const emptyPayers = Array.from({ length: payerCount }, (_, i) => i).filter(
    (i) => rows.every((item) => (slotsFor(item)[i] ?? 0) === 0)
  );

  const canConfirm = totalUnassigned === 0 && emptyPayers.length === 0;

  /**
   * Turn the allocation into the order's new item set.
   *
   * The first payer taking a share of a row keeps that row — its id, its print
   * batch, its sent flag — and the others get new rows carrying the same
   * details.
   *
   * The funded quantity is divided between the parts rather than copied onto
   * each of them. These are the same portions of food, already taken out of the
   * store, so a split must never present them to the stock RPC as new — but
   * copying the whole figure onto every part would claim stock had funded more
   * than it did, and the next edit would read that as headroom it does not have.
   *
   * The division hands each part as much as its own quantity and no more, then
   * puts any remainder on the first part. A remainder is what a reduced line
   * looks like: funded 5, quantity 2. Dropping it would quietly forget stock
   * that genuinely left the store.
   */
  const buildItems = (): OrderItem[] => {
    const next: OrderItem[] = [];

    for (const item of rows) {
      const slots = slotsFor(item);
      let reusedOriginal = false;
      let fundedLeft = item.stockDeductedQty ?? 0;
      let firstIndex = -1;

      slots.forEach((qty, payerIndex) => {
        if (qty <= 0) return;

        const funded = Math.min(qty, fundedLeft);
        fundedLeft -= funded;

        if (!reusedOriginal) {
          reusedOriginal = true;
          firstIndex = next.length;
          next.push({
            ...item,
            quantity: qty,
            stockDeductedQty: funded,
            customerNum: payerIndex + 1,
          });
          return;
        }

        next.push({
          ...item,
          id: undefined,
          quantity: qty,
          stockDeductedQty: funded,
          customerNum: payerIndex + 1,
        });
      });

      if (fundedLeft > 0 && firstIndex >= 0) {
        next[firstIndex] = {
          ...next[firstIndex],
          stockDeductedQty: (next[firstIndex].stockDeductedQty ?? 0) + fundedLeft,
        };
      }
    }

    return next;
  };

  /**
   * Put the bill back together: every line on payer 1.
   *
   * Rows that were carved apart are recombined as well, not just retagged.
   * Splitting 2x Kopi one each leaves two rows of one, and merging without
   * this would leave them that way — screens group by item so it would look
   * right, but a kitchen reprint would list "1x Kopi" twice instead of once
   * for two.
   *
   * Only rows that agree on everything a merged row can carry are combined:
   * the print batch, whether it was sent, and the note.
   *
   * The funded quantity is no longer part of that agreement, because it is a
   * quantity and adds up — a row funded 3 and a row funded 0 merge into one
   * funded 3, which is exactly true. It used to be a boolean, and a boolean
   * cannot hold two different answers to "have these ingredients already left
   * the store", so rows that disagreed could not be merged at all.
   *
   * The row that absorbs the others keeps its id; the others are simply absent
   * from the payload, which is how save_order_items is told to delete them.
   */
  const buildMergedItems = (): OrderItem[] => {
    const merged = new Map<string, OrderItem>();

    for (const item of rows) {
      const key = [
        itemKey(item),
        item.printBatch,
        item.isSent,
        item.note ?? "",
      ].join("|");

      const existing = merged.get(key);

      if (existing) {
        existing.quantity += item.quantity;
        existing.stockDeductedQty =
          (existing.stockDeductedQty ?? 0) + (item.stockDeductedQty ?? 0);
      } else {
        merged.set(key, { ...item, customerNum: 1 });
      }
    }

    return [...merged.values()];
  };

  const handleMerge = async () => {
    setMerging(false);
    setSaving(true);
    setError(null);

    try {
      const { error: saveError } = await splitBill(order.id, buildMergedItems());

      if (saveError) {
        setError(saveError);
        return;
      }

      router.back();
    } catch (e) {
      console.error("Failed to merge bill:", e);
      setError("Terjadi kesalahan. Periksa koneksi Anda.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(false);
    setSaving(true);
    setError(null);

    // try/finally so `saving` is cleared on every exit, including the ones
    // nobody planned for. The button is disabled while it is set, so a single
    // throw on the way out leaves a dead button with a spinner on it and no
    // error, and the only way back is force-closing the app — the same failure
    // the print path documents at index.tsx.
    try {
      const { error: saveError } = await splitBill(order.id, buildItems());

      if (saveError) {
        setError(saveError);
        return;
      }

      router.back();
    } catch (e) {
      console.error("Failed to split bill:", e);
      setError("Terjadi kesalahan. Periksa koneksi Anda.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Split Bill</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 160,
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="bg-green-400 rounded-2xl px-4 py-3 mb-4 self-start shadow shadow-green-600/30">
          <Text className="text-sm font-bold text-white">
            Nama Pelanggan : {order.customerName}
          </Text>
          <Text className="text-sm font-bold text-white">
            Tempat Duduk{"    "}: {order.seat}
          </Text>
        </View>

        {/* How many people are paying */}
        <View className="bg-white rounded-3xl px-5 py-4 shadow-sm mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Users size={18} color="#555" />
              <Text className="text-sm font-bold text-gray-700">
                Jumlah Pembayar
              </Text>
            </View>

            <View className="flex-row items-center gap-4">
              <TouchableOpacity
                onPress={() => changePayerCount(payerCount - 1)}
                disabled={payerCount <= 2 || saving}
              >
                <Minus size={20} color={payerCount <= 2 ? "#ddd" : "#555"} />
              </TouchableOpacity>
              <Text className="text-base font-black text-gray-900 w-6 text-center">
                {payerCount}
              </Text>
              <TouchableOpacity
                onPress={() => changePayerCount(payerCount + 1)}
                disabled={payerCount >= MAX_PAYERS || saving}
              >
                <Plus
                  size={20}
                  color={payerCount >= MAX_PAYERS ? "#ddd" : "#555"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Only offered on an order that is actually divided, and only while
            nobody has paid — canResplit already gates this whole screen, but
            the button is the thing a cashier reaches for by mistake. */}
        {isSplit(order) && (
          <TouchableOpacity
            onPress={() => setMerging(true)}
            disabled={saving}
            className={`flex-row items-center justify-center gap-2 rounded-2xl py-3 mb-4 border-2 ${
              saving ? "border-gray-200 bg-gray-100" : "border-gray-300 bg-white"
            }`}
          >
            <Merge size={15} color={saving ? "#bbb" : "#555"} />
            <Text
              className={`text-sm font-extrabold ${
                saving ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Gabungkan Kembali
            </Text>
          </TouchableOpacity>
        )}

        {/* Item allocation */}
        {rows.map((item) => {
          const slots = slotsFor(item);
          const left = unassignedOf(item);

          return (
            <View
              key={item.id}
              className={`rounded-2xl px-4 py-4 mb-3 shadow-sm ${
                left > 0 ? "bg-amber-50 border-2 border-amber-200" : "bg-yellow-100"
              }`}
            >
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-900">
                    {item.name}
                  </Text>
                  <Text className="text-xs font-bold text-gray-400 mt-0.5">
                    {formatRupiah(item.price)} x {item.quantity}
                  </Text>
                </View>
                {left > 0 && (
                  <View className="bg-amber-200 rounded-lg px-2 py-1">
                    <Text className="text-[10px] font-extrabold text-amber-800">
                      {left} belum dibagi
                    </Text>
                  </View>
                )}
              </View>

              <View className="flex-row flex-wrap gap-2">
                {slots.map((qty, payerIndex) => (
                  <View
                    key={payerIndex}
                    className={`flex-row items-center gap-2 rounded-xl px-2.5 py-1.5 ${
                      qty > 0 ? "bg-white" : "bg-white/50"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-extrabold ${
                        qty > 0 ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      P{payerIndex + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => move(item, payerIndex, -1)}
                      disabled={qty <= 0 || saving}
                      hitSlop={8}
                    >
                      <Minus size={14} color={qty <= 0 ? "#ddd" : "#555"} />
                    </TouchableOpacity>
                    <Text className="text-sm font-extrabold text-gray-900 w-5 text-center">
                      {qty}
                    </Text>
                    <TouchableOpacity
                      onPress={() => move(item, payerIndex, 1)}
                      disabled={left <= 0 || saving}
                      hitSlop={8}
                    >
                      <Plus size={14} color={left <= 0 ? "#ddd" : "#555"} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {/* Per-payer totals. Each rounds on its own, through the same formula
            the receipt and the reports use, so what is shown here is what will
            be charged and printed. */}
        <View className="bg-white rounded-3xl px-5 py-4 shadow-sm mt-1">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-3 bg-gray-50">
            <Text className="text-sm font-bold text-gray-700">Rincian per Pembayar</Text>
          </View>

          {Array.from({ length: payerCount }, (_, i) => {
            const subtotal = payerSubtotal(i);
            return (
              <View key={i} className="flex-row justify-between items-center mb-2">
                <Text
                  className={`text-sm font-bold ${
                    subtotal === 0 ? "text-red-400" : "text-gray-700"
                  }`}
                >
                  {defaultPayerLabel(i + 1)}
                  {subtotal === 0 ? " — kosong" : ""}
                </Text>
                <Text className="text-sm font-extrabold text-gray-900">
                  {formatRupiah(orderTotal(subtotal, order.discount))}
                </Text>
              </View>
            );
          })}

          <Text className="text-[10px] font-bold text-gray-400 mt-1">
            Sudah termasuk pajak{order.discount > 0 ? ` dan diskon ${order.discount}%` : ""}.
          </Text>
        </View>

        {!!error && (
          <View className="mt-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">
              {error}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Confirm */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 items-center">
        {!canConfirm && (
          <View
            style={{ width: "100%", maxWidth: 640 }}
            className="mb-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5"
          >
            <Text className="text-xs font-bold text-amber-700 text-center">
              {totalUnassigned > 0
                ? `${totalUnassigned} item belum dibagi ke pembayar manapun.`
                : `Pembayar ${emptyPayers
                    .map((i) => i + 1)
                    .join(", ")} belum kebagian item.`}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => setConfirming(true)}
          disabled={!canConfirm || saving}
          style={{ width: "100%", maxWidth: 640 }}
          className={`rounded-2xl py-4 items-center shadow ${
            !canConfirm || saving
              ? "bg-gray-400 shadow-gray-400/30"
              : "bg-green-400 shadow-green-600/30"
          }`}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm font-extrabold text-white">
              Bagi Tagihan
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={merging}
        title="Gabungkan Kembali"
        message="Semua item kembali jadi satu tagihan untuk satu pembayar. Pembagian yang sekarang akan hilang."
        confirmLabel="Gabungkan"
        cancelLabel="Batal"
        onConfirm={handleMerge}
        onCancel={() => setMerging(false)}
      />

      <ConfirmDialog
        visible={confirming}
        title="Bagi Tagihan"
        message={`Tagihan akan dibagi untuk ${payerCount} pembayar. Setelah ada yang membayar, pembagian ini tidak bisa diubah lagi.`}
        confirmLabel="Bagi Sekarang"
        cancelLabel="Batal"
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </SafeAreaView>
  );
}
