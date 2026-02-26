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
  discount: number;
  status: OrderStatus;
  createdAt: Date;
  note: string | null;
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