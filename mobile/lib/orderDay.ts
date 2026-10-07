/**
 * The day an order is counted under: the day it was paid, or — while it is
 * still open, or cancelled before it was ever paid — the day it was taken.
 *
 * `orders.paid_at` is stamped by the database the first time an order becomes
 * 'paid' and is kept through a correction, so a reopened order stays on the day
 * it was first settled. This is the same rule sales_report_data applies; a
 * screen that lists orders for a day has to use it too, or its total will not
 * match the report's.
 */

/**
 * A PostgREST `or` filter for orders belonging to the half-open range
 * [from, to) — for `supabase.from("orders").select(...).or(orderDayFilter(...))`.
 *
 * The instants are quoted because an ISO timestamp is full of characters the
 * filter syntax would otherwise read as its own.
 */
export function orderDayFilter(from: string, to: string): string {
  return (
    `and(paid_at.gte."${from}",paid_at.lt."${to}"),` +
    `and(paid_at.is.null,created_at.gte."${from}",created_at.lt."${to}")`
  );
}

/** The instant an order row is dated by. Pair with jakartaDateOf(). */
export function orderInstant(order: { paid_at?: string | null; created_at: string }): string {
  return order.paid_at ?? order.created_at;
}
