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
 * Primarily derived from the line items rather than from a stored count, so it
 * cannot disagree with them — a payer exists while something is assigned to
 * them.
 *
 * **Plus anyone who has already handed money over.** A correction unlocks every
 * line, which means the cashier can delete a payer's last item; on the item set
 * alone that payer would simply cease to exist, and with them the record that
 * they are owed a refund. Their card would never render, they would never block
 * the order from closing, and the cafe would quietly keep their money while the
 * books showed revenue for the remaining payers only.
 *
 * So a payer with payment history stays in the set. With no lines left their
 * share computes to 0, which makes their outstanding the full negative of what
 * they paid — exactly the refund they are due.
 *
 * This adds nothing on an order that has never been corrected: the per-payer
 * lock refuses to delete a settled payer's rows, so there they always have
 * lines.
 */
export function payerNumbers(order: Order): number[] {
  const seen = new Set(order.items.map((i) => i.customerNum ?? 1));
  for (const p of order.payments) seen.add(p.customerNum);
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

/**
 * What this payer handed over in the round the order is currently in.
 *
 * Scoped to the round because `order_payments` is append-only: after a
 * correction the original row is still there, and matching on payer alone would
 * find it and report someone as settled who has not yet paid the difference.
 */
export function paymentFor(
  order: Order,
  customerNum: number
): OrderPayment | undefined {
  return order.payments.find(
    (p) => p.customerNum === customerNum && p.reopenSeq === order.reopenSeq
  );
}

/** Every row this payer has, across all rounds, oldest first. */
export function paymentsFor(order: Order, customerNum: number): OrderPayment[] {
  return order.payments
    .filter((p) => p.customerNum === customerNum)
    .sort((a, b) => a.reopenSeq - b.reopenSeq);
}

/**
 * The net already taken from this payer before the current round — what they
 * are owed credit for when the corrected bill is worked out.
 */
export function collectedFromPayer(order: Order, customerNum: number): number {
  return order.payments
    .filter((p) => p.customerNum === customerNum && p.reopenSeq < order.reopenSeq)
    .reduce((sum, p) => sum + p.amount, 0);
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
 *
 * Every row, every round. A correction that handed money back is a negative
 * row, so this is the net in the till and needs no special case to stay right.
 */
export function amountCollected(order: Order): number {
  return order.payments.reduce((sum, p) => sum + p.amount, 0);
}

/** An order that has been reopened at least once to correct it. */
export function isCorrected(order: Order): boolean {
  return order.reopenSeq > 0;
}

/**
 * What still has to move to settle this payer, for the corrected bill.
 *
 * Positive means they owe that much more, negative means it goes back to them,
 * zero means the correction left their share untouched and no row is written at
 * all — `order_payments` refuses a correction row that records nothing moving.
 */
export function outstandingForPayer(
  order: Order,
  customerNum: number,
  discountPct: number
): number {
  return (
    payerTotal(order, customerNum, discountPct) -
    collectedFromPayer(order, customerNum)
  );
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
 *
 * Round-aware, so a correction *can* re-divide the bill. That is safe only
 * because `payerNumbers` keeps anyone with payment history in the payer set: a
 * payer whose lines all move away does not cease to exist, they end up with a
 * share of 0 and are owed back everything they paid. Each payer then settles
 * their own difference and the order still reconciles against its items.
 *
 * Without that guarantee this has to be `order.payments.length === 0`, because
 * a re-divide would otherwise strand the vanished payer's money with no card to
 * credit it against and the cafe would keep it. The two belong together.
 */
export function canResplit(order: Order): boolean {
  return !order.payments.some((p) => p.reopenSeq === order.reopenSeq);
}
