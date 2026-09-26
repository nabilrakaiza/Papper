// Single source of truth for values shared across order/sales/receipt calculations.
// owner_sales_report and owner_orders repeat it in SQL
// (20260926100100_owner_reports.sql); change them together.
export const TAX_RATE = 0.1;

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
 * What an order actually costs the customer: subtotal, less the discount, plus
 * tax, rounded to the rupiah.
 *
 * Rounded per order rather than per report, because the rounded figure is what
 * was charged and printed — summing unrounded totals produces a revenue number
 * that disagrees with the till by a few rupiah and cannot be traced back.
 *
 * The discount is clamped: the column is CHECK (0..100), but this also has to
 * survive a half-typed value from an input field.
 */
export function orderTotal(subtotal: number, discountPct: number): number {
  const safeDiscount = Math.min(Math.max(0, discountPct || 0), 100);
  return Math.round(subtotal * (1 - safeDiscount / 100) * (1 + TAX_RATE));
}
