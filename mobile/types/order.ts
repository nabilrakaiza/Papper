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
   * Only known for items that came from the menu — order_items has no category
   * column, so this is undefined for anything read back from the database.
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
  /** This payer's share of the bill — the revenue figure. */
  amount: number;
  /** Cash handed over, for working out change. Null for every other method. */
  amountTendered: number | null;
  methodOfPayment: string;
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
};

export type Order = {
  id: number;
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
   * even though the order as a whole is still unpaid.
   */
  payments: OrderPayment[];
};

export type MenuCategory = "Ayam" | "Nasi" | "Sapi" | "Udang"|
    "Ikan"| "Steak"| "Burger"| "Pasta"| "Additions"| "Snacks"|
    "Coffee"| "Drinks"| "Milkshake"| "Juice"| "Dessert"| "Pastry";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: MenuCategory;
  available: boolean;
};
