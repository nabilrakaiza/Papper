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
  cancelOrderWithPin: (orderId: number, pin: string) => Promise<{ success: boolean; error: string | null }>;
  markItemsSent: (orderId: number) => Promise<{ error: string | null }>;
  markPaid: (id: number, discount: number, methodOfPayment: string, paymentAmount: number) => Promise<{ error: string | null }>;
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
        setError("Gagal memuat pesanan. Periksa koneksi Anda.");
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
        methodOfPayment: o.method_of_payment,
        isDineIn: o.is_dine_in,
        paymentAmount: o.payment_amount,
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
          stockWarning: `Stok menipis: ${names}. Tetap lanjutkan?`,
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
        method_of_payment: order.methodOfPayment,
        is_dine_in: order.isDineIn,
        payment_amount: order.paymentAmount
      })
      .select()
      .single();

    if (orderError || !newOrder) {
      return { error: "Gagal membuat pesanan. Silakan coba lagi." };
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
      return { error: "Gagal menyimpan item pesanan. Silakan coba lagi." };
    }

    // 3. Deduct stock — pass p_force if user confirmed
    const { error: stockError } = await supabase.rpc("deduct_stock_for_order", {
      p_order_id: newOrder.id,
      p_force: force,
    });

    if (stockError) {
      await supabase.from("orders").delete().eq("id", newOrder.id);
      if (stockError.message.includes("Insufficient stock")) {
        return { error: "Pesanan diblokir — satu atau lebih bahan habis." };
      }
      return { error: "Gagal memperbarui stok. Silakan coba lagi." };
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
      return { error: "Gagal memperbarui pesanan. Silakan coba lagi." };
    }

    // 2. Handle cancellation
    if (updated.status === "cancelled") {
      const { error: cancelItemsError } = await supabase
        .from("order_items")
        .update({ is_cancelled: true })
        .eq("order_id", id);

      if (cancelItemsError) {
        return { error: "Gagal membatalkan item pesanan. Silakan coba lagi." };
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
        return { error: "Gagal mengambil item pesanan yang ada. Silakan coba lagi." };
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
            stockWarning: `Stok menipis: ${names}. Tetap lanjutkan?`,
          };
        }
      }

      // Replace items
      const { error: deleteError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", id);

      if (deleteError) {
        return { error: "Gagal memperbarui item pesanan. Silakan coba lagi." };
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
        return { error: "Gagal memperbarui item pesanan. Silakan coba lagi." };
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
          return { error: "Pembaruan diblokir — satu atau lebih bahan habis." };
        }
        return { error: "Gagal memperbarui stok. Silakan coba lagi." };
      }
    }

    await fetchOrders();
    return { error: null };
  };

  const cancelOrderWithPin = async (orderId: number, pin: string) => {
    // v2 returns { ok, reason, ... } so a lockout can be told apart from a wrong
    // PIN. The v1 boolean RPC still exists for installs on the older build.
    const { data, error } = await supabase.rpc("cancel_order_with_pin_v2", {
      p_order_id: orderId,
      p_pin: pin,
    });

    if (error) return { success: false, error: "Terjadi kesalahan" };

    if (!data?.ok) {
      if (data?.reason === "locked_out") {
        const minutes = Math.ceil((data.retry_after_seconds ?? 0) / 60);
        return {
          success: false,
          error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`,
        };
      }

      const left = data?.attempts_left ?? 0;
      return {
        success: false,
        error: left > 0 ? `PIN salah. Sisa ${left} percobaan.` : "PIN salah.",
      };
    }

    // sync local state the same way updateOrder does. The RPC cancels the line
    // items alongside the order, so mirror both.
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "cancelled",
              items: o.items.map((i) => ({ ...i, isCancelled: true })),
            }
          : o
      )
    );

    return { success: true, error: null };
  };

  // Targeted update rather than going through updateOrder, which replaces the
  // whole item set with a delete + reinsert. That is blocked on paid orders, and
  // would also reset is_stock_deducted and discard the existing row ids just to
  // flip a boolean.
  const markItemsSent = async (orderId: number): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("order_items")
      .update({ is_sent: true })
      .eq("order_id", orderId);

    if (error) {
      return { error: "Gagal memperbarui status terkirim." };
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, items: o.items.map((i) => ({ ...i, isSent: true })) }
          : o
      )
    );

    return { error: null };
  };

  const markPaid = async (id: number, discount: number, methodOfPayment: string, paymentAmount: number): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "paid", discount: discount, method_of_payment: methodOfPayment, payment_amount: Math.round(paymentAmount)})
      .eq("id", id);

    if (error) {
      return { error: "Gagal mengonfirmasi pembayaran. Silakan coba lagi." };
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
        cancelOrderWithPin,
        markItemsSent,
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