import { Order } from "../types/order";

export async function printReceipt(order: Order) {
  // No Bluetooth printer on web — no-op or fallback behavior
  console.warn("Printing is not supported on web.");
  // Optionally: trigger a browser print dialog, or generate a PDF instead
}