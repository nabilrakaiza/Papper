// Single source of truth for values shared across order/sales/receipt calculations.

/**
 * The tax a new order starts with, as a whole-number percentage.
 *
 * Only a default: each order carries its own rate in `orders.tax`, which the
 * cashier can change on the payment screen until the first payment lands. The
 * column's database default is the same 10 (20260929100000_order_tax.sql), and
 * that is what an order gets when a build that predates the column creates it.
 */
export const DEFAULT_TAX_PCT = 10;

/**
 * The flat "Tambahan" the HPP screen adds on top of a menu's ingredient or
 * manual cost to get its HPP.
 *
 * owner_sales_report (supabase/migrations/20260926100100_owner_reports.sql)
 * applies the same 10% in SQL; change both together or the owner's gross profit
 * stops agreeing with the HPP screen.
 */
export const ADDITIONAL_COGS_PERCENT = 10;

/**
 * A percentage typed into, or read back for, the discount or tax: clamped to
 * 0–100. Both columns are CHECK (0..100), but a half-typed input field is not.
 */
export function clampPercent(pct: number): number {
  return Math.min(Math.max(0, pct || 0), 100);
}

/**
 * What an order actually costs the customer: subtotal, less the discount, plus
 * tax, rounded to the rupiah.
 *
 * Rounded per order rather than per report, because the rounded figure is what
 * was charged and printed — summing unrounded totals produces a revenue number
 * that disagrees with the till by a few rupiah and cannot be traced back.
 *
 * Both percentages are the order's own — `orders.discount` and `orders.tax`.
 * The tax is required rather than defaulted so that no caller can quietly fall
 * back to 10% for an order charged at something else.
 *
 * owner_sales_report and owner_orders repeat this in SQL, in the same float
 * operation order (see 20260929100000_order_tax.sql); change them together.
 * `1 + tax / 100` is the same double as the old `1 + 0.1` at 10%, so every
 * total recorded before the rate became editable comes out unchanged.
 */
export function orderTotal(subtotal: number, discountPct: number, taxPct: number): number {
  const safeDiscount = clampPercent(discountPct);
  const safeTax = clampPercent(taxPct);
  return Math.round(subtotal * (1 - safeDiscount / 100) * (1 + safeTax / 100));
}
