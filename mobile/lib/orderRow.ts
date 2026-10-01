// Reading an order back from the database.
//
// Shared by the order list, which holds every open order and today's paid ones,
// and the order detail screen, which reads one order of any age. Both have to
// produce the same `Order`, because the split-bill helpers, the receipt and the
// editor all work from it.
import { Order, OrderPayment } from "../types/order";
import { DEFAULT_TAX_PCT } from "./constants";

/**
 * The select that every mapped order is read with.
 *
 * The category comes through the menu, because order_items has no column for
 * it: tickets and receipts sort by it, and the in-memory menu only holds active
 * dishes, so a dish retired mid-shift would lose its place.
 */
export const ORDER_SELECT = "*, order_items(*, menus(category)), order_payments(*)";

export function toOrder(o: any): Order {
  return {
    id: o.id,
    dailyNumber: o.daily_number ?? null,
    customerName: o.customer_name,
    seat: o.seat,
    discount: o.discount,
    // Every row has one once the column exists — the migration gave every
    // existing order 10. The fallback only covers a build pointed at a
    // database that has not been migrated yet.
    tax: o.tax ?? DEFAULT_TAX_PCT,
    status: o.status,
    createdAt: new Date(o.created_at),
    isDineIn: o.is_dine_in,
    // 0 for every order that has never been corrected, which is also the
    // column's default — so a row written before the column existed, or
    // by anything that does not know about it, reads as "never".
    reopenSeq: o.reopen_seq ?? 0,
    // The whole payment record: one row for an ordinary order, one per
    // payer for a split bill, one more per payer for each correction, and
    // none at all while it is still open. Sorted so the payer cards on the
    // payment screen keep a stable order, then by round so a payer's
    // history reads oldest first.
    payments: (o.order_payments ?? [])
      .map((p: any) => ({
        id: p.id,
        customerNum: p.customer_num,
        customerLabel: p.customer_label ?? null,
        amount: p.amount,
        amountTendered: p.amount_tendered ?? null,
        methodOfPayment: p.method_of_payment,
        reopenSeq: p.reopen_seq ?? 0,
        approvedBy: p.approved_by ?? null,
        createdAt: new Date(p.created_at),
      }))
      .sort(
        (a: OrderPayment, b: OrderPayment) =>
          a.customerNum - b.customerNum || a.reopenSeq - b.reopenSeq
      ),
    // An order with no rows in order_items comes back as [], but a failed
    // embed comes back as null — don't map straight off it.
    items: (o.order_items ?? []).map((i: any) => ({
      // Carried so an edit can name the row it is changing rather than
      // replacing the whole set, and so a line can be assigned to a payer.
      id: i.id,
      // null for a custom off-menu item
      menuId: i.menu_id ?? null,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      // Undefined for a custom item, which has no menu row behind it.
      category: i.menus?.category ?? undefined,
      // Updated to map from DB snake_case to app camelCase
      isSent: i.is_sent ?? false,
      isCancelled: i.is_cancelled ?? false,
      printBatch: i.print_batch ?? 1,
      note: i.notes ?? undefined,
      // How much of this line stock has already funded. Falls back to the
      // old boolean so a row written by a build that predates the column
      // still reads as fully funded rather than as never deducted, which
      // would take its ingredients out a second time.
      stockDeductedQty:
        i.stock_deducted_qty ?? (i.is_stock_deducted ? i.quantity : 0),
      customerNum: i.customer_num ?? 1,
    })),
  };
}
