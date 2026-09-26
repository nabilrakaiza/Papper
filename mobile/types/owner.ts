// Shapes returned by the owner_* report functions
// (supabase/migrations/20260926100100_owner_reports.sql). Money is integer
// Rupiah except where noted; dates are Asia/Jakarta "YYYY-MM-DD".

export type SalesSummary = {
  transactions: number;
  /** Σ price × qty, before discount and tax. */
  gross: number;
  /** Gross less discounts, rounded per order. */
  net: number;
  discount: number;
  /** Collected less net. Shown on its own, never counted as revenue. */
  tax: number;
  /** What the customers actually paid: net + tax. Equals Penjualan's total. */
  collected: number;
};

export type SalesCosting = {
  cogs: number;
  /** Net sales of lines whose menu has an HPP. */
  costed_net: number;
  /** Net sales of lines with no HPP: custom items and menus never costed. */
  uncosted_net: number;
};

export type DailySales = { date: string; gross: number; net: number; orders: number };
export type WeekdaySales = { dow: number; gross: number; orders: number };
export type HourlySales = { hour: number; gross: number; orders: number };

export type ItemSales = {
  /** Null for a custom off-menu item. */
  menu_id: number | null;
  name: string;
  /** The menu's current category; "Custom" for off-menu items. */
  category: string;
  qty: number;
  gross: number;
  net: number;
  /** Null when the menu has no HPP set. */
  cogs: number | null;
};

export type PaymentMethodSales = {
  /** Null for a paid order with no payment row. */
  method: string | null;
  /** Payers, not orders: a split bill counts once per payer. */
  count: number;
  amount: number;
};

export type SalesReport = {
  summary: SalesSummary;
  costing: SalesCosting;
  daily: DailySales[];
  weekday: WeekdaySales[];
  hourly: HourlySales[];
  items: ItemSales[];
  payments: PaymentMethodSales[];
};

export type OrderStatus = "unpaid" | "paid" | "cancelled";

export type OwnerOrderRow = {
  id: number;
  daily_number: number | null;
  created_at: string;
  customer_name: string | null;
  seat: string | null;
  is_dine_in: boolean | null;
  status: OrderStatus;
  discount: number;
  /** Times the order was reopened to correct it after payment. 0 = never. */
  reopen_seq: number;
  item_count: number;
  /** orderTotal(): charged if paid, current if open, forgone if cancelled. */
  total: number;
  methods: string[];
};

export type OwnerOrdersPage = { total_count: number; rows: OwnerOrderRow[] };

export type PurchaseItem = {
  stock_id: number | null;
  name: string;
  unit: string | null;
  purchases: number;
  quantity: number;
  spend: number;
  min_price: number;
  max_price: number;
  /** Unit price of the earliest purchase in the period. */
  first_price: number;
  /** Unit price of the latest purchase in the period. */
  last_price: number;
  last_bought: string;
};

export type PurchaseReport = {
  summary: { spend: number; purchases: number; items: number };
  items: PurchaseItem[];
  daily: { date: string; spend: number; purchases: number }[];
};
