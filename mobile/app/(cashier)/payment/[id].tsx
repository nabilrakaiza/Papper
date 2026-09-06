import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Users, Pencil, Check, Printer } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { TAX_RATE, orderTotal } from "../../../lib/constants";
import { groupItems } from "../../../lib/orderItems";
import { unprintedLatestBatch } from "../../../lib/receiptLayout";
import {
  amountCollected,
  canResplit,
  defaultPayerLabel,
  isSplit,
  itemsForPayer,
  paymentFor,
  payerNumbers,
  payerTotal,
  unpaidPayers,
} from "../../../lib/splitBill";
import { useReceiptPrinter } from "../../../hooks/useReceiptPrinter";
import PrinterSelector from "../../../components/PrinterSelector";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Order } from "../../../types/order";

type PaymentMethod = "QRIS" | "Bank Transfer" | "Cash" | "Debit";

// Display-only labels (Indonesian) — the underlying values above are kept
// as-is since they're stored in the database and used for payment logic.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  QRIS: "QRIS",
  "Bank Transfer": "Transfer Bank",
  Cash: "Tunai",
  Debit: "Debit",
};

const PAYMENT_OPTIONS: PaymentMethod[] = ["QRIS", "Bank Transfer", "Debit", "Cash"];

const formatRupiahInput = (digits: string) => {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function MethodPicker({
  value,
  onChange,
  disabled,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  disabled?: boolean;
}) {
  return (
    <>
      {PAYMENT_OPTIONS.map((method) => {
        const isSelected = value === method;
        return (
          <TouchableOpacity
            key={method}
            className="flex-row items-center mb-3"
            onPress={() => onChange(method)}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <View
              className={`h-6 w-6 rounded-full border-2 items-center justify-center mr-3 ${
                isSelected ? "border-green-400" : "border-gray-300"
              }`}
            >
              {isSelected && <View className="h-3 w-3 rounded-full bg-green-400" />}
            </View>
            <Text
              className={`text-sm font-bold ${
                isSelected ? "text-gray-900" : "text-gray-500"
              }`}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

/**
 * One payer's share, on a split bill.
 *
 * Collapses to a summary once they have paid — their line items are frozen in
 * the database at that point, so there is nothing left here to change.
 */
function PayerCard({
  order,
  customerNum,
  discountPct,
  busy,
  onPay,
  onReprint,
}: {
  order: Order;
  customerNum: number;
  discountPct: number;
  busy: boolean;
  onPay: (args: {
    customerNum: number;
    label: string;
    method: PaymentMethod;
    amount: number;
    tendered: number | null;
  }) => void;
  onReprint: (customerNum: number) => void;
}) {
  const paid = paymentFor(order, customerNum);
  const total = payerTotal(order, customerNum, discountPct);
  const items = groupItems(itemsForPayer(order, customerNum));

  const [label, setLabel] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState("");

  const cashGiven = parseInt(tendered, 10) || 0;
  const changeDue = cashGiven - total;

  if (paid) {
    return (
      <View className="bg-green-500 rounded-3xl px-5 py-4 mb-3 shadow shadow-green-600/30">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Check size={16} color="white" />
            <Text className="text-sm font-extrabold text-white">
              {paid.customerLabel || defaultPayerLabel(customerNum)}
            </Text>
          </View>
          <Text className="text-sm font-extrabold text-white">
            {formatRupiah(paid.amount)}
          </Text>
        </View>

        <Text className="text-xs font-bold text-white/70 mt-1">
          {PAYMENT_METHOD_LABELS[paid.methodOfPayment as PaymentMethod] ??
            paid.methodOfPayment}
          {paid.methodOfPayment === "Cash" && paid.amountTendered != null
            ? ` · bayar ${formatRupiah(paid.amountTendered)} · kembali ${formatRupiah(
                paid.amountTendered - paid.amount
              )}`
            : ""}
        </Text>

        <TouchableOpacity
          onPress={() => onReprint(customerNum)}
          disabled={busy}
          className="flex-row items-center gap-1.5 self-start mt-3 bg-white/20 rounded-xl px-3 py-1.5"
        >
          <Printer size={13} color="white" />
          <Text className="text-xs font-extrabold text-white">Cetak Ulang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handlePay = () => {
    setError("");

    if (method === "Cash" && changeDue < 0) {
      setError(`Pembayaran kurang dari total. Butuh ${formatRupiah(-changeDue)} lagi.`);
      return;
    }

    onPay({
      customerNum,
      label: label.trim() || defaultPayerLabel(customerNum),
      method,
      amount: total,
      tendered: method === "Cash" ? cashGiven : null,
    });
  };

  return (
    <View className="bg-white rounded-3xl px-5 py-5 mb-3 shadow-sm">
      <View className="flex-row items-center justify-between mb-3">
        <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-gray-50">
          <Text className="text-sm font-bold text-gray-700">
            {defaultPayerLabel(customerNum)}
          </Text>
        </View>
        <Text className="text-base font-black text-gray-900">
          {formatRupiah(total)}
        </Text>
      </View>

      <TextInput
        className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 mb-3"
        placeholder="Nama (opsional, untuk struk)"
        placeholderTextColor="#9ca3af"
        value={label}
        onChangeText={setLabel}
        editable={!busy}
      />

      {items.map((item) => (
        <View key={item.key} className="flex-row justify-between mb-1.5">
          <Text className="text-xs font-bold text-gray-500 flex-1 pr-2">
            {item.quantity}x {item.name}
          </Text>
          <Text className="text-xs font-bold text-gray-500">
            {formatRupiah(item.price * item.quantity)}
          </Text>
        </View>
      ))}

      <View className="h-px bg-gray-100 my-3" />

      <MethodPicker value={method} onChange={setMethod} disabled={busy} />

      {method === "Cash" && (
        <View className="mb-2">
          <Text className="text-sm font-bold text-gray-700 mb-2">
            Jumlah Pembayaran
          </Text>
          <TextInput
            className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50"
            placeholder="0"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            value={tendered ? `Rp ${formatRupiahInput(tendered)}` : ""}
            onChangeText={(text) => setTendered(text.replace(/[^0-9]/g, ""))}
            editable={!busy}
          />
          {!!tendered && (
            <Text
              className={`text-xs font-bold mt-2 ${
                changeDue < 0 ? "text-red-500" : "text-gray-500"
              }`}
            >
              {changeDue < 0
                ? `Kurang ${formatRupiah(-changeDue)}`
                : `Kembalian ${formatRupiah(changeDue)}`}
            </Text>
          )}
        </View>
      )}

      {!!error && (
        <View className="mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-2.5">
          <Text className="text-xs font-bold text-red-500 text-center">{error}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handlePay}
        disabled={busy}
        className={`rounded-2xl py-3 items-center ${
          busy ? "bg-gray-300" : "bg-green-400"
        }`}
      >
        <Text className="text-sm font-extrabold text-white">
          Bayar &amp; Cetak Struk
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, markPaid, recordPayment, completeSplitPayment, updateOrder } =
    useOrders();
  const order = orders.find((o) => o.id === Number(id));

  const [discount, setDiscount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [methodOfPayment, setMethodOfPayment] = useState<PaymentMethod>("Cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [editWarning, setEditWarning] = useState(false);

  const {
    printing,
    printError,
    setPrintError,
    selectorVisible,
    setSelectorVisible,
    printCustomerReceipt,
    handlePrinterConnected,
  } = useReceiptPrinter();

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
        <Text className="text-gray-400 font-bold">Order tidak ditemukan</Text>
      </SafeAreaView>
    );
  }

  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discountPct = parseFloat(discount) || 0;

  // Prevent discount from exceeding 100% or dropping below 0%
  const safeDiscountPct = Math.min(Math.max(0, discountPct), 100);

  const split = isSplit(order);
  const collected = amountCollected(order);
  const stillOwed = unpaidPayers(order);

  // Once someone has paid, the discount they were charged against is fixed —
  // changing it now would mean earlier payers settled on a different basis than
  // the ones still to pay. From that point the saved figure is the only one
  // that counts, and the field is closed.
  const discountLocked = order.payments.length > 0;
  const effectiveDiscount = discountLocked ? order.discount : safeDiscountPct;

  // Shared with every report and the receipt, so what the cashier is shown here
  // is exactly what the books will say later.
  const total = orderTotal(subtotal, effectiveDiscount);

  const cashGiven = parseInt(paymentAmount, 10) || 0;
  const changeDue = cashGiven - total;

  const busy = saving || printing;

  const handleConfirm = async () => {
    setError("");

    if (methodOfPayment === "Cash" && changeDue < 0) {
      setError(
        `Pembayaran kurang dari total. Butuh ${formatRupiah(-changeDue)} lagi.`
      );
      return;
    }

    setSaving(true);

    try {
      // Both branches used to declare their own block-scoped `error`, so the
      // check below silently read the `error` state instead of the result of
      // markPaid. A second attempt after a "kurang" error therefore paid the
      // order, then re-showed the stale message and never navigated back.
      //
      // The non-cash branch also recorded orderTotal(order), which recomputes
      // from the *saved* discount and so ignored whatever was typed here.
      const { error: saveError } = await markPaid(
        order.id,
        safeDiscountPct,
        methodOfPayment,
        methodOfPayment === "Cash" ? cashGiven : total
      );

      if (saveError) {
        setError(saveError);
        return;
      }

      router.back();
    } catch (e) {
      console.error("Failed to confirm payment:", e);
      setError(
        "Tidak yakin pembayaran tercatat — periksa koneksi, lalu muat ulang daftar pesanan sebelum menagih lagi."
      );
    } finally {
      // Cleared on the success path too. It used to be left set and carried out
      // by the navigation, which works right up until the screen is still
      // mounted when something throws.
      setSaving(false);
    }
  };

  /**
   * Record one payer's share, then print it.
   *
   * The discount is persisted before the first payment lands, because from that
   * moment it is frozen and every remaining share is computed from the saved
   * figure rather than from whatever is still typed on this screen.
   */
  const handlePayerPaid = async (args: {
    customerNum: number;
    label: string;
    method: PaymentMethod;
    amount: number;
    tendered: number | null;
  }) => {
    setError("");
    setSaving(true);

    // try/finally so `saving` always clears: every button on this screen is
    // disabled while it is set, so one throw on the way out strands the whole
    // payment screen mid-transaction with no error and no way back but force-
    // closing the app.
    let payment;

    try {
      if (!discountLocked && safeDiscountPct !== order.discount) {
        const { error: discountError } = await updateOrder(
          order.id,
          { discount: safeDiscountPct },
          true
        );

        if (discountError) {
          setError(discountError);
          return;
        }
      }

      const { error: payError, payment: recorded } = await recordPayment(order.id, {
        customerNum: args.customerNum,
        customerLabel: args.label,
        amount: args.amount,
        amountTendered: args.tendered,
        methodOfPayment: args.method,
      });

      if (payError) {
        setError(payError);
        return;
      }

      payment = recorded;
    } catch (e) {
      console.error("Failed to take payment:", e);
      // Same care as recordPayment's own catch: not "it failed", because the
      // write may have landed before the throw. A cashier told the payment
      // failed takes the money again.
      setError(
        "Tidak yakin pembayaran tercatat — periksa koneksi, lalu muat ulang daftar pesanan sebelum menagih lagi."
      );
      return;
    } finally {
      setSaving(false);
    }

    // Printed from the row that was just written, not from `orders` — that is
    // still the pre-refetch array inside this closure, so looking the payment
    // up there would find nothing and the receipt would silently never print.
    // The order's own items are unaffected by a payment, so the copy in hand is
    // the right one to filter.
    //
    // A print failure is surfaced on its own: the money is recorded either way,
    // and reporting the payment as failed would have the cashier take it twice.
    if (payment) await printCustomerReceipt(order, payment);
  };

  const printShare = async (customerNum: number) => {
    const payment = paymentFor(order, customerNum);
    if (!payment) return;
    await printCustomerReceipt(order, payment);
  };

  const handleComplete = async () => {
    setError("");
    setSaving(true);

    try {
      const { error: closeError } = await completeSplitPayment(
        order.id,
        effectiveDiscount
      );

      if (closeError) {
        setError(closeError);
        return;
      }

      router.back();
    } catch (e) {
      console.error("Failed to close split order:", e);
      setError("Terjadi kesalahan. Periksa koneksi Anda.");
    } finally {
      setSaving(false);
    }
  };

  const openEditor = () => router.push(`/(cashier)/order/${order.id}`);

  // Adding items creates a batch above the current one, and a kitchen ticket
  // only ever covers the newest batch — so anything still unprinted would be
  // stranded the moment the cashier saves. The order list guards its own edit
  // button the same way; a second door into the editor without this check would
  // quietly reopen the hole that guard was added to close.
  const handleEdit = () => {
    if (unprintedLatestBatch(order).length > 0) {
      setEditWarning(true);
      return;
    }
    openEditor();
  };

  const handleDiscountChange = (text: string) => {
    let digitsOnly = text.replace(/[^0-9]/g, "");

    // Strip leading zeros (e.g. "05" -> "5"), but allow a lone "0"
    digitsOnly = digitsOnly.replace(/^0+(?=\d)/, "");

    if (digitsOnly === "") {
      setDiscount("");
      return;
    }

    const num = parseInt(digitsOnly, 10);
    if (num > 100) {
      setDiscount("100");
    } else {
      setDiscount(digitsOnly);
    }
  };

  // Grouped by itemKey rather than menuId: custom items all carry a null menu
  // id, so keying on that would fold every unrelated one into a single row.
  const groupedItems = groupItems(order.items);

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* In landscape there is very little height left once the keyboard is up,
          and the cash amount field sits near the bottom of the scroll view. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()}>
          <ChevronLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-gray-900">Papper</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 120,
          // Keeps the column readable rather than stretching edge to edge on a
          // landscape tablet or the web build.
          width: "100%",
          maxWidth: 640,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer info */}
        <View className="bg-green-400 rounded-2xl px-4 py-3 mb-4 self-start shadow shadow-green-600/30">
          <Text className="text-sm font-bold text-white">
            Nama Pelanggan : {order.customerName}
          </Text>
          <Text className="text-sm font-bold text-white">
            Tempat Duduk{"    "}: {order.seat}
          </Text>
        </View>

        {/* Shortcuts out of this screen. Both were reachable only by going back
            to the order list first, which is two taps and a scroll away from
            the order already on screen. */}
        <View className="flex-row gap-2 mb-4">
          <TouchableOpacity
            onPress={handleEdit}
            disabled={busy || discountLocked}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border-2 ${
              busy || discountLocked
                ? "border-gray-200 bg-gray-100"
                : "border-yellow-400 bg-yellow-50"
            }`}
          >
            <Pencil size={15} color={busy || discountLocked ? "#bbb" : "#eab308"} />
            <Text
              className={`text-sm font-extrabold ${
                busy || discountLocked ? "text-gray-400" : "text-yellow-600"
              }`}
            >
              Edit Pesanan
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push(`/(cashier)/split/${order.id}`)}
            disabled={busy || !canResplit(order)}
            className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3 border-2 ${
              busy || !canResplit(order)
                ? "border-gray-200 bg-gray-100"
                : "border-blue-400 bg-blue-50"
            }`}
          >
            <Users size={15} color={busy || !canResplit(order) ? "#bbb" : "#3b82f6"} />
            <Text
              className={`text-sm font-extrabold ${
                busy || !canResplit(order) ? "text-gray-400" : "text-blue-600"
              }`}
            >
              {split ? "Ubah Pembagian" : "Split Bill"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Order summary */}
        <View className="bg-yellow-100 rounded-3xl px-5 py-5 shadow-sm">
          <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-white/60">
            <Text className="text-sm font-bold text-gray-700">Pesanan Pelanggan</Text>
          </View>

          {groupedItems.map((item) => (
            <View key={item.key} className="flex-row justify-between items-start mb-4">
              <Text className="text-sm font-bold text-gray-800 flex-1">{item.name}</Text>
              <View className="items-end">
                <Text className="text-sm font-bold text-gray-800">
                  {formatRupiah(item.price)}
                </Text>
                <Text className="text-xs font-bold text-gray-400">{item.quantity} pcs</Text>
              </View>
            </View>
          ))}

          <View className="h-px bg-yellow-200 mb-4" />

          {/* Discount */}
          <View className="flex-row items-center gap-3 mb-3">
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">Diskon</Text>
            </View>
            <TextInput
              className={`border-2 border-gray-100 rounded-xl px-3 py-1.5 font-bold text-sm w-20 text-center ${
                discountLocked ? "bg-gray-100 text-gray-400" : "bg-white text-gray-900"
              }`}
              value={discountLocked ? String(order.discount) : discount}
              onChangeText={handleDiscountChange}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#ccc"
              editable={!busy && !discountLocked}
            />
            <Text className="text-sm font-bold text-gray-500">%</Text>
          </View>

          {discountLocked && (
            <Text className="text-[10px] font-bold text-gray-400 mb-3 -mt-1">
              Terkunci — sudah ada pelanggan yang membayar dengan diskon ini.
            </Text>
          )}

          {/* Tax */}
          <View className="flex-row items-center gap-3 mb-3">
            <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">Pajak</Text>
            </View>
           <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 bg-white/60">
              <Text className="text-sm font-bold text-gray-600">{TAX_RATE * 100} %</Text>
            </View>
          </View>

          {/* Total */}
          <View className="border-2 border-gray-200 rounded-xl px-3 py-2 bg-white/60 self-start">
            <Text className="text-sm font-extrabold text-gray-800">
              Total : {formatRupiah(total)}
            </Text>
          </View>

          {split && (
            <View className="mt-3 bg-white/60 rounded-xl px-3 py-2">
              <Text className="text-xs font-bold text-gray-600">
                Terkumpul : {formatRupiah(collected)}
              </Text>
              <Text className="text-xs font-bold text-gray-600 mt-0.5">
                Sisa{"      "}: {formatRupiah(Math.max(0, total - collected))}
              </Text>
            </View>
          )}
        </View>

        {split ? (
          <View className="mt-4">
            {payerNumbers(order).map((num) => (
              <PayerCard
                key={num}
                order={order}
                customerNum={num}
                discountPct={effectiveDiscount}
                busy={busy}
                onPay={handlePayerPaid}
                onReprint={printShare}
              />
            ))}
          </View>
        ) : (
          <>
            {/* Payment Method UI */}
            <View className="bg-white rounded-3xl px-5 py-5 shadow-sm mt-4">
              <View className="border-2 border-gray-200 rounded-xl px-3 py-1.5 self-start mb-4 bg-gray-50">
                <Text className="text-sm font-bold text-gray-700">Metode Pembayaran</Text>
              </View>

              <MethodPicker
                value={methodOfPayment}
                onChange={setMethodOfPayment}
                disabled={busy}
              />
            </View>

            {/* Handle cash payment */}
            {methodOfPayment === "Cash" && (
              <View className="mt-1">
                <Text className="text-sm font-bold text-gray-700 mb-2">Jumlah Pembayaran</Text>
                <TextInput
                  className="border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-900 bg-gray-50"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={paymentAmount ? `Rp ${formatRupiahInput(paymentAmount)}` : ""}
                  onChangeText={(text) => setPaymentAmount(text.replace(/[^0-9]/g, ""))}
                  editable={!busy}
                />

                {!!paymentAmount && (
                  <Text
                    className={`text-xs font-bold mt-2 ${
                      changeDue < 0 ? "text-red-500" : "text-gray-500"
                    }`}
                  >
                    {changeDue < 0
                      ? `Kurang ${formatRupiah(-changeDue)}`
                      : `Kembalian ${formatRupiah(changeDue)}`}
                  </Text>
                )}
              </View>
            )}
          </>
        )}

        {/* Error */}
        {(!!error || !!printError) && (
          <View className="mt-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <Text className="text-xs font-bold text-red-500 text-center">
              {error || printError}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Confirm payment */}
      <View className="absolute bottom-0 left-0 right-0 px-4 pb-6 items-center">
        {split ? (
          <TouchableOpacity
            onPress={handleComplete}
            disabled={busy || stillOwed.length > 0}
            style={{ width: "100%", maxWidth: 640 }}
            className={`rounded-2xl py-4 items-center shadow ${
              busy || stillOwed.length > 0
                ? "bg-gray-400 shadow-gray-400/30"
                : "bg-green-400 shadow-green-600/30"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-sm font-extrabold text-white">
                {stillOwed.length > 0
                  ? `Menunggu ${stillOwed.length} pembayar`
                  : "Selesaikan Pembayaran"}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={busy || !methodOfPayment}
            style={{ width: "100%", maxWidth: 640 }}
            className={`rounded-2xl py-4 items-center shadow ${
              busy || !methodOfPayment ? 'bg-gray-400 shadow-gray-400/30' : 'bg-green-400 shadow-green-600/30'
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-sm font-extrabold text-white">Konfirmasi Pembayaran</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ConfirmDialog
        visible={editWarning}
        title="Ada item belum dicetak"
        message={`${
          unprintedLatestBatch(order).length
        } item di pesanan ini belum dicetak ke dapur. Kalau ditambah sekarang, item itu tidak akan ikut tercetak. Cetak dulu, atau lanjutkan kalau memang tidak perlu.`}
        confirmLabel="Lanjut Edit"
        cancelLabel="Batal"
        onConfirm={() => {
          setEditWarning(false);
          openEditor();
        }}
        onCancel={() => setEditWarning(false)}
      />

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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
