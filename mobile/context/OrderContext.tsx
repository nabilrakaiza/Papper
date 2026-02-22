import { createContext, useContext, useState, ReactNode } from "react";
import { Order, MenuItem } from "../types/order";
import { DUMMY_MENU } from "../data/menu";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  addOrder: (order: Omit<Order, "id" | "createdAt">) => void;
  updateOrder: (id: number, order: Partial<Order>) => void;
  markPaid: (id: number, discount: number) => void;
  toggleMenuAvailability: (menuId: number) => void;
};

const OrderContext = createContext<OrderContextType>({} as OrderContextType);

const DUMMY_ORDERS: Order[] = [
  {
    id: 1,
    customerName: "Bu Aliyah",
    seat: "A1",
    items: [
      { menuId: 1, name: "Ayam Goreng", price: 35000, quantity: 2, category: "Ayam" },
      { menuId: 9, name: "Es Teh", price: 8000, quantity: 2, category: "Minuman" },
    ],
    discount: 0,
    status: "paid",
    createdAt: new Date(),
  },
  {
    id: 2,
    customerName: "Pak Poko",
    seat: "B3",
    items: [
      { menuId: 7, name: "Rendang", price: 40000, quantity: 1, category: "Sapi" },
    ],
    discount: 0,
    status: "paid",
    createdAt: new Date(),
  },
  {
    id: 3,
    customerName: "Peperere",
    seat: "C2",
    items: [
      { menuId: 4, name: "Nasi Goreng", price: 25000, quantity: 1, category: "Nasi" },
      { menuId: 9, name: "Es Teh", price: 8000, quantity: 1, category: "Minuman" },
    ],
    discount: 0,
    status: "unpaid",
    createdAt: new Date(),
  },
];

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(DUMMY_ORDERS);
  const [menu, setMenu] = useState<MenuItem[]>(DUMMY_MENU);

  const addOrder = (order: Omit<Order, "id" | "createdAt">) => {
    setOrders((prev) => [
      ...prev,
      { ...order, id: Date.now(), createdAt: new Date() },
    ]);
  };

  const updateOrder = (id: number, updated: Partial<Order>) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updated } : o))
    );
  };

  const markPaid = (id: number, discount: number) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "paid", discount } : o))
    );
  };

  const toggleMenuAvailability = (menuId: number) => {
    setMenu((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, available: !m.available } : m))
    );
  };

  return (
    <OrderContext.Provider
      value={{ orders, menu, addOrder, updateOrder, markPaid, toggleMenuAvailability }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);