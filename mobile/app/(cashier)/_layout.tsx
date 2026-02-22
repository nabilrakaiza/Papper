import { Slot } from "expo-router";
import { OrderProvider } from "../../context/OrderContext";

export default function CashierLayout() {
  return (
    <OrderProvider>
      <Slot />
    </OrderProvider>
  );
}