import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  // SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Printer, Check, X, RefreshCw } from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { useAuth } from "../../../context/AuthContext";
import { usePrinter } from "../../../context/PrinterContext";
import { Order } from "../../../types/order";
import ConfirmDialog from "../../../components/ConfirmDialog";
import PrinterSelector from "../../../components/PrinterSelector";
import { printReceipt } from "../../../lib/printer";

function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

function orderTotal(order: Order): number {
  const subtotal = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return subtotal * (1 - order.discount / 100);
}

type OrderCardProps = {
  order: Order;
  onCancelPress: (id: number) => void;
  onPrintPress: (order: Order) => void;
};

function OrderCard({ order, onCancelPress, onPrintPress }: OrderCardProps) {
  const isPaid = order.status === "paid";

  return (
    <TouchableOpacity
      onPress={() => {
        if (!isPaid) router.push(`/(cashier)/order/${order.id}`);
      }}
      activeOpacity={isPaid ? 1 : 0.7}
      className={`rounded-2xl px-4 py-4 mb-3 ${
        isPaid
          ? "bg-green-500 shadow shadow-green-600/30"
          : "bg-yellow-100 shadow shadow-yellow-300/20"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View
          className={`rounded-xl px-3 py-1.5 ${
            isPaid ? "bg-white/20" : "bg-white/80"
          }`}
        >
          <Text
            className={`text-sm font-bold ${isPaid ? "text-white" : "text-gray-800"}`}
          >
            Order : {order.customerName}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => onPrintPress(order)}>
            <Printer size={20} color={isPaid ? "white" : "#555"} />
          </TouchableOpacity>

          {!isPaid && (
            <>
              <TouchableOpacity
                onPress={() => router.push(`/(cashier)/payment/${order.id}`)}
              >
                <Check size={20} color="#22c55e" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onCancelPress(order.id)}>
                <X size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View className="flex-row justify-between mt-2 px-1">
        <Text
          className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}
        >
          Seat {order.seat}
        </Text>
        <Text
          className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}
        >
          {formatRupiah(orderTotal(order))}
        </Text>
      </View>

      {order.note && (
        <View className="mt-1.5 px-1">
          <Text
            className={`text-xs font-bold italic ${
              isPaid ? "text-white/60" : "text-gray-400"
            }`}
          >
            📝 {order.note}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function CashierHomeScreen() {
  const { orders, loading, error, updateOrder, refetch } = useOrders();
  const { connectedPrinter, setConnectedPrinter } = usePrinter();

  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [printerSelectorVisible, setPrinterSelectorVisible] = useState(false);
  const [pendingPrintOrder, setPendingPrintOrder] = useState<Order | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const unpaid = orders.filter((o) => o.status === "unpaid");
  const paid = orders.filter((o) => o.status === "paid");

  const handleCancel = async () => {
    if (!cancelTargetId) return;
    const { error } = await updateOrder(cancelTargetId, { status: "cancelled" });
    if (error) setCancelError(error);
    setCancelTargetId(null);
  };

  const handlePrintPress = async (order: Order) => {
    setPrintError(null);

    // No printer connected — open selector first
    if (!connectedPrinter) {
      setPendingPrintOrder(order);
      setPrinterSelectorVisible(true);
      return;
    }

    // Printer connected — print directly
    await doPrint(order);
  };

  const doPrint = async (order: Order) => {
    setPrinting(true);
    setPrintError(null);

    const { error } = await printReceipt(order);

    if (error) {
      setPrintError("Failed to print. Make sure printer is on and connected.");
    }

    setPrinting(false);
  };

  const handlePrinterConnected = async (device: { name: string; address: string }) => {
    setConnectedPrinter(device);

    // Print the pending order if there was one
    if (pendingPrintOrder) {
      await doPrint(pendingPrintOrder);
      setPendingPrintOrder(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-blue-500 text-xl font-black">✛</Text>
          <Text className="text-2xl font-black text-gray-900">Orders</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {/* Printer status indicator */}
          <TouchableOpacity
            onPress={() => setPrinterSelectorVisible(true)}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl ${
              connectedPrinter ? "bg-green-100" : "bg-gray-100"
            }`}
          >
            <Printer size={14} color={connectedPrinter ? "#22c55e" : "#aaa"} />
            <Text
              className={`text-xs font-extrabold ${
                connectedPrinter ? "text-green-600" : "text-gray-400"
              }`}
            >
              {connectedPrinter ? connectedPrinter.name : "No Printer"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banners */}
      {(error || cancelError || printError) && (
        <View className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex-row items-center justify-between">
          <Text className="text-xs font-bold text-red-500 flex-1">
            {error || cancelError || printError}
          </Text>
          <TouchableOpacity
            onPress={() => {
              refetch();
              setCancelError(null);
              setPrintError(null);
            }}
          >
            <RefreshCw size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Printing indicator */}
      {printing && (
        <View className="mx-4 mb-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#3a7bd5" />
          <Text className="text-xs font-bold text-blue-500">Printing...</Text>
        </View>
      )}

      {/* Loading */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#3a7bd5" />
          <Text className="text-gray-400 font-bold text-sm mt-3">Loading orders...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 && (
            <View className="items-center mt-24">
              <Text className="text-gray-300 font-bold text-sm">No orders yet.</Text>
            </View>
          )}
          {unpaid.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onCancelPress={setCancelTargetId}
              onPrintPress={handlePrintPress}
            />
          ))}
          {paid.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onCancelPress={setCancelTargetId}
              onPrintPress={handlePrintPress}
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
            <Text className="text-sm font-extrabold text-gray-600">Add New Order</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cancel confirm dialog */}
      <ConfirmDialog
        visible={cancelTargetId !== null}
        title="Cancel Order"
        message="Are you sure you want to cancel this order? This cannot be undone."
        confirmLabel="Yes, Cancel"
        cancelLabel="Keep"
        destructive
        onConfirm={handleCancel}
        onCancel={() => setCancelTargetId(null)}
      />

      {/* Printer selector */}
      <PrinterSelector
        visible={printerSelectorVisible}
        onClose={() => {
          setPrinterSelectorVisible(false);
          setPendingPrintOrder(null);
        }}
        onConnected={handlePrinterConnected}
      />
    </SafeAreaView>
  );
}