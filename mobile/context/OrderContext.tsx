import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Order, MenuItem } from "../types/order";
import { supabase } from "../lib/supabase";

type OrderContextType = {
  orders: Order[];
  menu: MenuItem[];
  loading: boolean;
  error: string | null;
  addOrder: (order: Omit<Order, "id" | "createdAt">, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
  updateOrder: (id: number, order: Partial<Order>, force?: boolean) => Promise<{ error: string | null; stockWarning?: string }>;
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
            isStockDeducted: i.is_stock_deducted,
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

  const addOrder = async (
    order: Omit<Order, "id" | "createdAt">,
    force = false
  ): Promise<{ error: string | null; stockWarning?: string }> => {

    // 1. Pre-check stock BEFORE inserting anything (only if not forcing)
    if (!force) {
      const { data: checkData, error: checkError } = await supabase.rpc(
        "check_stock_for_order",
        {
          p_items: order.items.map((i) => ({
            menu_id: i.menuId,
            quantity: i.quantity,
          })),
        }
      );

      if (!checkError && checkData?.shortages?.length > 0) {
        const names = checkData.shortages.map((s: any) => s.stock_name).join(", ");
        return {
          error: null,
          stockWarning: `Low stock: ${names}. Proceed anyway?`,
        };
      }
    }

    // 2. Insert order (same as before)
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
        is_stock_deducted: false,
      }))
    );

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", newOrder.id);
      return { error: "Failed to save order items. Please try again." };
    }

    // 3. Deduct stock — pass p_force if user confirmed
    const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
      p_order_id: newOrder.id,
      p_force: force,
    });

    if (stockError) {
      await supabase.from("orders").delete().eq("id", newOrder.id);
      if (stockError.message.includes("Insufficient stock")) {
        return { error: "Order blocked — one or more ingredients are out of stock." };
      }
      return { error: "Failed to update stock. Please try again." };
    }

    await fetchOrders();
    return { error: null };
  };

  const updateOrder = async (
    id: number,
    updated: Partial<Order>,
    force = false
  ): Promise<{ error: string | null; stockWarning?: string }> => {
    // 1. Update order-level fields
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

    // 2. Handle cancellation
    if (updated.status === "cancelled") {
      const { error: cancelItemsError } = await supabase
        .from("order_items")
        .update({ is_cancelled: true })
        .eq("order_id", id);

      if (cancelItemsError) {
        return { error: "Failed to cancel order items. Please try again." };
      }
    }

    // 3. Handle item updates
    if (updated.items) {
      // Fetch original items first so we can revert if something goes wrong
      const { data: originalData, error: fetchError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id);

      if (fetchError || !originalData) {
        return { error: "Failed to fetch existing order items. Please try again." };
      }

      const originalItems = originalData.map((i: any) => ({
        order_id: id,
        menu_id: i.menu_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        category: i.category,
        is_sent: i.is_sent ?? false,
        is_cancelled: i.is_cancelled ?? false,
        print_batch: i.print_batch ?? 1,
        notes: i.notes ?? null,
        is_stock_deducted: i.is_stock_deducted ?? false,
      }));

      // Pre-check stock before touching anything (skip if forcing)
      if (!force) {
        const { data: checkData, error: checkError } = await supabase.rpc(
          "check_stock_for_order",
          {
            p_items: updated.items.map((i) => ({
              menu_id: i.menuId,
              quantity: i.quantity,
            })),
          }
        );

        if (!checkError && checkData?.shortages?.length > 0) {
          const names = checkData.shortages
            .map((s: any) => s.stock_name)
            .join(", ");
          return {
            error: null,
            stockWarning: `Low stock: ${names}. Proceed anyway?`,
          };
        }
      }

      // Replace items
      const { error: deleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", id);

      if (deleteError) {
        return { error: "Failed to update order items. Please try again." };
      }

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
          is_stock_deducted: false,
        }))
      );

      if (itemsError) {
        // Revert to original items
        await supabase.from("order_items").insert(originalItems);
        return { error: "Failed to update order items. Please try again." };
      }

      // Deduct stock
      const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
        p_order_id: id,
        p_force: force,
      });

      if (stockError) {
        // Revert to original items
        await supabase.from("order_items").delete().eq("order_id", id);
        const { error: revertError } = await supabase
          .from("order_items")
          .insert(originalItems);

        if (revertError) {
          console.error("CRITICAL: Failed to revert order items after stock error:", revertError);
        }

        if (stockError.message.includes("Insufficient stock")) {
          return { error: "Update blocked — one or more ingredients are out of stock." };
        }
        return { error: "Failed to update stock. Please try again." };
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