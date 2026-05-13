import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Order, MenuItem } from "../types/order";
import { supabase } from "../lib/supabase";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  loading: boolean;
  error: string | null;
  addOrder: (order: Omit<Order, "id" | "createdAt">) => Promise<{ error: string | null }>;
  updateOrder: (id: number, order: Partial<Order>) => Promise<{ error: string | null }>;
  markPaid: (id: number, discount: number) => Promise<{ error: string | null }>;
  toggleMenuAvailability: (menuId: number) => Promise<void>;
  refetch: () => Promise<void>;
};

const OrderContext = createContext<OrderContextType>({} as OrderContextType);

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenu = async () => {
    const { data, error } = await supabase.from("menus").select("*");
    if (error) {
      console.error("Failed to fetch menu:", error.message);
      return;
    }
    if (data) setMenu(data);
  };

  const fetchOrders = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch all unpaid orders
    const { data: unpaidData, error: unpaidError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("status", "unpaid")
        .order("created_at", { ascending: false });

    // Fetch today's paid orders only
    const { data: paidData, error: paidError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("status", "paid")
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString())
        .order("created_at", { ascending: false });

    if (unpaidError || paidError) {
        setError("Failed to load orders. Please check your connection.");
        setLoading(false);
        return;
    }

    const combined = [...(unpaidData ?? []), ...(paidData ?? [])];

    setOrders(
        combined.map((o) => ({
        id: o.id,
        customerName: o.customer_name,
        seat: o.seat,
        discount: o.discount,
        status: o.status,
        createdAt: new Date(o.created_at),
        items: o.order_items.map((i: any) => ({
            menuId: i.menu_id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            category: i.category,
            // Updated to map from DB snake_case to app camelCase
            isSent: i.is_sent ?? false,
            isCancelled: i.is_cancelled ?? false,
            printBatch: i.print_batch ?? 1,
            note: i.notes ?? null,
        })),
        }))
    );

    setError(null);
    setLoading(false);
    };

  useEffect(() => {
    fetchMenu();
    fetchOrders();

    const subscription = supabase
      .channel("orders-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const addOrder = async (order: Omit<Order, "id" | "createdAt">): Promise<{ error: string | null }> => {
    const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
        customer_name: order.customerName,
        seat: order.seat,
        discount: order.discount,
        status: order.status,
        })
        .select()
        .single();

    if (orderError || !newOrder) {
        return { error: "Failed to create order. Please try again." };
    }

    // Include new fields in the insert payload
    const { error: itemsError } = await supabase.from("order_items").insert(
        order.items.map((item) => ({
        order_id: newOrder.id,
        menu_id: item.menuId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        is_sent: item.isSent ?? false,
        is_cancelled: item.isCancelled ?? false,
        print_batch: item.printBatch ?? 1,
        notes: item.note ?? null,
        }))
    );

    if (itemsError) {
        await supabase.from("orders").delete().eq("id", newOrder.id);
        return { error: "Failed to save order items. Please try again." };
    }

    // Deduct stock
    const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
        p_order_id: newOrder.id,
    });

    if (stockError) {
        // Rollback order and items
        await supabase.from("orders").delete().eq("id", newOrder.id);

        if (stockError.message.includes("Insufficient stock")) {
        return { error: "Order blocked — one or more ingredients are out of stock." };
        }
        return { error: "Failed to update stock. Please try again." };
    }

    await fetchOrders();

    return { error: null };
    };

  const updateOrder = async (id: number, updated: Partial<Order>): Promise<{ error: string | null }> => {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        ...(updated.customerName && { customer_name: updated.customerName }),
        ...(updated.seat && { seat: updated.seat }),
        ...(updated.discount !== undefined && { discount: updated.discount }),
        ...(updated.status && { status: updated.status }),
      })
      .eq("id", id);

    if (updateError) {
      return { error: "Failed to update order. Please try again." };
    }

    if (updated.status === "cancelled") {
      const { error: cancelItemsError } = await supabase
        .from("order_items")
        .update({ is_cancelled: true })
        .eq("order_id", id);

      if (cancelItemsError) {
        return { error: "Failed to cancel order items. Please try again." };
      }
    }

    if (updated.items) {
      await supabase.from("order_items").delete().eq("order_id", id);
      
      // Include new fields in the re-insert payload
      const { error: itemsError } = await supabase.from("order_items").insert(
        updated.items.map((item) => ({
          order_id: id,
          menu_id: item.menuId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          is_sent: item.isSent ?? false,
          is_cancelled: item.isCancelled ?? false,
          print_batch: item.printBatch ?? 1,
          notes: item.note ?? null,
        }))
      );

      if (itemsError) {
        return { error: "Failed to update order items. Please try again." };
      }
    }

    await fetchOrders();

    return { error: null };
  };

  const markPaid = async (id: number, discount: number): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "paid", discount })
      .eq("id", id);

    if (error) {
      return { error: "Failed to confirm payment. Please try again." };
    }

    await fetchOrders();

    return { error: null };
  };

  const toggleMenuAvailability = async (menuId: number) => {
    const item = menu.find((m) => m.id === menuId);
    if (!item) return;

    // Optimistic update
    setMenu((prev) =>
      prev.map((m) => (m.id === menuId ? { ...m, available: !m.available } : m))
    );

    const { error } = await supabase
      .from("menus")
      .update({ available: !item.available })
      .eq("id", menuId);

    if (error) {
      // Revert on failure
      setMenu((prev) =>
        prev.map((m) => (m.id === menuId ? { ...m, available: item.available } : m))
      );
    }
  };

  return (
    <OrderContext.Provider
      value={{
        orders,
        menu,
        loading,
        error,
        addOrder,
        updateOrder,
        markPaid,
        toggleMenuAvailability,
        refetch: fetchOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export const useOrders = () => useContext(OrderContext);