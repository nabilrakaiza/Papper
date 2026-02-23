export type OrderStatus = "unpaid" | "paid" | "cancelled";

export type OrderItem = {
  menuId: number;
  name: string;
  price: number;
  quantity: number;
  category: MenuCategory;
};

export type Order = {
  id: number;
  customerName: string;
  seat: string;
  items: OrderItem[];
  discount: number; // percentage 0-100
  status: OrderStatus;
  createdAt: Date;
};

export type MenuCategory = "Ayam" | "Nasi" | "Sapi" | "Minuman" | "Lainnya";

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  category: MenuCategory;
  available: boolean;
};