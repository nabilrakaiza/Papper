import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { CATEGORIES } from "../../../data/menu";
import { CustomItemDraft, MenuCategory, OrderItem } from "../../../types/order";
import ConfirmDialog from "@/components/ConfirmDialog";
import PinOverrideModal from "@/components/PinOverrideModal";
import { CustomItemSheet, CustomItemList } from "@/components/CustomItemSheet";
import {
  amountCollected,
  defaultPayerLabel,
  payerNumbers,
} from "../../../lib/splitBill";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

/**
 * Key for `quantities` and `notes`: one entry per dish PER PAYER.
 *
 * Keyed by menu id alone, this screen showed "Kopi 4" for a split bill where
 * two people were holding two each — so reducing to 3 had to take one from
 * somebody, and the cashier was never shown the choice. Adding an item was
 * worse: it always landed on payer 1, with no way to charge anyone else.
 */
const qKey = (menuId: number, payer: number) => `${menuId}:${payer}`;

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, menu, updateOrder, cancelOrderWithPin } = useOrders();
  const order = orders.find((o) => o.id === Number(id));
  // A fixed 240px review panel is most of a landscape phone's height, so cap it
  // against the current viewport instead.
  const { height: windowHeight } = useWindowDimensions();
  const summaryMaxHeight = Math.min(240, windowHeight * 0.35);

  const [categoryIndex, setCategoryIndex] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // `quantities` and `notes` are keyed by menu id and payer, so custom off-menu
  // items — which have no menu id — are tracked separately in `customItems` and
  // merged back in at save time.
  //
  // Which payer the +/- buttons and the custom-item sheet are acting on. Only
  // ever shown when the bill is split; on every other order there is one payer
  // and this stays 1, which is exactly how the screen behaved before.
  const [activePayer, setActivePayer] = useState(1);

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const items = order?.items ?? [];
    return items.reduce((acc, item) => {
      if (item.menuId == null) return acc;
      const k = qKey(item.menuId, item.customerNum ?? 1);
      acc[k] = (acc[k] ?? 0) + item.quantity;
      return acc;
    }, {} as Record<string, number>);
  });

  // Per payer too. It was keyed by menu id, so two people ordering the same
  // dish with different notes kept only whichever row was read last.
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (order?.items ?? [])
        .filter((i) => i.menuId != null)
        .map((i) => [qKey(i.menuId as number, i.customerNum ?? 1), i.note || ""])
    )
  );

  // The custom rows already on the order, captured once so an edited draft can
  // be matched back to the row it came from (and keep its print batch).
  const [existingCustomRows] = useState<OrderItem[]>(() =>
    (order?.items ?? []).filter((i) => i.menuId == null)
  );

  const [customItems, setCustomItems] = useState<CustomItemDraft[]>(() =>
    (order?.items ?? [])
      .filter((i) => i.menuId == null)
      .map((i, idx) => ({
        uid: `existing-${idx}`,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        note: i.note ?? "",
        customerNum: i.customerNum ?? 1,
      }))
  );

  const [customSheetOpen, setCustomSheetOpen] = useState(false);

  const increment = useCallback((menuId: number, payer: number) => {
    const k = qKey(menuId, payer);
    setQuantities((prev) => ({ ...prev, [k]: (prev[k] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((menuId: number, payer: number) => {
    const k = qKey(menuId, payer);
    setQuantities((prev) => {
      const current = prev[k] ?? 0;
      if (current <= 0) return prev;
      if (current - 1 === 0) {
        setNotes((prevNotes) => {
          const newNotes = { ...prevNotes };
          delete newNotes[k];
          return newNotes;
        });
      }
      return { ...prev, [k]: current - 1 };
    });
  }, []);

  const handleNoteChange = useCallback(
    (menuId: number, payer: number, text: string) => {
      setNotes((prev) => ({ ...prev, [qKey(menuId, payer)]: text }));
    },
    []
  );

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  const currentCategory: MenuCategory = CATEGORIES[categoryIndex];
  const categoryItems = menu.filter(
    (m) => m.category === currentCategory && m.available
  );

  const currentMaxBatch = Math.max(...(order.items.map((i) => i.printBatch) ?? [1]), 1);
  const selectedItems: OrderItem[] = [];

  // Every payer on the order, including anyone who has paid but whose lines
  // have all been removed — see payerNumbers. A single-payer order gives [1]
  // and everything below reduces to what this screen always did.
  const editorPayers = payerNumbers(order);
  const isSplitOrder = editorPayers.length > 1;

  const payerLabel = (p: number) =>
    order.payments.find((x) => x.customerNum === p)?.customerLabel ||
    defaultPayerLabel(p);

  // Outer loop over payers, so each person's lines are diffed against their own
  // quantities. That is what makes "reduce Budi's coffee by one" expressible at
  // all — before, the screen saw one pooled number per dish and had to guess
  // whose row to trim.
  editorPayers.forEach((payer) => {
  menu.forEach((m) => {
    const finalQty = quantities[qKey(m.id, payer)] ?? 0;
    if (finalQty === 0) return;

    const existingEntries = order.items.filter(
      (i) => i.menuId === m.id && (i.customerNum ?? 1) === payer
    );
    const oldTotalQty = existingEntries.reduce((sum, i) => sum + i.quantity, 0);
    const currentNote = notes[qKey(m.id, payer)] || "";

    if (finalQty === oldTotalQty) {
      existingEntries.forEach((entry) => {
        selectedItems.push({ ...entry, note: entry.note });
      });
    } else if (finalQty > oldTotalQty) {
      // Refill before adding. A line that was reduced still carries the stock
      // its larger quantity consumed — stock is never returned — so putting
      // that quantity back costs nothing and must not be deducted again.
      // Appending it as a new row instead is what made reduce-then-raise take
      // the difference out of stock twice.
      //
      // It is also the right answer for the kitchen: that quantity has already
      // been made once, so restoring it needs no new ticket, and leaving it on
      // the original row leaves its print batch alone.
      let toAdd = finalQty - oldTotalQty;

      existingEntries.forEach((entry) => {
        const funded = entry.stockDeductedQty ?? 0;
        const headroom = Math.max(0, funded - entry.quantity);
        const refill = Math.min(headroom, toAdd);
        toAdd -= refill;
        selectedItems.push({
          ...entry,
          quantity: entry.quantity + refill,
          note: entry.note,
        });
      });

      // Whatever is left is genuinely new: it has never been made and has never
      // been paid for out of stock, so it opens a batch of its own.
      if (toAdd > 0) {
        selectedItems.push({
          menuId: m.id,
          name: m.name,
          price: m.price,
          quantity: toAdd,
          category: m.category,
          note: currentNote,
          isSent: false,
          isCancelled: false,
          printBatch: currentMaxBatch + 1,
          customerNum: payer,
        });
      }
    } else {
      // Ascending print batch, and this is the order things are KEPT in —
      // whatever sorts last is what gets trimmed. So a reduction comes off the
      // newest batch and the kitchen is never asked to unmake something it
      // started earlier.
      //
      // No payer tie-break is needed any more: `existingEntries` is one
      // person's rows, because the cashier picked whose coffee to reduce.
      let remainingToKeep = finalQty;
      const sortedEntries = [...existingEntries].sort(
        (a, b) => a.printBatch - b.printBatch
      );

      // Rebuilt in the original order afterwards: the payload is order-
      // insensitive, but keeping it stable keeps the review panel from
      // reshuffling under the cashier's finger mid-edit.
      const trimmed = new Map<number, OrderItem>();

      sortedEntries.forEach((entry) => {
        const keep = Math.min(entry.quantity, remainingToKeep);
        remainingToKeep -= keep;
        if (keep > 0) {
          trimmed.set(entry.id as number, { ...entry, quantity: keep, note: entry.note });
        }
      });

      existingEntries.forEach((entry) => {
        const kept = trimmed.get(entry.id as number);
        if (kept) selectedItems.push(kept);
      });
    }
  });

  });

  // Custom items, same batching rules as the menu items above: an untouched or
  // reduced line keeps its original print batch so the kitchen isn't asked to
  // remake it, while an increase is appended as a fresh batch. Anything not in
  // `customItems` any more has been removed by the cashier and is dropped.
  customItems.forEach((draft) => {
    if (draft.quantity <= 0) return;

    const originIndex = draft.uid.startsWith("existing-")
      ? Number(draft.uid.slice("existing-".length))
      : -1;
    const origin = originIndex >= 0 ? existingCustomRows[originIndex] : undefined;

    if (!origin) {
      selectedItems.push({
        menuId: null,
        name: draft.name,
        price: draft.price,
        quantity: draft.quantity,
        note: draft.note,
        isSent: false,
        isCancelled: false,
        printBatch: currentMaxBatch + 1,
        // Stamped when the sheet added it, from whoever was selected then. An
        // existing row keeps its own payer via the spread below.
        customerNum: draft.customerNum ?? 1,
      });
      return;
    }

    if (draft.quantity <= origin.quantity) {
      selectedItems.push({ ...origin, quantity: draft.quantity });
    } else {
      // Same refill-before-adding rule as the menu items above, and for the same
      // reason: quantity this line already paid for out of stock goes back onto
      // the original row rather than into a new one.
      const funded = origin.stockDeductedQty ?? 0;
      const headroom = Math.max(0, funded - origin.quantity);
      const refill = Math.min(headroom, draft.quantity - origin.quantity);

      selectedItems.push({ ...origin, quantity: origin.quantity + refill });

      const remaining = draft.quantity - origin.quantity - refill;

      if (remaining > 0) {
        selectedItems.push({
          ...origin,
          // The spread copies the row id, and this is a *new* line — the added
          // quantity in its own batch, not a change to the existing row. Leaving
          // the id on would name the same row twice in one save.
          id: undefined,
          quantity: remaining,
          isSent: false,
          stockDeductedQty: 0,
          printBatch: currentMaxBatch + 1,
        });
      }
    }
  });

  const totalItems = selectedItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // try/finally so `saving` always clears. updateOrder does not wrap itself —
  // splitBill wraps it at the call site for this reason — so a thrown request
  // here left the Simpan button disabled with no error shown and no way back
  // but force-closing the app.
  //
  // That matters more since corrections: the order being edited may be a paid
  // one that has been reopened, so a stranded editor means real money is
  // already recorded against an order now showing as unpaid, and the cashier
  // cannot save the fix.
  const handleSave = async (force = false) => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const { error, stockWarning } = await updateOrder(
        order.id,
        { items: selectedItems },
        force
      );

      if (stockWarning) {
        setStockWarning(stockWarning);
        return;
      }

      if (error) {
        setError(error);
        return;
      }

      router.back();
    } catch (e) {
      console.error("Failed to save order items:", e);
      // Not "the edit failed": save_order_items is one transaction, but the
      // request may still have reached the database before the throw. Telling
      // the cashier it failed is how the same items get added twice.
      setError(
        "Tidak yakin perubahan tersimpan — periksa koneksi, lalu muat ulang daftar pesanan sebelum menyimpan lagi."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowCancelDialog(false);
    setShowPinModal(true);
  };

  // What this order has actually taken, net of any correction that already gave
  // money back. Drives the cancellation warning: cancelling drops the order out
  // of every revenue figure while these rows stay, so the books only agree if
  // the cashier hands the money over.
  const amountTaken = amountCollected(order);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="bg-yellow-100 px-4 pt-4 pb-3 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <TouchableOpacity onPress={() => router.back()}>
              <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 flex-row items-center gap-1">
                <ChevronLeft size={16} color="#555" />
                <Text className="text-sm font-bold text-gray-700">Menu Pesanan</Text>
              </View>
            </TouchableOpacity>
            <View className="flex-row items-center gap-2">
              <Text className="text-xs font-bold text-gray-400">
                {order.customerName} · {order.seat}
              </Text>
              <TouchableOpacity
                onPress={() => setCustomSheetOpen(true)}
                className="border-2 border-green-500 bg-green-50 rounded-xl px-2.5 py-1.5"
              >
                <Text className="text-xs font-extrabold text-green-600">
                  + Kustom
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCancelDialog(true)}
                className="bg-red-100 rounded-xl px-3 py-1.5"
              >
                <Text className="text-sm font-extrabold text-red-600">X</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Who the +/- buttons are acting on. Only on a split bill — on any
              other order there is one payer and a selector would be a control
              with a single option. */}
          {isSplitOrder && (
            <View className="mb-3">
              <Text className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-1.5">
                Ubah pesanan untuk
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {editorPayers.map((p) => {
                    const active = p === activePayer;
                    const count = menu.reduce(
                      (sum, m) => sum + (quantities[qKey(m.id, p)] ?? 0),
                      0
                    );
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setActivePayer(p)}
                        className={`border-2 rounded-xl px-3 py-1.5 ${
                          active
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <Text
                          className={`text-sm font-bold ${
                            active ? "text-blue-600" : "text-gray-600"
                          }`}
                        >
                          {payerLabel(p)}
                          <Text className="text-xs font-extrabold"> · {count}</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Category selector */}
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setCategoryIndex((i) => Math.max(0, i - 1))}
              disabled={categoryIndex === 0}
            >
              <ChevronLeft size={22} color={categoryIndex === 0 ? "#ccc" : "#333"} />
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
              <View className="flex-row gap-2">
                {CATEGORIES.map((cat, idx) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategoryIndex(idx)}
                    className={`border-2 rounded-xl px-3 py-1.5 ${
                      idx === categoryIndex
                        ? "border-green-500 bg-green-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        idx === categoryIndex ? "text-green-600" : "text-gray-600"
                      }`}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={() =>
                setCategoryIndex((i) => Math.min(CATEGORIES.length - 1, i + 1))
              }
              disabled={categoryIndex === CATEGORIES.length - 1}
            >
              <ChevronRight
                size={22}
                color={categoryIndex === CATEGORIES.length - 1 ? "#ccc" : "#333"}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu items */}
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Scoped to the selected payer, like the menu cards below — a split
              bill's custom lines belong to someone in particular too. */}
          <CustomItemList
            items={customItems.filter(
              (c) => (c.customerNum ?? 1) === activePayer
            )}
            onChangeQuantity={(uid, quantity) =>
              setCustomItems((prev) =>
                prev.map((c) => (c.uid === uid ? { ...c, quantity } : c))
              )
            }
            onRemove={(uid) =>
              setCustomItems((prev) => prev.filter((c) => c.uid !== uid))
            }
          />

          {categoryItems.map((item) => {
            const qty = quantities[qKey(item.id, activePayer)] ?? 0;
            // What everyone else on the bill is holding of this dish. Shown so
            // the cashier can see the whole order without losing track of whose
            // number the +/- is about to change.
            const othersQty = editorPayers
              .filter((p) => p !== activePayer)
              .reduce((sum, p) => sum + (quantities[qKey(item.id, p)] ?? 0), 0);
            return (
              <View
                key={item.id}
                className="bg-yellow-100 rounded-2xl px-4 py-4 mb-3 shadow-sm"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-gray-900">{item.name}</Text>
                    <Text className="text-xs font-bold text-gray-400 mt-0.5">
                      {formatRupiah(item.price)}
                      {othersQty > 0 ? ` · ${othersQty} di pelanggan lain` : ""}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-3">
                    {qty > 0 && (
                      <>
                        <TouchableOpacity
                          onPress={() => decrement(item.id, activePayer)}
                        >
                          <Minus size={18} color="#555" />
                        </TouchableOpacity>
                        <Text className="text-sm font-extrabold text-gray-900 w-5 text-center">
                          {qty}
                        </Text>
                      </>
                    )}
                    <TouchableOpacity
                      onPress={() => increment(item.id, activePayer)}
                    >
                      <Plus size={18} color="#555" />
                    </TouchableOpacity>
                  </View>
                </View>

                {qty > 0 && (
                  <View className="mt-3 pt-3 border-t border-yellow-200/50">
                    <TextInput
                      className="w-full bg-white/70 rounded-xl px-3 py-2 text-xs font-bold text-gray-800"
                      placeholder={`Catatan untuk ${item.name} (opsional)`}
                      placeholderTextColor="#9ca3af"
                      value={notes[qKey(item.id, activePayer)] || ""}
                      onChangeText={(text) =>
                        handleNoteChange(item.id, activePayer, text)
                      }
                    />
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Bottom bar */}
        {totalItems > 0 && (
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            {/* Same placement as new-order.tsx: directly above the button that
                failed, rather than up in the scrolling header where it can be
                scrolled out of view. Only ever set with items selected, since
                handleSave returns early otherwise. */}
            {!!error && (
              <View className="mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
              </View>
            )}

            <View className="bg-green-400 rounded-3xl px-5 py-4 shadow-sm">
              {summaryOpen && (
                <View className="mb-3" style={{ maxHeight: summaryMaxHeight }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Grouped by payer on a split bill, with each person's own
                        subtotal. A flat list here gave no way to check the one
                        thing that matters before saving — that the right person
                        is being charged for the right thing. Ungrouped on a
                        single-payer order, where a heading would be noise. */}
                    {editorPayers.map((p) => {
                      const mine = selectedItems.filter(
                        (i) => (i.customerNum ?? 1) === p
                      );
                      if (mine.length === 0) return null;

                      const mineSubtotal = mine.reduce(
                        (sum, i) => sum + i.price * i.quantity,
                        0
                      );

                      return (
                        <View key={p} className={isSplitOrder ? "mb-3" : ""}>
                          {isSplitOrder && (
                            <View className="flex-row justify-between mb-1.5">
                              <Text className="text-[10px] font-extrabold text-white/90 uppercase tracking-widest">
                                {payerLabel(p)}
                              </Text>
                              <Text className="text-[10px] font-extrabold text-white/90">
                                {formatRupiah(mineSubtotal)}
                              </Text>
                            </View>
                          )}

                          {mine.map((item, idx) => (
                            <View
                              key={`${item.menuId ?? "custom"}-${item.printBatch}-${idx}`}
                              className="mb-2"
                            >
                              <View className="flex-row justify-between mb-0.5">
                                <Text className="text-sm font-bold text-white flex-1 pr-2">
                                  {item.quantity}x {item.name}
                                </Text>
                                <Text className="text-sm font-bold text-white">
                                  {formatRupiah(item.price * item.quantity)}
                                </Text>
                              </View>
                              {!!item.note && (
                                <Text className="text-xs font-bold text-white/80 italic">
                                  └ Catatan: {item.note}
                                </Text>
                              )}
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </ScrollView>

                  <View className="h-px bg-white/30 my-2" />

                  <View className="flex-row justify-between">
                    <Text className="text-sm font-extrabold text-white">Total</Text>
                    <Text className="text-sm font-extrabold text-white">
                      {formatRupiah(subtotal)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleSave(false)}
                    disabled={saving}
                    className="mt-3 bg-white rounded-xl py-3 items-center"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#22c55e" />
                    ) : (
                      <Text className="text-sm font-extrabold text-green-600">
                        Simpan Order
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={() => setSummaryOpen((o) => !o)}
                disabled={saving}
                className="flex-row items-center gap-2"
              >
                <View className="border-2 border-white/60 rounded-xl px-3 py-1">
                  <Text className="text-sm font-extrabold text-white">
                    {totalItems} Item
                  </Text>
                </View>
                <Text className="text-white/70 text-xs font-bold">
                  {summaryOpen ? "▼ tutup" : "▲ review & simpan"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <CustomItemSheet
          visible={customSheetOpen}
          onAdd={(item) =>
            setCustomItems((prev) => [
              ...prev,
              { ...item, customerNum: activePayer },
            ])
          }
          onClose={() => setCustomSheetOpen(false)}
        />

        {/* Stock Warning Modal */}
        {!!stockWarning && (
          <View className="absolute inset-0 bg-black/50 items-center justify-center px-6">
            <View className="bg-white rounded-3xl px-6 py-6 w-full shadow-xl">
              <Text className="text-base font-black text-gray-900 mb-2">
                ⚠️ Peringatan Stok - Stok bisa saja habis
              </Text>
              <Text className="text-sm font-bold text-gray-600 mb-5">
                {stockWarning}
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setStockWarning(null)}
                  className="flex-1 border-2 border-gray-200 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-extrabold text-gray-600">Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setStockWarning(null);
                    handleSave(true);
                  }}
                  className="flex-1 bg-yellow-400 rounded-2xl py-3 items-center"
                >
                  <Text className="text-sm font-extrabold text-gray-900">
                    Lanjutkan saja
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Cancelling an order that has already taken money is allowed, but the
            app cannot give it back — so the cashier has to. Nothing here is
            automatic: the payment rows stay exactly as they are, the order drops
            out of every revenue figure, and the two only agree if the money
            really does go back to the customer.

            Stock is not returned either, which is the standing rule everywhere
            else in this app and is said out loud here because a cancellation is
            where someone is most likely to assume otherwise. */}
        <ConfirmDialog
          visible={showCancelDialog}
          title="Batalkan Pesanan"
          message={
            amountTaken > 0
              ? `Pesanan ini sudah menerima pembayaran ${formatRupiah(amountTaken)}.\n\n` +
                "Pembatalan bisa dilakukan, tetapi semua uang harus dikembalikan ke customer secara langsung — aplikasi tidak mengembalikannya otomatis.\n\n" +
                "Stok bahan yang sudah terpakai tidak dikembalikan."
              : "Apakah anda yakin untuk menghapus order ini? aksi ini tidak bisa dibatalkan"
          }
          confirmLabel={amountTaken > 0 ? "Batalkan & Kembalikan Uang" : "Iya, Batalkan"}
          cancelLabel="Tidak"
          destructive
          onConfirm={handleCancelConfirm}
          onCancel={() => setShowCancelDialog(false)}
        />

        <PinOverrideModal
          visible={showPinModal}
          orderId={order.id}
          onSubmit={async (pin) => {
            const { success, error } = await cancelOrderWithPin(order.id, pin);
            if (!success) return { success: false, error: error ?? undefined };
            setShowPinModal(false);
            router.back();
            return { success: true };
          }}
          onClose={() => setShowPinModal(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}