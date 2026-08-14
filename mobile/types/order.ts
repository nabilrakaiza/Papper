export type OrderStatus = "unpaid" | "paid" | "cancelled";

export type OrderItem = {
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
  isStockDeducted?: boolean;
  note?: string;
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
  methodOfPayment: string | null;
  isDineIn: boolean;
  paymentAmount: number | null;
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
