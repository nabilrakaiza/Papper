// Single source of truth for values shared across order/sales/receipt calculations.
export const TAX_RATE = 0.1;

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
