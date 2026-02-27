import { Slot } from "expo-router";
import { OrderProvider } from "../../context/OrderContext";
import { PrinterProvider } from "../../context/PrinterContext";

export default function CashierLayout() {
  return (
    <PrinterProvider>
      <OrderProvider>
        <Slot />
      </OrderProvider>
    </PrinterProvider>
  );
}