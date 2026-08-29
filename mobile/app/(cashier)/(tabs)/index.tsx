import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Printer, Check, RefreshCw, ChefHat, Receipt, Utensils, Pencil, UtensilsCrossed, ShoppingBag } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { usePrinter, PrinterRole } from "../../../context/PrinterContext";
import { Order, OrderItem } from "../../../types/order";
import PrinterSelector from "../../../components/PrinterSelector";
import { printReceipt } from "../../../lib/printer";
import {
  latestPrintBatch,
  unprintedEarlierItems,
  unprintedLatestBatch,
} from "../../../lib/receiptLayout";
import { useUser } from "@/hooks/useUser";
import { orderTotal as orderTotalOf } from "../../../lib/constants";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function orderTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return orderTotalOf(subtotal, order.discount);
}

type OrderCardProps = {
  order: Order;
  onPrintKitchenPress: (order: Order) => void;
  onPrintBillPress: (order: Order) => void;
  onEditPress: (order: Order) => void;
};

function useOrderTimer(createdAt: Date) {
  const [elapsedMinutes, setElapsedMinutes] = useState(
    Math.floor((Date.now() - createdAt.getTime()) / 60000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - createdAt.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return elapsedMinutes;
}

function TimerDot({ createdAt }: { createdAt: Date }) {
  const elapsed = useOrderTimer(createdAt);
  const color = elapsed < 30 ? "#22c55e" : elapsed < 60 ? "#eab308" : "#ef4444";
  const label = elapsed >= 60 ? `${Math.floor(elapsed / 60)}j ${elapsed % 60}m` : `${elapsed}m`;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6, gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 11, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}


type BatchWarningProps = {
  order: Order | null;
  title: string;
  body: string;
  items: OrderItem[];
  hint: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (order: Order) => void;
};

function BatchWarningDialog({
  order, title, body, items, hint, confirmLabel, onCancel, onConfirm,
}: BatchWarningProps) {
  return (
    <Modal visible={order !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/40 items-center justify-center px-8">
        <View className="w-full bg-white rounded-3xl px-6 py-5">
          <Text className="text-base font-extrabold text-gray-700">{title}</Text>
          <Text className="text-xs font-bold text-gray-400 mt-2">{body}</Text>

          <View className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mt-3">
            {items.map((item, idx) => (
              <Text
                key={`${item.menuId ?? "custom"}-${item.printBatch}-${idx}`}
                className="text-xs font-extrabold text-amber-700"
              >
                {item.quantity}x {item.name}
              </Text>
            ))}
          </View>

          <Text className="text-xs font-bold text-gray-400 mt-3">{hint}</Text>

          <View className="flex-row gap-3 mt-5">
            <TouchableOpacity onPress={onCancel} className="flex-1 bg-gray-100 rounded-2xl py-3 items-center">
              <Text className="text-sm font-extrabold text-gray-500">Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (order) onConfirm(order); }}
              className="flex-1 bg-orange-400 rounded-2xl py-3 items-center"
            >
              <Text className="text-sm font-extrabold text-white">{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OrderCard({ order, onPrintKitchenPress, onPrintBillPress, onEditPress }: OrderCardProps) {
  const isPaid = order.status === "paid";

  return (
    <View
      className={`rounded-2xl px-4 py-4 mb-3 ${
        isPaid
          ? "bg-green-500 shadow shadow-green-600/30"
          : "bg-yellow-100 shadow shadow-yellow-300/20"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className={`flex-row items-center rounded-xl px-3 py-1.5 ${isPaid ? "bg-white/20" : "bg-white/80"}`}>
          <Text className={`text-sm font-bold ${isPaid ? "text-white" : "text-gray-800"}`}>
            Pesanan : {order.customerName}
          </Text>
          {!isPaid && <TimerDot createdAt={order.createdAt} />}
        </View>

        <View className="flex-row items-center gap-5">
          <TouchableOpacity onPress={() => onPrintKitchenPress(order)}>
            <Utensils size={20} color="#FF6B6B" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => onPrintBillPress(order)}>
            <Receipt size={20} color={isPaid ? "green" : "#555"} />
          </TouchableOpacity>

          {!isPaid && (
            <>
              <TouchableOpacity onPress={() => onEditPress(order)}>
                <Pencil size={18} color="#eab308" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push(`/(cashier)/payment/${order.id}`)}>
                <Check size={20} color="#22c55e" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View className="flex-row items-center justify-between mt-2 px-1 gap-2">
        <View className="flex-row items-center gap-2 flex-1">
          {/* Dine-in vs takeaway drives how the order is handed over, and the
              card gave no sign of it — the two looked identical right up to
              carrying the plates out. Tinted like the name chip so it reads on
              both the paid and unpaid card. */}
          <View
            className={`flex-row items-center gap-1 rounded-lg px-2 py-0.5 ${
              isPaid ? "bg-white/20" : "bg-white/80"
            }`}
          >
            {order.isDineIn ? (
              <UtensilsCrossed size={11} color={isPaid ? "#ffffff" : "#3a7bd5"} />
            ) : (
              <ShoppingBag size={11} color={isPaid ? "#ffffff" : "#f97316"} />
            )}
            <Text
              className={`text-[10px] font-extrabold ${
                isPaid ? "text-white" : order.isDineIn ? "text-blue-600" : "text-orange-600"
              }`}
            >
              {order.isDineIn ? "Di Tempat" : "Bawa Pulang"}
            </Text>
          </View>

          <Text
            numberOfLines={1}
            className={`text-xs font-bold flex-1 ${isPaid ? "text-white/70" : "text-gray-400"}`}
          >
            Tempat Duduk: {order.seat}
          </Text>
        </View>

        <Text className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}>
          {formatRupiah(orderTotal(order))}
        </Text>
      </View>
    </View>
  );
}

export default function CashierHomeScreen() {
  const { orders, loading, error, refetch, markItemsSent } = useOrders();
  const { cashierPrinter, kitchenPrinter, setPrinter } = usePrinter();

  const [printerSelectorVisible, setPrinterSelectorVisible] = useState(false);
  const [printerSelectorRole, setPrinterSelectorRole] = useState<PrinterRole>("cashier");
  
  // Keep track of which order AND which type of print is pending
  const [pendingPrintOrder, setPendingPrintOrder] = useState<Order | null>(null);
  const [pendingPrintType, setPendingPrintType] = useState<"kitchen" | "bill" | null>(null);
  
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Set when a kitchen print would silently leave an earlier batch unprinted.
  const [skippedBatchOrder, setSkippedBatchOrder] = useState<Order | null>(null);

  // "order id:batch" for warnings the cashier has already accepted. The ticket
  // is normally printed three times in a row, for the bar, the kitchen and one
  // more station, and asking again on the second and third copy would train
  // people to dismiss it without reading. Adding a new batch produces a new key
  // and the warning comes back.
  const [acknowledgedSkips, setAcknowledgedSkips] = useState<Set<string>>(new Set());

  // Set when opening an order to edit would strand the newest batch.
  const [unprintedEditOrder, setUnprintedEditOrder] = useState<Order | null>(null);

  const openOrderEditor = (order: Order) => router.push(`/(cashier)/order/${order.id}`);

  // Adding items creates a batch above the current one, and a kitchen ticket
  // only ever covers the newest batch — so anything still unprinted here would
  // be stranded the moment the cashier saves. This is the point where the
  // mistake can still be prevented rather than merely reported.
  const handleEdit = (order: Order) => {
    if (unprintedLatestBatch(order).length > 0) {
      setUnprintedEditOrder(order);
      return;
    }
    openOrderEditor(order);
  };

  const unpaid = orders.filter((o) => o.status === "unpaid");
  const paid = orders.filter((o) => o.status === "paid");
  
  const { user, loading: userLoading } = useUser();

  // Unified handler to route to the correct printer logic
  const handlePrint = async (order: Order, type: "kitchen" | "bill") => {
    // The "Sedang mencetak" indicator is an inline banner, not a blocking
    // overlay, so nothing stopped a second tap from opening a second connection
    // to the same device mid-print — two tickets out of the printer, and
    // markItemsSent running twice.
    if (printing) return;

    setPrintError(null);

    // A kitchen ticket only ever covers the newest batch, so items added in a
    // batch that was never printed would just disappear. Ask before that
    // happens, ahead of the printer prompt so cancelling costs nothing.
    const skipKey = `${order.id}:${latestPrintBatch(order)}`;
    if (
      type === "kitchen" &&
      !acknowledgedSkips.has(skipKey) &&
      unprintedEarlierItems(order).length > 0
    ) {
      setSkippedBatchOrder(order);
      return;
    }

    await continuePrint(order, type);
  };

  const continuePrint = async (order: Order, type: "kitchen" | "bill") => {
    if (type === "kitchen" && !kitchenPrinter) {
      setPendingPrintOrder(order);
      setPendingPrintType("kitchen");
      setPrinterSelectorRole("kitchen");
      setPrinterSelectorVisible(true);
      return;
    }

    if (type === "bill" && !cashierPrinter) {
      setPendingPrintOrder(order);
      setPendingPrintType("bill");
      setPrinterSelectorRole("cashier");
      setPrinterSelectorVisible(true);
      return;
    }

    await doPrint(order, type);
  };

  const doPrint = async (order: Order, type: "kitchen" | "bill", specificPrinter?: { name: string; address: string }) => {
    // A receipt carries the cashier's name, so there is nothing to print
    // without one. This used to be expressed as `if (type === "kitchen" && user)
    // ... else if (user)`, which meant a null user matched neither branch and
    // fell out of the function having done nothing: no receipt, no error, just
    // the "Sedang mencetak" flash. Say what happened instead.
    if (!user) {
      setPrintError(
        userLoading
          ? "Memuat data pengguna, coba lagi sebentar lagi."
          : "Tidak bisa mencetak: data pengguna tidak tersedia. Coba masuk ulang."
      );
      return;
    }

    setPrinting(true);
    setPrintError(null);

    let printErr = null;

    if (type === "kitchen") {
      const targetPrinter = specificPrinter || kitchenPrinter;
      const { error } = await printReceipt(order, null, targetPrinter, user); // Passing null to cashier to prevent dual-printing
      printErr = error;

      // Mark the lines as sent once the ticket is physically printed.
      if (!error) {
        const { error: updateError } = await markItemsSent(order.id, latestPrintBatch(order));

        if (updateError) {
          // The ticket is already out of the printer, so surface the mismatch
          // rather than letting the two states diverge silently.
          printErr = "Berhasil dicetak, tetapi gagal memperbarui status 'terkirim' di sistem.";
        }
      }

    } else {
      const targetPrinter = specificPrinter || cashierPrinter;
      const { error } = await printReceipt(order, targetPrinter, null, user); // Passing null to kitchen to prevent dual-printing
      printErr = error;
    }

    if (printErr) {
      // If it's our custom string error, show that. Otherwise show the default connection error.
      setPrintError(typeof printErr === "string" ? printErr : `Gagal mencetak ${type === "kitchen" ? "dapur" : "bon"}. Pastikan printer menyala dan terhubung.`);
    }
    
    setPrinting(false);
  };

  const handlePrinterConnected = async (role: PrinterRole, device: { name: string; address: string }) => {
    setPrinter(role, device);

    // If there is a pending print, and the newly connected printer matches what we were waiting for
    if (pendingPrintOrder && pendingPrintType) {
      if (
        (pendingPrintType === "kitchen" && role === "kitchen") ||
        (pendingPrintType === "bill" && role === "cashier")
      ) {
        await doPrint(pendingPrintOrder, pendingPrintType, device);
      }
      
      setPendingPrintOrder(null);
      setPendingPrintType(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Pesanan</Text>
        </View>

        {/* Saved printers — NOT a connection status.
            
            These come from AsyncStorage and only record which printer each role
            should print to. Nothing here is connected: the Bluetooth link is
            opened at print time, in printReceipt. Styling them as a lit-up
            accent with a bare device name read as "connected to TP-806", so a
            pairing from days earlier looked live even with the printer switched
            off. Naming the role and keeping the chip neutral makes it a setting
            again, which is all it ever was.
            
            The module cannot honestly do better: isDeviceConnected() never
            settles its Promise when mService is null (the state on every cold
            start), and getConnectedDeviceAddress() returns the last address
            connected rather than a live one. */}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => { setPrinterSelectorRole("cashier"); setPrinterSelectorVisible(true); }}
            className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100"
          >
            <Printer size={13} color={cashierPrinter ? "#555" : "#bbb"} />
            <Text numberOfLines={1} className="text-xs font-extrabold text-gray-400 max-w-[104px]">
              Kasir ·{" "}
              <Text className={cashierPrinter ? "text-gray-700" : "text-gray-400"}>
                {cashierPrinter ? cashierPrinter.name : "belum diatur"}
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setPrinterSelectorRole("kitchen"); setPrinterSelectorVisible(true); }}
            className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100"
          >
            <ChefHat size={13} color={kitchenPrinter ? "#555" : "#bbb"} />
            <Text numberOfLines={1} className="text-xs font-extrabold text-gray-400 max-w-[104px]">
              Dapur ·{" "}
              <Text className={kitchenPrinter ? "text-gray-700" : "text-gray-400"}>
                {kitchenPrinter ? kitchenPrinter.name : "belum diatur"}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banners */}
      {(error || printError) && (
        <View className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-red-500 flex-1">
            {error || printError}
          </Text>
          <TouchableOpacity onPress={() => { refetch(); setPrintError(null); }}>
            <RefreshCw size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Printing indicator */}
      {printing && (
        <View className="mx-4 mb-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#3a7bd5" />
          <Text className="text-xs font-bold text-blue-500">Sedang mencetak...</Text>
        </View>
      )}

      {/* Loading */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
          <Text className="text-gray-400 font-bold text-sm mt-3">Memuat pesanan...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 && (
            <View className="items-center mt-24">
              <Text className="text-gray-300 font-bold text-sm">Belum ada pesanan.</Text>
            </View>
          )}
          {unpaid.map((o) => (
            <OrderCard 
              key={o.id} 
              order={o} 
              onPrintKitchenPress={(order) => handlePrint(order, "kitchen")}
              onPrintBillPress={(order) => handlePrint(order, "bill")}
              onEditPress={handleEdit}
            />
          ))}
          {paid.map((o) => (
            <OrderCard 
              key={o.id} 
              order={o} 
              onPrintKitchenPress={(order) => handlePrint(order, "kitchen")}
              onPrintBillPress={(order) => handlePrint(order, "bill")}
              onEditPress={handleEdit}
            />
          ))}
        </ScrollView>
      )}

      {/* Add New Order */}
      {!loading && (
        <View className="absolute bottom-6 left-4 right-4">
          <TouchableOpacity
            onPress={() => router.push("/(cashier)/new-order")}
            className="w-full bg-cyan-200 rounded-2xl py-4 items-center shadow shadow-cyan-400/20"
          >
            <Text className="text-sm font-extrabold text-gray-600">Tambah order baru</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* An earlier batch was already stranded — report it before printing. */}
      <BatchWarningDialog
        order={skippedBatchOrder}
        title="Ada tambahan yang belum dicetak"
        body="Struk dapur hanya memuat tambahan terakhir. Item berikut sudah masuk pesanan tapi tidak akan ikut tercetak:"
        items={skippedBatchOrder ? unprintedEarlierItems(skippedBatchOrder) : []}
        hint="Cetak struk dapur setiap kali menambah pesanan agar ini tidak terjadi."
        confirmLabel="Cetak saja"
        onCancel={() => setSkippedBatchOrder(null)}
        onConfirm={(order) => {
          setSkippedBatchOrder(null);
          setAcknowledgedSkips((prev) =>
            new Set(prev).add(`${order.id}:${latestPrintBatch(order)}`)
          );
          continuePrint(order, "kitchen");
        }}
      />

      {/* Printer selector */}
      <PrinterSelector
        visible={printerSelectorVisible}
        initialRole={printerSelectorRole}
        onClose={() => { 
          setPrinterSelectorVisible(false); 
          setPendingPrintOrder(null); 
          setPendingPrintType(null);
        }}
        onConnected={handlePrinterConnected}
      />
    </SafeAreaView>
  );
}