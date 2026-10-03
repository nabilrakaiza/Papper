// Opening an order to change it, from whichever screen it was found on.
//
// The order list and the order detail screen both offer it, and both have to
// stop the cashier at the same points: an edit that would strand the newest
// kitchen batch, an edit the per-payer lock will refuse, and a correction that
// needs the superadmin's PIN. One copy here, so the two cannot drift apart.
import { useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { router } from "expo-router";
import { useOrders } from "../context/OrderContext";
import { Order } from "../types/order";
import { unprintedLatestBatch } from "../lib/receiptLayout";
import BatchWarningDialog from "../components/BatchWarningDialog";
import PinOverrideModal from "../components/PinOverrideModal";

export function useOrderActions() {
  const { reopenOrderWithPin } = useOrders();

  // Set when opening an order to edit would strand the newest batch.
  const [unprintedEditOrder, setUnprintedEditOrder] = useState<Order | null>(null);

  // Set when an order has a payer who has already settled, so its lines are no
  // longer freely editable.
  const [partiallyPaidEditOrder, setPartiallyPaidEditOrder] = useState<Order | null>(null);

  // The paid order a cashier is asking to reopen, held while the manager PIN is
  // entered. Null closes the modal.
  const [correctingOrder, setCorrectingOrder] = useState<Order | null>(null);

  const openOrderEditor = (order: Order) => router.push(`/(cashier)/order/${order.id}`);

  // Adding items creates a batch above the current one, and a kitchen ticket
  // only ever covers the newest batch — so anything still unprinted here would
  // be stranded the moment the cashier saves. This is the point where the
  // mistake can still be prevented rather than merely reported.
  const edit = (order: Order) => {
    // Someone on this order has already paid, which freezes their lines in the
    // database. An edit could still succeed against the payers who haven't —
    // but a line added here lands on payer 1 by default, and if payer 1 is one
    // of the settled ones the save is refused halfway through the editor, after
    // the cashier has done the work. Say it here instead.
    //
    // Only the current round counts. A corrected order still carries the rows
    // recording what was originally paid, and matching on those would refuse to
    // open the editor for the correction the cashier was just given a PIN for.
    if (order.payments.some((p) => p.reopenSeq === order.reopenSeq)) {
      setPartiallyPaidEditOrder(order);
      return;
    }

    if (unprintedLatestBatch(order).length > 0) {
      setUnprintedEditOrder(order);
      return;
    }
    openOrderEditor(order);
  };

  // Reopening is gated in the database, not here — the PIN modal is where the
  // superadmin's approval is actually collected and checked. It has no date
  // limit: an order from any day can be corrected.
  const correct = (order: Order) => setCorrectingOrder(order);

  const dialogs = (
    <>
      {/* Adding items would strand the newest batch — prevent it here. */}
      <BatchWarningDialog
        order={unprintedEditOrder}
        title="Tambahan terakhir belum dicetak"
        body="Kalau menambah pesanan sekarang, item berikut tidak akan pernah masuk struk dapur:"
        items={unprintedEditOrder ? unprintedLatestBatch(unprintedEditOrder) : []}
        hint="Cetak struk dapur dulu, lalu tambah pesanannya."
        confirmLabel="Tetap tambah"
        onCancel={() => setUnprintedEditOrder(null)}
        onConfirm={(order) => {
          setUnprintedEditOrder(null);
          openOrderEditor(order);
        }}
      />

      {/* Part of this bill is already settled, so its lines are no longer ours
          to rearrange. Unlike the batch warnings there is no "carry on anyway"
          — the database refuses it, so offering the choice would be a lie. */}
      <Modal
        visible={partiallyPaidEditOrder !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPartiallyPaidEditOrder(null)}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-8">
          <View className="w-full bg-white rounded-3xl px-6 py-5">
            <Text className="text-base font-extrabold text-gray-700">
              Sebagian tagihan sudah dibayar
            </Text>
            <Text className="text-xs font-bold text-gray-400 mt-2">
              {partiallyPaidEditOrder?.payments.filter(
                (p) => p.reopenSeq === partiallyPaidEditOrder.reopenSeq
              ).length ?? 0}{" "}
              pelanggan sudah
              membayar bagiannya, jadi pesanan ini tidak bisa diubah lagi.
              Selesaikan pembayaran yang tersisa dulu.
            </Text>
            <TouchableOpacity
              onPress={() => setPartiallyPaidEditOrder(null)}
              className="bg-gray-100 rounded-2xl py-3 items-center mt-5"
            >
              <Text className="text-sm font-extrabold text-gray-500">Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reopening a settled bill. The PIN is checked in the database by
          reopen_order_with_pin, which is also what writes the audit row naming
          the superadmin who approved it — nothing here is trusted. */}
      {correctingOrder && (
        <PinOverrideModal
          visible
          orderId={correctingOrder.id}
          title="Koreksi Pesanan"
          message="Masukkan PIN manager untuk membuka pesanan ini"
          onSubmit={async (pin) => {
            const { success, error } = await reopenOrderWithPin(correctingOrder.id, pin);
            if (!success) return { success: false, error: error ?? undefined };

            // Straight into the editor: reopening on its own achieves nothing,
            // and an order sitting open with money already taken against it is
            // the one state nobody should be left holding by accident.
            const id = correctingOrder.id;
            setCorrectingOrder(null);
            router.push(`/(cashier)/order/${id}`);
            return { success: true };
          }}
          onClose={() => setCorrectingOrder(null)}
        />
      )}
    </>
  );

  return { edit, correct, dialogs };
}
