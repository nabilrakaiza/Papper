export type OrderStatus = "unpaid" | "paid" | "cancelled";

export type OrderItem = {
  /**
   * The `order_items` row id. Undefined for a line composed in the UI that has
   * not been saved yet — `save_order_items` reads its absence as "insert this".
   * It is also how a line is named when assigning it to a payer: matching on
   * menuId/name/price cannot tell apart two rows for the same dish in
   * different print batches, which is what adding to an order produces.
   */
  id?: number;
  /** NULL for a custom off-menu item priced by the cashier. */
  menuId: number | null;
  name: string;
  price: number;
  quantity: number;
  /**
   * The menu's category for this line. order_items has no column for it, so an
   * order read back from the database gets it through its menu row. Undefined
   * for a custom off-menu item.
   */
  category?: MenuCategory;
  isSent: boolean;
  isCancelled: boolean;
  printBatch: number;
  /**
   * How many units of this line stock has already funded.
   *
   * Not a boolean, because stock is never returned: reduce a line from 5 to 2
   * and 5 units have still left the store. The column keeps saying 5, so
   * raising the line back to 5 costs nothing — only quantity beyond this figure
   * is ever deducted. It is also why the editor refills an existing row before
   * opening a new print batch: that quantity was already made once.
   */
  stockDeductedQty?: number;
  note?: string;
  /**
   * Which payer settles this line once the bill is split. 1 for every line on
   * an unsplit order, which is the column's database default — so a line
   * composed in the UI can leave it unset and land on payer 1.
   */
  customerNum?: number;
};

/**
 * What one person handed over towards a split bill. One row per payer per
 * order; an order settled by a single person has none at all.
 */
export type OrderPayment = {
  id: number;
  customerNum: number;
  /** The name the cashier typed for this payer, for the receipt. */
  customerLabel: string | null;
  /**
   * This payer's share of the bill — the revenue figure.
   *
   * NEGATIVE on a correction that handed money back. The table is append-only:
   * a corrected bill adds a row rather than rewriting the one already there, so
   * summing `amount` gives the net take and every report that does so stays
   * right without knowing corrections exist.
   */
  amount: number;
  /** Cash handed over, for working out change. Null for every other method. */
  amountTendered: number | null;
  methodOfPayment: string;
  /**
   * Which correction round this row settles. 0 is the original payment, which
   * is every row on an order that has never been reopened.
   */
  reopenSeq: number;
  /**
   * The superadmin whose PIN authorised the correction this row settles.
   * Stamped by the database, never by the client. Null on an original payment.
   */
  approvedBy: string | null;
  createdAt: Date;
};

/**
 * An off-menu item being composed in the cashier UI, before it becomes an
 * OrderItem. `uid` only exists client-side: custom items have no menu id, so
 * there is nothing else stable to key React lists and edits by.
 */
export type CustomItemDraft = {
  uid: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
  /**
   * Which payer this line is for, on a split bill. Optional because the compose
   * sheet does not ask — the editor stamps it from whichever payer is selected
   * when the item is added.
   */
  customerNum?: number;
};

export type Order = {
  id: number;
  /**
   * The short number people use for this order: 1 for the first order of the
   * day, restarting at midnight Jakarta time. Assigned by the database, never
   * by the client, and repeats every day — so it is only a label, and `id`
   * stays the identifier. Null only for an order the database has not
   * numbered (a build pointed at a database without the column); show `id`
   * then.
   */
  dailyNumber: number | null;
  customerName: string;
  seat: string;
  items: OrderItem[];
  discount: number;
  status: OrderStatus;
  createdAt: Date;
  isDineIn: boolean;
  /**
   * How this order was paid — the only record of it. One row for an ordinary
   * order, one per payer for a split bill, none at all while it is still open.
   *
   * `orders` used to carry method_of_payment and payment_amount directly, but
   * payment_amount meant two different things depending on the method (the cash
   * tendered, or the bill) and so could not be summed. On a split bill neither
   * column could describe the order at all.
   *
   * On a split bill, a row here also means that payer's line items are frozen,
   * even though the order as a whole is still unpaid — but only while the row
   * belongs to the order's current `reopenSeq`. A correction moves the order to
   * a new round, which releases the lines without deleting what was paid.
   */
  payments: OrderPayment[];
  /**
   * How many times this order has been reopened to correct it. 0 = never.
   *
   * A reopened order goes back to `unpaid` rather than taking a status of its
   * own — it genuinely is open and owing again — so this is what tells the
   * screens apart a fresh order from one being corrected.
   */
  reopenSeq: number;
};

export type MenuCategory = "Ayam" | "Nasi" | "Sapi" | "Udang"|
    "Ikan"| "Steak"| "Burger"| "Pasta"| "Paketan"| "Additions"| "Snacks"|
    "Coffee"| "Drinks"| "Milkshake"| "Juice"| "Dessert"| "Pastry"|
    "Lain Lain";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: MenuCategory;
  available: boolean;
};
