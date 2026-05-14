import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Printer, Check, RefreshCw, ChefHat, Receipt, Utensils, Pencil} from "lucide-react-native";
import { useOrders } from "../../../context/OrderContext";
import { usePrinter, PrinterRole } from "../../../context/PrinterContext";
import { Order } from "../../../types/order";
import PrinterSelector from "../../../components/PrinterSelector";
// Note: You might need to update your printReceipt function in lib/printer 
// to handle printing to just one specific printer based on the action.
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
  onPrintKitchenPress: (order: Order) => void;
  onPrintBillPress: (order: Order) => void;
};

function OrderCard({ order, onPrintKitchenPress, onPrintBillPress }: OrderCardProps) {
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
        <View className={`rounded-xl px-3 py-1.5 ${isPaid ? "bg-white/20" : "bg-white/80"}`}>
          <Text className={`text-sm font-bold ${isPaid ? "text-white" : "text-gray-800"}`}>
            Order : {order.customerName}
          </Text>
        </View>

        <View className="flex-row items-center gap-5">
          {/* Kitchen Print Action */}
          <TouchableOpacity onPress={() => onPrintKitchenPress(order)}>
            <Utensils size={20} color="#FF6B6B" /> 
          </TouchableOpacity>

          {/* Bill Print Action */}
          <TouchableOpacity onPress={() => onPrintBillPress(order)}>
            <Receipt size={20} color={isPaid ? "green" : "#555"} />
          </TouchableOpacity>
          
          {!isPaid && (
            <>
              <TouchableOpacity onPress={() => router.push(`/(cashier)/order/${order.id}`)}>
                <Pencil size={18} color="#eab308" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push(`/(cashier)/payment/${order.id}`)}>
                <Check size={20} color="#22c55e" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View className="flex-row justify-between mt-2 px-1">
        <Text className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}>
          Seat: {order.seat}
        </Text>
        <Text className={`text-xs font-bold ${isPaid ? "text-white/70" : "text-gray-400"}`}>
          {formatRupiah(orderTotal(order))}
        </Text>
      </View>
    </View>
  );
}

export default function CashierHomeScreen() {
  const { orders, loading, error, refetch, updateOrder } = useOrders();
  const { cashierPrinter, kitchenPrinter, setPrinter } = usePrinter();

  const [printerSelectorVisible, setPrinterSelectorVisible] = useState(false);
  const [printerSelectorRole, setPrinterSelectorRole] = useState<PrinterRole>("cashier");
  
  // Keep track of which order AND which type of print is pending
  const [pendingPrintOrder, setPendingPrintOrder] = useState<Order | null>(null);
  const [pendingPrintType, setPendingPrintType] = useState<"kitchen" | "bill" | null>(null);
  
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const unpaid = orders.filter((o) => o.status === "unpaid");
  const paid = orders.filter((o) => o.status === "paid");

  // Unified handler to route to the correct printer logic
  const handlePrint = async (order: Order, type: "kitchen" | "bill") => {
    setPrintError(null);

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
    setPrinting(true);
    setPrintError(null);

    let printErr = null;

    if (type === "kitchen") {
      const targetPrinter = specificPrinter || kitchenPrinter;
      const { error } = await printReceipt(order, null, targetPrinter); // Passing null to cashier to prevent dual-printing
      printErr = error;

      // --- NEW: Handle is_sent after a successful kitchen print ---
      if (!error) {
        // Create a new array with all items marked as sent
        const updatedItems = order.items.map(item => ({
          ...item,
          isSent: true 
        }));

        // Call your existing update function to sync it to Supabase
        const { error: updateError } = await updateOrder(order.id, { 
          items: updatedItems 
        });

        if (updateError) {
          // If the print worked but the DB failed, we should probably let the user know
          printErr = "Printed successfully, but failed to update 'sent' status in system.";
        }
      }
      // -------------------------------------------------------------

    } else {
      const targetPrinter = specificPrinter || cashierPrinter;
      const { error } = await printReceipt(order, targetPrinter, null); // Passing null to kitchen to prevent dual-printing
      printErr = error;
    }

    if (printErr) {
      // If it's our custom string error, show that. Otherwise show the default connection error.
      setPrintError(typeof printErr === "string" ? printErr : `Failed to print ${type}. Make sure printer is on and connected.`);
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
          <Text className="text-2xl font-black text-gray-900">Orders</Text>
        </View>

        {/* Printer status indicators */}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => { setPrinterSelectorRole("cashier"); setPrinterSelectorVisible(true); }}
            className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${
              cashierPrinter ? "bg-blue-50" : "bg-gray-100"
            }`}
          >
            <Printer size={13} color={cashierPrinter ? "#3a7bd5" : "#aaa"} />
            <Text className={`text-xs font-extrabold ${cashierPrinter ? "text-blue-500" : "text-gray-400"}`}>
              {cashierPrinter ? cashierPrinter.name : "Cashier"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { setPrinterSelectorRole("kitchen"); setPrinterSelectorVisible(true); }}
            className={`flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-xl ${
              kitchenPrinter ? "bg-orange-50" : "bg-gray-100"
            }`}
          >
            <ChefHat size={13} color={kitchenPrinter ? "#f97316" : "#aaa"} />
            <Text className={`text-xs font-extrabold ${kitchenPrinter ? "text-orange-500" : "text-gray-400"}`}>
              {kitchenPrinter ? kitchenPrinter.name : "Kitchen"}
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
              onPrintKitchenPress={(order) => handlePrint(order, "kitchen")}
              onPrintBillPress={(order) => handlePrint(order, "bill")}
            />
          ))}
          {paid.map((o) => (
            <OrderCard 
              key={o.id} 
              order={o} 
              onPrintKitchenPress={(order) => handlePrint(order, "kitchen")}
              onPrintBillPress={(order) => handlePrint(order, "bill")}
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