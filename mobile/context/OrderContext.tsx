import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Order, MenuItem } from "../types/order";
import { supabase } from "../lib/supabase";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  addOrder: (order: Omit<Order, "id" | "createdAt">) => void;
  updateOrder: (id: number, order: Partial<Order>) => void;
  markPaid: (id: number, discount: number) => void;
  toggleMenuAvailability: (menuId: number) => void;
};

const OrderContext = createContext<OrderContextType>({} as OrderContextType);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch menu from Supabase on mount
  useEffect(() => {
    const fetchMenu = async () => {
      const { data } = await supabase.from("menus").select("*");
      if (data) setMenu(data);
    };
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (data) {
        setOrders(data.map((o) => ({
          id: o.id,
          customerName: o.customer_name,  // ← make sure this line exists
          seat: o.seat,
          discount: o.discount,
          status: o.status,
          createdAt: new Date(o.created_at),
          items: o.order_items.map((i: any) => ({
            menuId: i.menu_id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
        })));
      }
      setLoading(false);
    };

    fetchMenu();
    fetchOrders();
  }, []);

  const addOrder = async (order: Omit<Order, "id" | "createdAt">) => {
    // Insert order
    const { data: newOrder } = await supabase
      .from("orders")
      .insert({
        customer_name: order.customerName,
        seat: order.seat,
        discount: order.discount,
        status: order.status,
      })
      .select()
      .single();

    if (!newOrder) return;

    // Insert order items
    await supabase.from("order_items").insert(
      order.items.map((item) => ({
        order_id: newOrder.id,
        menu_id: item.menuId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }))
    );

    // Refresh orders
    setOrders((prev) => [
      { ...order, id: newOrder.id, createdAt: new Date(newOrder.created_at) },
      ...prev,
    ]);
  };

  const updateOrder = async (id: number, updated: Partial<Order>) => {
    await supabase.from("orders").update({
      customer_name: updated.customerName,
      seat: updated.seat,
      discount: updated.discount,
      status: updated.status,
    }).eq("id", id);

    if (updated.items) {
      // Delete old items and reinsert
      await supabase.from("order_items").delete().eq("order_id", id);
      await supabase.from("order_items").insert(
        updated.items.map((item) => ({
          order_id: id,
          menu_id: item.menuId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        }))
      );
    }

    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...updated } : o))
    );
  };

  const markPaid = async (id: number, discount: number) => {
    await supabase
      .from("orders")
      .update({ status: "paid", discount })
      .eq("id", id);

    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "paid", discount } : o))
    );
  };

  const toggleMenuAvailability = async (menuId: number) => {
    const item = menu.find((m) => m.id === menuId);
    if (!item) return;

    await supabase
      .from("menus")
      .update({ available: !item.available })
      .eq("id", menuId);

    setMenu((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, available: !m.available } : m))
    );
  };

  return (
    <OrderContext.Provider
      value={{orders, menu, addOrder, updateOrder, markPaid, toggleMenuAvailability }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);