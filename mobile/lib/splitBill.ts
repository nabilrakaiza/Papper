// Splitting one bill between several payers.
//
// The order stays a single order; `customer_num` on each line says who settles
// it, and a row in `order_payments` says what they handed over. Everything here
// reads those two facts — nothing in this file writes.
//
// Shares are rounded independently, through the same `orderTotal` the receipt
// and every report use. Three shares can therefore sum to a rupiah or two away
// from the whole order's total. That is the right direction: each figure is
// what was actually charged to, and printed for, that person.
import { Order, OrderItem, OrderPayment } from "../types/order";
import { orderTotal } from "./constants";

/** Lines belonging to one payer. */
export function itemsForPayer(order: Order, customerNum: number): OrderItem[] {
  return order.items.filter((i) => (i.customerNum ?? 1) === customerNum);
}

/**
 * Every payer on the order, in order.
 *
 * Derived from the line items rather than from a stored count, so it cannot
 * disagree with them — a payer only exists while something is assigned to them.
 */
export function payerNumbers(order: Order): number[] {
  const seen = new Set(order.items.map((i) => i.customerNum ?? 1));
  return [...seen].sort((a, b) => a - b);
}

/** An order is split once its lines name more than one payer. */
export function isSplit(order: Order): boolean {
  return payerNumbers(order).length > 1;
}

export function payerSubtotal(order: Order, customerNum: number): number {
  return itemsForPayer(order, customerNum).reduce(
    (sum, i) => sum + i.price * i.quantity,
    0
  );
}

/** What this payer owes: their lines, less their share of the discount, plus tax. */
export function payerTotal(
  order: Order,
  customerNum: number,
  discountPct: number
): number {
  return orderTotal(payerSubtotal(order, customerNum), discountPct);
}

export function paymentFor(
  order: Order,
  customerNum: number
): OrderPayment | undefined {
  return order.payments.find((p) => p.customerNum === customerNum);
}

/** Internal: `unpaidPayers` is the shape screens actually ask for. */
function hasPaid(order: Order, customerNum: number): boolean {
  return paymentFor(order, customerNum) !== undefined;
}

/** Payers who still owe something. Empty means the order is ready to close. */
export function unpaidPayers(order: Order): number[] {
  return payerNumbers(order).filter((n) => !hasPaid(order, n));
}

/**
 * What the order has actually taken so far — the shares as they were charged,
 * not a recomputed total.
 */
export function amountCollected(order: Order): number {
  return order.payments.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * The default name for a payer, when the cashier hasn't typed one.
 *
 * Indonesian, like every other staff-facing string in the app.
 */
export function defaultPayerLabel(customerNum: number): string {
  return `Pelanggan ${customerNum}`;
}

/**
 * Whether the bill can still be re-divided.
 *
 * Once anyone has paid, their lines are frozen by the database and the split
 * they paid against has to stand — re-dividing now would mean someone was
 * charged for something the order no longer says they bought.
 */
export function canResplit(order: Order): boolean {
  return order.payments.length === 0;
}
