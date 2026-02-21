export type SalesPeriod = "daily" | "weekly" | "monthly";

export type SalesDataPoint = {
  label: string; // e.g. "Mon", "Week 1", "Jan"
  total: number; // in Rupiah
};

export type TopMenuItem = {
  id: number;
  name: string;
  quantity: number;
};